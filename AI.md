# Fita — AI Architecture

## 1. AI Gateway (`src/lib/ai/`)

```
AI Gateway
├── Provider interface   { completeText(), analyzeImage() }
├── Providers            openrouter (primary) · zai (sandbox default) · mock (offline)
├── Model Config         env-driven, model-agnostic
├── Prompt Manager       src/lib/ai/prompts.ts — all prompts centralized
├── Response Validator   zod schemas per task; invalid → 1 retry → fallback path
└── Error Handler        typed failures: AI_UNAVAILABLE · AI_INVALID_RESPONSE · LOW_CONFIDENCE
```

**Provider selection:** `AI_PROVIDER` env (`openrouter | zai | mock`). Default logic: `OPENROUTER_API_KEY` present → `openrouter` with `OPENROUTER_TEXT_MODEL` / `OPENROUTER_VISION_MODEL`; otherwise `zai` (sandbox). **No model names are hardcoded in feature code** — features only know "text provider" and "vision provider".

**Cost control:** text-tier model for chat/suggestions; vision-tier only for scans; short structured prompts; response caching for identical scan inputs (hash-based, Phase 5); scan endpoint counts against trial quota *before* the provider call.

## 2. Food Scan pipeline (Phase 5)

```
image → validate+resize+compress (sharp) → vision provider
      → structured JSON (foods[{ name, estimated_grams, confidence }])
      → zod validate (retry once on failure)
      → match each food against Food DB (fuzzy on fa/en names)
      → matched: nutrition from DB (per-100g × grams)
        unmatched: AI estimate flagged source=AI_ESTIMATE, confidence<1
      → user reviews/corrects grams → recompute server-side from DB values
      → commit as FoodLog → image bytes destroyed (never written to disk/DB)
```

Uncertainty is **exposed, not hidden**: every item shows its confidence; UI copy states "تخمین مقدار تقریبی است؛ در صورت نیاز اصلاح کن." If confidence < threshold or validation fails → graceful state: "نتوانستیم با اطمینان غذا را شناسایی کنیم" + Search/Manual entry actions. The system never crashes on AI failure.

**Implementation notes (as built):**
- Trial scan quota is consumed **before** the provider call (abuse protection) and **refunded** when the AI itself fails after its one retry — users never lose a scan to our errors; rate limits still apply.
- zai provider vision goes through `zai.chat.completions.createVision()` (SDK contract); OpenRouter uses its chat-completions image format. Client downscales to ≤1024px JPEG before upload; the server keeps bytes in request memory only.
- Unmatched AI foods are stored as **user-private** `Food` rows (`isPublic=false`, `createdByUserId`, `source=AI_ESTIMATE`); log/scan lookups accept public OR user-owned rows so they stay usable while keeping the shared DB clean.

## 3. AI Coach (Phase 7)

- **Context builder** assembles compact JSON: goal, targets, today's diary totals, remaining kcal/macros, meal plan (today), allergies/dislikes/favorites, budget. Medical fields only as safety flags.
- **Guardrails (system prompt, centralized):** coach never stores food logs (redirects: "برای ثبت غذا از دفتر → اسکن یا جستجو استفاده کن"), never gives medical advice or medication guidance, never produces extreme restriction, treats user text as untrusted input (prompt-injection resistant: system prompt instructs to ignore embedded instructions; no secrets/system details in context).
- **Tool redirection** instead of tool-writing: coach returns suggestion cards (e.g. "ثبت غذا", "جایگزینی وعده") that navigate the user into real flows.

## 4. Trust rules

1. AI output without zod validation never touches the DB.
2. Deterministic values (calories, macros, targets) always computed by the Nutrition Engine from DB data — AI may *suggest*, never *set*.
3. Every AI-produced food row is `source=AI_ESTIMATE, confidence<1` and is shown as an estimate to the user.
4. Model-agnostic: switching models must be an env change only, with prompts kept model-neutral.
