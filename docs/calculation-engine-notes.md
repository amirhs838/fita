# Calculation Engine — Notes & Discovered Issues

Per the engine-replacement scope (§70): unrelated bugs discovered during this task are
RECORDED here, not fixed.

## Recorded during engine v2 implementation

1. **Goal snapshot (`Goal.kcalTarget` …) is written at onboarding only.** The v2 engine
   computes fresh targets per request (summary/progress), so the snapshot is informational.
   If it ever becomes authoritative again, it must be refreshed after weight updates —
   otherwise it silently diverges from the engine. (Not touched in this task.)
2. **Trimester / breastfeeding mode / postpartum month are not collected** in onboarding.
   The engine uses safe IOM defaults (+340 kcal pregnancy, +330 kcal breastfeeding) and
   exposes this limitation on every special-state result. Future schema fields:
   `pregnancyTrimester`, `breastfeedingMonths`, `breastfeedingMode`.
3. **`UserProfile.birthYear` freezes the onboarding age.** Age is derived as
   `currentYear − birthYear`, which is correct drift behavior; just note that editing a
   birth year elsewhere would be the only wrong path. (No current edit path exists.)
4. **Calibration display scope**: LEVEL-3 calibration is applied in `/api/summary` and
   `/api/progress` (the surfaces the user sees daily). Meal-plan slot shares keep using
   the uncalibrated formula; the planner's ±25% slot tolerance absorbs the ≤150 kcal
   calibration band by design.
5. **Sandbox/git hygiene (ops, not app)**: during this task the local checkout was found
   re-tracking `.next/`, `db/custom.db`, `dev.log` and `upload/` with a stripped
   `.gitignore` (sandbox auto-commit). Restored via `git reset --hard origin/main` — the
   pushed public history was never affected. Watch for recurrence after sandbox restarts.
