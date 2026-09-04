# Fita — Architecture

## 1. System overview

```
┌────────────────────────────────────────────────────────────┐
│  Client (mobile-first web shell, single / route)           │
│  React 19 · state-based tab navigation · RTL · Vazirmatn   │
└───────────────▲────────────────────────────────────────────┘
                │ fetch (JSON envelope { ok, data | error })
┌───────────────┴────────────────────────────────────────────┐
│  Next.js 16 API Routes (/src/app/api/**)                   │
│  zod validation · rate limiting · JWT auth guard           │
├────────────────────────────────────────────────────────────┤
│  Domain services (src/lib/**)                              │
│  auth · otp · entitlements · nutrition engine · gamification│
├───────────────────────┬────────────────────────────────────┤
│  Data layer           │  AI Gateway (src/lib/ai/)          │
│  Prisma → SQLite      │  providers: openrouter | zai | mock│
│  (PG-portable schema) │  prompt manager · zod validators   │
└───────────────────────┴────────────────────────────────────┘
```

**Layering rules (enforced by convention):**
1. **Presentation** — `src/components/**`, no business logic, no direct DB access.
2. **API layer** — route handlers: parse → validate (zod) → authorize → delegate.
3. **Business logic** — pure, deterministic functions in `src/lib/` (nutrition engine is 100% deterministic, never AI).
4. **Data access** — Prisma via `src/lib/db.ts`, always user-scoped.
5. **AI layer** — isolated in `src/lib/ai/`; every AI output passes zod validation before any business use. AI is an assistant, never the source of truth for deterministic values.

## 2. Client architecture (single-route constraint)

The sandbox exposes only the `/` route. The app is therefore a **state-driven shell**:

- `src/app/page.tsx` — orchestrator: `loading → auth-gate → main shell`.
- Navigation = client state (`home | diary | plan | coach | progress | profile`), rendered inside a max-width mobile frame.
- Bottom tab bar (خانه، دفتر، برنامه، مربی، پیشرفت) + profile via header avatar + floating Scan FAB.
- This maps 1:1 to React Native screens; each tab component is written as a future RN screen would be (props in, callbacks out, data via API client).

## 3. Nutrition Engine (spec — implemented in Phase 3, deterministic & testable)

All functions are pure: `(input) → output`, no IO, no AI. Method documented per formula.

### 3.1 BMR — Mifflin-St Jeor (1990) *(chosen: most validated for general population, recommended by ADA)*
- male: `10·W + 6.25·H − 5·A + 5`
- female: `10·W + 6.25·H − 5·A − 161`

### 3.2 TDEE = BMR × activity factor
| Level | Factor |
|---|---|
| SEDENTARY | 1.2 |
| LIGHT | 1.375 |
| MODERATE | 1.55 |
| ACTIVE | 1.725 |
| VERY_ACTIVE | 1.9 |

### 3.3 Special states (conservative, always with warning + "consult a professional")
- Pregnancy: T1 +0, T2 +340, T3 +452 kcal (IOM). Breastfeeding: +500 kcal.

### 3.4 Goal adjustment (applied to TDEE)
| Goal | Adjustment | Weekly pace cap |
|---|---|---|
| LOSE_WEIGHT | −15% of TDEE | ≤0.75 kg/wk, hard floor 1200 (F) / 1500 (M) kcal |
| MAINTAIN | 0 | — |
| GAIN_WEIGHT | +10% | ≤0.5 kg/wk |
| BUILD_MUSCLE | +10%, protein 1.8–2.2 g/kg | ≤0.5 kg/wk |
| RECOMP | −5%, protein 2.0 g/kg | — |

Unsafe requests (e.g. target implying >cap or below floors) are **rejected/warned in UI, never silently executed**. No extreme restriction, no fasting protocols.

### 3.5 Macros
- Protein: goal-dependent `g/kg` on **target weight** (clamp 1.2–2.4), see table above; maintain default 1.6.
- Fat: 27% of kcal (min 0.8 g/kg).
- Carbs: remainder (≥100 g guard).
- Fiber: 14 g / 1000 kcal (IOM), min 25 g, cap 40 g.

### 3.6 Adaptive logic (Phase 8)
Target calories are **not** auto-adjusted from a single weigh-in. Adjustments require ≥2 weeks of trend data (slope via least-squares on weekly averages) and are capped at ±10% per adjustment.

## 4. Subscription & entitlements

`src/lib/entitlements.ts` derives `FREE_TRIAL | PRO | EXPIRED` from `Subscription` row. Gated features: food scans (count against `scansLimit` during trial), AI coach, meal-plan generation. Tier state is synced **lazily** (`syncSubscriptionTier` — trial/PRO end → EXPIRED persisted, called from `/api/me`, `/api/subscription`, gated routes) so no cron is needed.

Phase 10 implementation: plan catalog (`src/lib/subscription/plans.ts`, Toman prices env-overridable) + provider-agnostic payment interface (`src/lib/payment/provider.ts`) with a `mock` instant-success provider (sandbox default) and a `zarinpal` stub that activates only with credentials. Every checkout writes a `PaymentOrder` audit row; activation always flows through the same verify→activatePro path a real gateway uses. `PAYMENT_PROVIDER` selects the implementation — no gateway is hardcoded.

## 5. Image pipeline (Phase 5 — privacy-first)

`Upload → validate (type/size) → sharp: resize 1024px, compress → vision provider → structured JSON → zod validate → DB match → save result → delete image bytes (never persisted).` Only structured nutrition data + confidence + timestamp are stored.

## 6. Error handling & offline posture

- API: uniform envelope `{ ok:false, error:{ code, message } }` with stable machine codes (`OTP_COOLDOWN`, `LOW_CONFIDENCE`, …).
- Client: every async surface has loading / empty / error states; no blank screens.
- Duplicate-safe: food-log creation accepts an optional client `idempotencyKey` (Phase 4).

## 7. Deliberate deviations from the original brief (reported per product principle §52)

1. **React Native/Expo → mobile-first web client.** Sandbox cannot ship native apps. Same API contracts; tab components structured for later RN reuse.
2. **PostgreSQL → SQLite (Prisma).** Sandbox constraint; schema kept PG-portable (String enums, no arrays, JSON-as-String).
3. **OpenRouter-only → provider-agnostic AI Gateway.** `AI_PROVIDER` env switch; OpenRouter fully supported and primary when a key exists; `zai` provider is the sandbox default; `mock` for offline dev.
4. **Single `/` route with client-side navigation** — sandbox exposes one route; mirrors RN navigation structure.
5. **SMS OTP → pluggable provider with `dev` mode.** Real gateway integration left as a one-function change (`src/lib/otp.ts`), documented in SECURITY.md.
6. **Automated test suite → deferred.** Sandbox rule forbids test code. The nutrition engine is written as pure functions with a documented test plan (see §3 and DATABASE.md §Testing) so a runner can be attached without refactoring.
