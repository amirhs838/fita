# Fita Calculation Methodology — Nutrition Engine v2.0.0

> Engine location: `src/lib/nutrition/` (pure functions) + `engine.ts` (back-compat façade).
> Every number in the engine is traceable to a section of this document.
> Principle (§65): outputs are **best-supported estimates for the given input set** —
> never presented as measurements, and never presented as exact for every person.

## 1. RMR methodology

| Level | Method | When |
|---|---|---|
| 1 | **Mifflin–St Jeor**: `10·kg + 6.25·cm − 5·age + s` (s = +5 male / −161 female) | No usable body-fat data (default) |
| 2 | **Cunningham-type FFM**: `500 + 22 × FFM`, FFM = weight × (1 − BF%) | Plausible BF% estimate available |

**Sources**: Mifflin MD, St Jeor ST, et al. *A new predictive equation for resting energy expenditure in healthy individuals.* Am J Clin Nutr. 1990;51(2):241-7. — The American Dietetic Association position paper identifies Mifflin–St Jeor as the most reliable RMR prediction equation for normal-weight and overweight adults. Cunningham (1991, *Body composition as a predictor of resting energy expenditure*) form via fat-free mass is the standard body-composition path for lean/active adults.

**Population**: adults 10–100 (product requirement; pediatric module intentionally NOT built — architecture leaves a strategy slot for it).
**Limitations**: prediction equations carry ~±10% individual error even when population-accurate. Obesity skews MSJ slightly downward; the FFM path plus adjusted-body-weight protein anchoring mitigates gross errors.
**Fallback**: implausible BF% (male outside 5–55%, female outside 10–60%) → ignore BF entirely and use Level 1 (§10 — bad input never corrupts the result).

## 2. Energy expenditure methodology

`TDEE = RMR × PAL`. Maintenance calories ≡ TDEE. No additional `+exercise` or `+steps` terms anywhere (§12): activity is represented exclusively through the PAL multiplier, which already averages weekly training. This design makes double-counting structurally impossible.

**Source**: Institute of Medicine. *DRI: The Essential Guide to Nutrient Requirements* (2005), physical-activity categories; ADA Position: *Weight Management.* J Am Diet Assoc. 2009;109(2):330-346.

## 3. Activity model

Centralized in `constants.ts → ACTIVITY_FACTORS` (§11):

| Level | PAL | Category |
|---|---|---|
| SEDENTARY | 1.2 | desk work, no training |
| LIGHT | 1.375 | 1–2 light sessions/week |
| MODERATE | 1.55 | 3–5 sessions/week |
| ACTIVE | 1.725 | 6–7 sessions/week |
| VERY_ACTIVE | 1.9 | daily hard training / physical job |

These are the standard prediction-equation multipliers in universal use. The mapping is deterministic and appears nowhere else in the codebase.

## 4. Adaptive calibration (LEVEL 3)

When the DB holds **≥14 days** of weight history (≥5 measurements) **and ≥10 logged intake days within 14 days**:

1. Observed trend = least-squares slope of weight (kg/week).
2. Predicted trend = the weekly change the current target would produce.
3. `unaccounted kcal/day = (observed − predicted) × 7700 / 7`.
4. **Hysteresis**: |unaccounted| < 75 kcal → no change (noise gate).
5. **Bounded adjustment**: correction clamped to **±150 kcal/day** — no ±500 reactions from one data point (§46).
6. One noisy weekly weight can never trigger a change; the gate is multi-week by construction (§13/§47).

Confidence becomes HIGH only when calibration actually applied.

## 5. Weight-change model

Fixed deficits do NOT produce linear weight loss forever: as mass changes, TDEE changes. The engine therefore **simulates week-by-week**, recomputing RMR (Mifflin–St Jeor) at each new body mass and applying the energy balance. 7700 kcal/kg is used only as the per-week conversion inside this dynamic loop (§14 — explicitly NOT the naive 3500-kcal/lb linear model). Outputs: `expectedWeeklyWeightChange` (first-4-week average), `weeksToGoal`, `estimatedGoalDate` (null when > 52 weeks → `GOAL_TIMELINE_LONG`).

**Source**: Hall KD, et al. *Quantification of the effect of energy imbalance on bodyweight.* Lancet. 2011;378(9793):826-37 (dynamic body-weight modeling; the full NIDDK Body Weight Planner is deliberately out of scope for v2 — noted as a future refinement).

## 6. Protein methodology

- Goal-aware g/kg on **reference weight** (§26), NOT a fixed % of calories (§25):

| Goal | g/kg | Rationale |
|---|---|---|
| LOSE_WEIGHT | 2.0 | lean-mass retention in deficit |
| MAINTAIN | 1.6 | active adults |
| GAIN_WEIGHT | 1.7 | tissue gain support |
| BUILD_MUSCLE | 2.0 | resistance training |
| RECOMP | 2.2 | simultaneous fat loss / muscle retention |
| CUSTOM | 1.6 | conservative default |

- Clamps: **1.2–2.5 g/kg** and protein ≤ **35%** of energy (HIGH_PROTEIN diet style: +0.2 g/kg).
- **Reference weight strategy** (§26): BMI < 30 → actual weight; BMI ≥ 30 → adjusted body weight `IBW(24.9 BMI) + 0.25 × (actual − IBW)` so a 140 kg user is never prescribed 280 g protein.

**Sources**: Jäger R, et al. *International Society of Sports Nutrition Position Stand: protein and exercise.* J Int Soc Sports Nutr. 2017;14:20. Morton RW, et al. Br J Sports Med. 2018;52(6):376-384. Helms ER, et al. *A systematic review of dietary protein during caloric restriction in resistance trained lean athletes.* Int J Sport Nutr Exerc Metab. 2014;24(2):127-38.

## 7. Fat methodology

Base **27% of energy** (mid-AMDR), floor `max(0.8 g/kg reference weight, 20% of energy)`, cap 35% of energy. Diet styles shift the split deterministically: KETO 65%, LOW_CARB 40%, HIGH_PROTEIN 25% (calorie target untouched). Fat is never "the remaining calories" (§27).

**Source**: IOM. *DRI: Reference Intakes for Macronutrients* (2005) — Acceptable Macronutrient Distribution Ranges 20–35% energy for adults.

## 8. Carbohydrate methodology

Carbs receive the remainder `kcal − 4·protein − 9·fat` divided by 4, validated by floors: NORMAL ≥ 80 g, LOW_CARB ≥ 50 g, KETO 25–50 g. When the floor binds, `CARB_FLOOR_APPLIED` is returned. This respects the §29 priority (calories → protein → fat floor → carbs) while never producing physiologically absurd values (§28).

**Source**: IOM 2005 — carbohydrate RDA 130 g/day for adults; ketogenic patterns are user-selected diet styles, not engine defaults.

## 9. Fiber methodology

`14 g per 1000 kcal`, clamped to 25–40 g/day. Energy-linked per the DRI evidence base, rounded to a practical integer (§30).

**Source**: IOM. *DRI: Dietary, Functional, and Total Fiber* (2005) — 14 g/1000 kcal; AI 25 g (women) / 38 g (men).

## 10. Healthy weight range

`BMI 18.5–24.9` band → `healthyWeightRange = {min, max} kg` presented as **بازه وزن مرجع** — a screening range, never a body-composition claim and never a single "ideal weight" (no `height − 100` anywhere, §20). The user's own goal weight is stored/displayed separately as «هدف انتخابی شما».

**Source**: WHO BMI classification; NHLBI Obesity Education Initiative. *Clinical Guidelines on the Identification, Evaluation, and Treatment of Overweight and Obesity in Adults.* 1998.

## 11. Body measurements

Only defensible uses are implemented (§22):
- **Waist + neck (+ hip, women)** → US Navy body-fat (Hodgdon & Beckett 1984) — SE ≈ 3–4% BF.
- **Waist only** → RFM (Woolcott & Bergman 2018): `64/76 − 20·height/waist` (men/women).
- **Waist + height** → WHtR supplemental indicator (universal 0.5 cutoff); context/progress only — never modifies calories (§23).
- Arm/thigh/wrist are tracked for progress only; **no invented combined formula** exists.

**Sources**: Hodgdon JA, Beckett MB. *Prediction of percent body fat from circumferences.* 1984. Woolcott OO, Bergman RN. *Relative fat mass (RFM)…* Br J Nutr. 2018;120(8):961-964. Ashwell M, et al. BMJ Open 2012;2:e000389 (WHtR).
**Role**: BF% feeds ONLY the Level-2 RMR path and protein reference weight — never athlete status, never calorie math alone (§21).

## 12. Pregnancy

Separate strategy (§32): **deficits are structurally forbidden** — target ≥ TDEE + 340 kcal (2nd-trimester default; trimester is not yet collected — limitation §15 below). Energy: IOM 2009 (+0 / +340 / +452 by trimester). Returns `gestationalWeightGainRangeKg` by pre-pregnancy BMI: <18.5 → 12.5–18; 18.5–24.9 → 11.5–16; 25–29.9 → 7–11.5; ≥30 → 5–9 kg total. Warning code `PREGNANCY_WEIGHT_LOSS_NOT_ALLOWED` + consult-doctor notice.

**Source**: Rasmussen KM, Yaktine AL, eds. *Weight Gain During Pregnancy: Reexamining the Guidelines.* IOM/NRC 2009.

## 13. Breastfeeding

Separate strategy (§33): **deficits forbidden**; target ≥ TDEE + 330 kcal (0–6-month default; exclusive/partial and postpartum month not yet collected — limitation §15). Warning code `BREASTFEEDING_AGGRESSIVE_DEFICIT`. Uncertainty → conservative recommendation, per the spec.

**Source**: IOM 2005/2009 — additional ~330 kcal/day first 6 months, ~400 second 6 months.

## 14. Safety constraints (centralized)

`src/lib/nutrition/validation.ts` + `constants.ts` + `energy.ts` — nothing scattered in UI (§35):
- Input plausibility: age 10–100 (exact Persian errors, never clamped), height 80–250, weight 25–400, waist 20–200 (§43).
- Paces: loss ≤ min(1% BW, 0.75 kg)/wk · recommended 0.5% BW (0.75% BMI≥30, 1% BMI≥35); gain/muscle ≤ min(0.5% BW, 0.5 kg)/wk · recommended 0.25% BW.
- Deficit ≤ min(25% TDEE, 1000 kcal); build surplus ≤ min(15% TDEE, 400 kcal); gain surplus ≤ min(20% TDEE, 500 kcal).
- Hard calorie floors: 1500 male / 1200 female (`AppConfig.safety`, env-tunable).
- Goal weight: BMI ≥ 16.5 hard floor; loss ≤ 35% of body weight; gain ≤ 50% (hard 422 rejections at onboarding).
- Structured warning codes (§66): `CALORIE_TARGET_TOO_LOW`, `GOAL_RATE_TOO_FAST`, `GOAL_WEIGHT_UNREALISTIC`, `PREGNANCY_WEIGHT_LOSS_NOT_ALLOWED`, `BREASTFEEDING_AGGRESSIVE_DEFICIT`, `INVALID_BODY_COMPOSITION`, `CALIBRATION_DATA_INSUFFICIENT`, `GOAL_TIMELINE_LONG`, `CARB_FLOOR_APPLIED`, `ESTIMATE_NOT_MEASUREMENT`, …

## 15. Limitations

1. Predictive equations have inherent individual error; calibration narrows but cannot eliminate it.
2. Trimester, exclusive-vs-partial breastfeeding, and postpartum month are not collected (safe defaults used; documented in output `limitations`).
3. Simulation simplifies FFM dynamics to MSJ-at-new-weight (directionally right, not clinical-grade).
4. Calibration requires user adherence (10/14 logged days) and assumes the logged period used the same target.
5. Level-2 BF% comes from circumference estimates (Navy/RFM) — good screening, not DXA.
6. CUSTOM goal maps to the closest supported strategy; no arbitrary calorie inputs are honored (§39).

## 16. References (primary)

1. Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. Am J Clin Nutr. 1990;51(2):241-7.
2. Cunningham JJ. *Body composition as a predictor of resting energy expenditure.* J Parenter Enteral Nutr. 1991;15(1):100.
3. Institute of Medicine. *Dietary Reference Intakes: The Essential Guide to Nutrient Requirements.* National Academies Press, 2005.
4. Hall KD, Sacks G, Chandramohan D, et al. Lancet. 2011;378(9793):826-37.
5. Jäger R, Kerksick CM, Campbell BI, et al. J Int Soc Sports Nutr. 2017;14:20.
6. Morton RW, Murphy KT, McKellar SR, et al. Br J Sports Med. 2018;52(6):376-384.
7. Helms ER, Zinn C, Rowlands DS, Brown SR. Int J Sport Nutr Exerc Metab. 2014;24(2):127-38.
8. Rasmussen KM, Yaktine AL (eds). *Weight Gain During Pregnancy.* IOM/NRC, 2009.
9. Woolcott OO, Bergman RN. Br J Nutr. 2018;120(8):961-964.
10. Hodgdon JA, Beckett MB. Naval Health Research Center Report 84-11 / 84-29, 1984.
11. Ashwell M, Gunn P, Gibson S. BMJ Open. 2012;2:e000389.
12. NHLBI. *Clinical Guidelines on Overweight and Obesity.* 1998.
13. American Dietetic Association. *Weight Management Position.* J Am Diet Assoc. 2009;109(2):330-346.
