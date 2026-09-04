# Fita — API

Base path `/api`. JSON only. **Uniform envelope:**

```jsonc
// success
{ "ok": true, "data": { ... } }
// failure — stable machine `code`, Persian user-facing `message`
{ "ok": false, "error": { "code": "OTP_COOLDOWN", "message": "…" } }
```

Auth = JWT (`HS256`, `jose`) in httpOnly cookie `fita_session` (30d). Guarded routes resolve the user server-side; 401 → client shows auth gate.

## Endpoint map

### ✅ Implemented (Phase 1–4)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/request-otp` | body `{ phone }`. Rate limits: 60s cooldown/phone, 5/h/phone, 20/h/IP. `OTP_PROVIDER=dev` → `data.devCode`. |
| POST | `/api/auth/verify-otp` | body `{ phone, code }`. Verifies → creates user (with trial subscription, stats, notification prefs) or logs in → sets session cookie → `{ user, onboarded, token }`. Errors: `CODE_INVALID`, `CODE_EXPIRED`, `CODE_LOCKED`, `NO_PENDING_CODE`. |
| POST | `/api/auth/logout` | clears cookie |
| GET | `/api/me` | session → `{ user, profile, onboarded, goal, subscription, stats }`; 401 `UNAUTHENTICATED` |
| POST | `/api/profile/onboarding` | full onboarding payload → persists profile/goal/weight/measurements/preferences, runs Nutrition Engine server-side, hard-rejects unsafe targets (`UNSAFE_TARGET`) |
| GET | `/api/summary?date=YYYY-MM-DD` | dashboard backbone: engine-fresh targets + consumed totals + water + loggedMeals |
| GET | `/api/foods/search?q=&limit=` | normalized Persian search (Arabic variants unified); empty `q` → curated staples; servings included. Food detail is embedded in search results (no separate `/api/foods/:id` needed) |
| GET | `/api/diary?date=YYYY-MM-DD` | all logs for the day with snapshotted item macros |
| POST | `/api/diary/log` | body `{ date?, mealType, items:[{ foodId, servingId?, grams?, quantity }] }` → deterministic macro computation from per-100g reference, snapshot into FoodLogItem |
| DELETE | `/api/diary/log/:id` | ownership-checked log removal (items cascade) |
| POST | `/api/water` | body `{ date?, amountMl }` → append entry, returns day total |
| DELETE | `/api/water?date=` | undo: removes most recent entry of the day |

### 📋 Planned
| Phase | Endpoints |
|---|---|
| 2 (residual) | `GET/PATCH /api/profile` (profile editing) · `GET/POST /api/measurements` |
| 3 (residual) | `POST /api/goals` re-target + `PATCH /api/goals/:id` with pace warnings |
| 4 (residual) | favorites (`POST/DELETE /api/foods/:id/favorite`) · `PATCH /api/diary/log/:id` (edit quantity) |
| 5 | `POST /api/scan` (base64 data-URL image → detected foods matched against DB, transient — image never persisted; consumes trial scan BEFORE provider call, refunds on AI failure) · `POST /api/scan/commit` (user-corrected grams → deterministic FoodLog source=SCAN with per-item confidence) |
| 6 | `GET /api/meal-plan` (latest ACTIVE or null) · `POST /api/meal-plan/generate` (7 days, constraint-filtered, archives old) · `POST /api/meal-plan/replace-item` (kcal-±45% same-role swap) · `PATCH /api/meal-plan/items/:id` (status PLANNED/EATEN/SKIPPED) |
| 7 | `GET /api/coach/conversations` (current + messages, rolls over at 40) · `POST /api/coach/message` (context → guarded reply, zod-validated, suggestion whitelist, canned-safe on invalid) |
| 8 | `GET /api/progress` (weight journey + targets + stats + 7-day consistency) · `GET/POST /api/weight` (one per day upsert, syncs profile weight, WEIGHT_LOG_5 at 5 entries) |
| 9 | `GET /api/leaderboard?period=weekly\|monthly` (behavior-only scores, name = «نام X.») · `GET /api/achievements` (catalog + unlocked) · log/scan/plan/water/weight responses carry `awards[]` for toasts · share-card deferred |

### ✅ Implemented (Phase 10–11)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/subscription` | lazy tier sync (trial/PRO end → `EXPIRED`) + full state + plan catalog (Toman, env-priced) |
| POST | `/api/subscription/checkout` | body `{ planId: PRO_MONTHLY \| PRO_YEARLY }` → `PaymentOrder` audit row + provider reference; instant-resolution providers (mock) activate PRO in-request. Rate-limited 5/min. |
| POST | `/api/subscription/verify` | body `{ referenceId }` → user-scoped order → provider verify → activates PRO for plan duration; idempotent for PAID orders; `402 PAYMENT_NOT_CONFIRMED` on failure |
| GET | `/api/notification-preferences` | creates defaults; empty `mealTimesJson` falls back to `DEFAULT_MEAL_TIMES` |
| PATCH | `/api/notification-preferences` | partial zod update; `mealTimes` = 1..6 unique `HH:MM` strings (422 otherwise) |
| GET | `/api/reminders` | server-computed due reminders for today, pref-aware, master-switch `pushEnabled=false` → `[]`; priority MEAL>STREAK>WATER>WEIGHT>PLAN, max 3; stable ids (`TYPE:date[:meal]`) for client dedupe |

### ✅ Implemented (Phase 12 — privacy)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/account/export` | Full data-portability JSON (account, profile, goals, weights, measurements, prefs, logs + items, water, plans, coach chats, achievements, stats, subscription) as `attachment` download. Read-only, rate-limited 3/min. |
| POST | `/api/account/delete` | Body `{ confirm: true }` (422 `CONFIRMATION_REQUIRED` otherwise). Hard-deletes every user-owned row child-first in one tx (zero orphans), clears session cookie; stale JWT → 401 everywhere. Rate-limited 3/min. Production note: retain anonymized `PaymentOrder` rows when a real gateway is used. |

### 📋 Planned
| Phase | Endpoints |
|---|---|
| 2 (residual) | `GET/PATCH /api/profile` (profile editing) · `GET/POST /api/measurements` |
| 3 (residual) | `POST /api/goals` re-target + `PATCH /api/goals/:id` with pace warnings |
| 4 (residual) | favorites (`POST/DELETE /api/foods/:id/favorite`) · `PATCH /api/diary/log/:id` (edit quantity) |

## Conventions

- **Validation:** every body/query parsed by zod → `422 VALIDATION_ERROR`.
- **Authorization:** every query is user-scoped (`userId` from session, never from payload).
- **Sessions:** httpOnly cookie primary (SameSite=None behind HTTPS proxy so the preview iframe works) + `Authorization: Bearer` fallback accepted on every route (client keeps the JWT from verify-otp in localStorage).
- **Rate limiting:** in-memory sliding window (`src/lib/rate-limit.ts`) — per-IP + per-user on all sensitive routes.
- **Idempotency:** write endpoints accept optional `idempotencyKey` (Phase 4+).
- **Naming:** kebab-case paths, SCREAMING_SNAKE error codes, camelCase JSON fields.
