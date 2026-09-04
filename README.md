# Fita (فیتا) — AI Nutrition & Food Tracking

Fita is a premium, minimal, fully-Persian (RTL) nutrition app. Core loop:
**Photograph food → AI detects food & portions → nutrition is matched from a structured food database → user corrects → daily diary & targets update.**

## Stack (as actually implemented in this environment)

| Layer | Planned (original brief) | Implemented here | Why |
|---|---|---|---|
| Mobile client | React Native + Expo | **Mobile-first web client (Next.js 16 App Router, single `/` route, installable PWA-style shell)** | This sandbox can only expose a Next.js web app on port 3000. All API contracts are client-agnostic, so a future Expo client can consume the exact same backend with zero backend changes. |
| Backend | Next.js + TypeScript | **Next.js 16 + TypeScript, API Routes** (API-centric, no server actions) | Same |
| Database | PostgreSQL | **Prisma ORM + SQLite** (schema written to be PostgreSQL-portable: no SQLite-only tricks, String-based enums, JSON stored in String columns) | Sandbox constraint. Migration to PG = change `datasource` provider + `DATABASE_URL`. |
| AI | OpenRouter | **AI Gateway with pluggable providers**: `openrouter` (primary, env-configured) / `zai` (sandbox default) / `mock` (offline dev) | Keeps the brief's OpenRouter requirement while remaining functional without a key. Model-agnostic via env vars. |
| Auth | Phone + OTP | **Phone + OTP, JWT session in httpOnly cookie** (`jose`). `OTP_PROVIDER=dev` echoes the code for development; real SMS provider plugs into one interface. | No SMS gateway exists in sandbox. |

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 0 | Product definition, architecture, schema design, API map, AI architecture | ✅ Done (these docs) |
| 1 | Setup, DB schema, Auth (OTP), design system, RTL, navigation shell | ✅ Done |
| 2 | Onboarding (profile, goals, measurements, preferences, allergies, budget…) | ✅ Done |
| 3 | Nutrition engine (BMR/TDEE/targets, safety limits) | ✅ Done |
| 4 | Food system (database, search, servings, favorites, logging) | ✅ Done (143 seeded foods; favorites deferred) |
| 5 | Food vision (scan → detect → correct → save, image never persisted) | ✅ Done (zai sandbox vision / OpenRouter-ready; quota counting + refund-on-AI-failure) |
| 6 | 7-day meal planner (personalized, swappable) | ✅ Done (deterministic constraint engine — AI-free core) |
| 7 | AI Coach (context engine, redirects to food-logging flows) | ✅ Done (guardrails + suggestion cards) |
| 8 | Progress (weight, charts, consistency) | ✅ Done (SVG chart, one weigh-in/day, profile sync) |
| 9 | Gamification + leaderboard + sharing | ✅ Done (XP/levels/streaks/7 badges; behavior-only leaderboard; share-card deferred) |
| 10 | Subscription (3-day trial, 5 scans, entitlements) | ✅ Done (plans catalog + provider-agnostic checkout, mock provider; lazy EXPIRED sync) |
| 11 | Notifications & reminders | ✅ Done (server-computed pref-aware reminder engine + in-app cards + best-effort browser notifications) |
| 12 | QA + security hardening | ✅ Done (privacy export + hard-delete account endpoints with confirm dialog UI, full rate-limit coverage sweep, authZ audit, empty-state sweep) |

## Run

```bash
bun install
bun run db:push     # sync Prisma schema to SQLite
bun run dev         # dev server on :3000 (already running in sandbox)
bun run lint
```

Development OTP: with `OTP_PROVIDER=dev` the verification code is returned in the API response and shown in the UI, and logged to `dev.log`.

## Design system (Phase 13 — premium redesign)

"Premium Minimal Wellness" — Apple-level simplicity for a Persian-first wellness companion:

- **Type**: IRANSans web (300/400/500/700, local woff2, `font-synthesis-weight: none`), Vazirmatn fallback. Dominant tabular numerals for metrics; editorial eyebrow titles instead of heavy headers.
- **Color**: warm off-white canvas + near-black ink, hairline borders; one quiet sage token (`--positive`) reserved for positive states. No rainbow, no heavy shadows.
- **Layout**: 8px rhythm, open editorial sections (`src/components/fita/Section`), grouped iOS-style lists (`fita/List`), thin progress ring (`fita/Ring`), compact `fita/MacroStrip`. Cards only where grouping aids comprehension.
- **Motion**: framer-motion micro-interactions (tab fades, scan shimmer, count transitions) — fast, subtle, reduced-motion aware.
- **Shell**: refined 5-tab bar with dot indicator + single floating scan FAB (the hero action), safe-area aware, fully RTL-native.

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system design, module map, nutrition engine spec
- [DATABASE.md](./DATABASE.md) — schema, entities, decisions
- [API.md](./API.md) — endpoint map & conventions
- [AI.md](./AI.md) — AI gateway, vision pipeline, prompt policy
- [SECURITY.md](./SECURITY.md) — auth, rate limiting, privacy, image handling
- [ENVIRONMENT.md](./ENVIRONMENT.md) — env vars & configuration
