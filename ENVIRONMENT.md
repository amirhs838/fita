# Fita — Environment & Configuration

Nothing feature-critical is hardcoded: models, trial length, scan limits, safety floors, OTP policy are all config. Copy `.env.example` → `.env`.

## Variables

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:/home/z/my-project/db/custom.db` | SQLite file (PG-portable schema) |
| `JWT_SECRET` | dev fallback ⚠️ | Session signing + OTP hashing salt. **Required in production.** |
| `SESSION_TTL_DAYS` | `30` | Session cookie lifetime |
| `AI_PROVIDER` | auto (`openrouter` if key, else `zai`) | `openrouter` \| `zai` \| `mock` |
| `OPENROUTER_API_KEY` | — | Enables OpenRouter provider |
| `OPENROUTER_TEXT_MODEL` | `openai/gpt-4o-mini` | Text/chat model (coach, planning) |
| `OPENROUTER_VISION_MODEL` | `openai/gpt-4o-mini` | Vision model (food scan) |
| `OTP_PROVIDER` | `dev` | `dev` (code echoed for development) \| `sms` (provider plug-in point) |
| `OTP_TTL_SECONDS` | `120` | Code lifetime |
| `OTP_MAX_ATTEMPTS` | `5` | Per code |
| `OTP_RESEND_COOLDOWN_SECONDS` | `60` | Between sends |
| `OTP_MAX_PER_HOUR_PER_PHONE` / `_IP` | `5` / `20` | Abuse limits |
| `FREE_TRIAL_DAYS` | `3` | Trial length |
| `FREE_SCAN_LIMIT` | `5` | Trial scan quota |
| `PAYMENT_PROVIDER` | `mock` | `mock` (instant simulated payment) \| `zarinpal` (stub until credentials) |
| `PRO_MONTHLY_TOMAN` | `149000` | Monthly plan price (Toman) |
| `PRO_YEARLY_TOMAN` | `1290000` | Yearly plan price (Toman) |
| `ZARINPAL_MERCHANT_ID` | — | Required when `PAYMENT_PROVIDER=zarinpal` |
| `SAFETY_MIN_KCAL_FEMALE` / `_MALE` | `1200` / `1500` | Hard calorie floors |

## Commands

```bash
bun run dev        # dev server :3000 (log: dev.log)
bun run lint       # eslint
bun run db:push    # sync schema
bun run db:generate
```
