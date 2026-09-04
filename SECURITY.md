# Fita — Security

## Implemented (Phase 1)
| Control | Implementation |
|---|---|
| AuthN | Phone + 6-digit OTP. Code stored only as `sha256(phone:code:JWT_SECRET)`; 120s expiry; max 5 attempts/code; single-use; previous codes invalidated on re-issue. |
| Sessions | `jose` HS256 JWT in **httpOnly, SameSite=Lax, Secure(prod)** cookie, 30d TTL. No tokens in localStorage. |
| Rate limiting | Sliding-window per phone (5/h + 60s cooldown) and per IP (20/h) on OTP routes; in-memory (sandbox), interface ready for Redis. |
| Input validation | zod on every route body/query; phone normalization rejects malformed numbers. |
| AuthZ | All data queries scoped by `userId` from session — user ids never accepted from client payloads. |
| Secrets | Only in env; `JWT_SECRET` required in prod; `.env` never committed; no key ever reaches the client bundle (AI calls are backend-only). |

## Planned (mapped to later phases)
- **Phase 5 (images):** accept only jpeg/png/webp ≤ 8MB pre-validation; `sharp` resize/compress; bytes held in memory only, **never persisted**; deleted immediately after analysis. AI outputs validated by zod before persistence (prompt-injection via image/text cannot write arbitrary data).
- **Phase 7 (coach):** user text treated as untrusted; system prompt instructs to ignore embedded instructions; context contains no secrets, no other users' data.
- **Phase 10 (subscription):** entitlements validated server-side on every gated call; client flags are cosmetic only.
- **Privacy (§49):** export (`/api/account/export`) + hard delete (`/api/account/delete`); medical/medication/weight data never public; leaderboard exposes only display name + score; progress visibility = user-controlled `public/private`.
- **Analytics (§50):** event names + scalar props only, no PII.

## Implemented (Phase 12 — privacy & hardening)
| Control | Implementation |
|---|---|
| Data export | `GET /api/account/export` — full JSON dump of everything stored about the user (account, profile, goals, weights, measurements, allergies/dislikes/diets, favorites, food logs + items, water, meal plans + items, coach conversations, achievements, stats, subscription, notification prefs). Attachment download (`fita-export-YYYY-MM-DD.json`), `no-store`, read-only. Rate-limited 3/min. Never includes scan image bytes (they were never persisted). |
| Account deletion | `POST /api/account/delete` body `{ confirm: true }` (literal required → 422 `CONFIRMATION_REQUIRED` otherwise). **Hard delete** of every user-owned row in child-first FK order inside one transaction — logs/items, water, weights, measurements, goals, profile, meal plans (cascade), coach conversations (cascade), achievements, stats, leaderboard, challenges, analytics, prefs, subscription, payment orders, private custom foods + servings, then the user row. Zero orphans (verified). Session cookie cleared; stale JWT dies because the user row no longer exists (`requireUser` → 401 everywhere). Production note: with a real gateway, `PaymentOrder` rows should be retained anonymized for financial audit. UI: destructive confirm dialog + export card in «حریم خصوصی و داده‌ها» sheet. Rate-limited 3/min. |
| Rate-limit coverage | Every state-changing / AI / payment / DB-heavy route is per-user capped (per-IP on auth + scan): OTP (existing), scan 12/min + IP 40/min, coach 10/min, plan-generate 6/min, plan-swap 20/min, checkout 5/min, verify 10/min, diary-log 60/min, water 60/min, weight 30/min, plan-item 60/min, notif-prefs 20/min, onboarding 10/min, food-search 90/min, export 3/min, delete 3/min. |
| AuthZ audit | Re-swept: no route accepts a `userId` from payload/body/query — all scoping derives from the session (`requireUser`), including nested ownership checks (meal-plan item → day → plan.userId, payment order.userId). Deleted users are locked out at the auth layer (`status !== 'ACTIVE'` / row gone). |

## Error policy
Stable error codes (see API.md); generic 500 message in Persian; internal details only in server logs. No stack traces to clients.
