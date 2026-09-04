# FITA — "Marine" Single-Palette Design System (v5)

Single source of truth for the visual system. One brand palette, no theme
switching. All tokens live in `src/app/globals.css` under `:root`.

## 1. The palette (4 source colors)

| Role | Hex | Usage |
| --- | --- | --- |
| White | `#F9F9F9` | page canvas (`--background`) |
| Surface white | `#FFFFFF` | cards, sheets, popovers (`--card`, `--popover`) |
| Navy Blue | `#092634` | **ink + deep structural surfaces** — every text, bottom tab bar, diary summary hero, weight-journey hero, camera circles on orange (`--foreground`) |
| Blue | `#004E72` | **the interactive color** — CTA, progress fills, water, week strip, links, charts, selected states (`--primary` = `--brand`) |
| Orange | `#FF6E42` | **energy signature** — food/calorie identity (`--energy`) |

Derived ramp:
- `--brand-strong #003952` (deep blue, hover/pressed, chart-1)
- `--brand-soft #DBE9F0` (blue tint — tracks, chips, icon circles, selected-soft)
- `--energy-strong #C74A1C` (readable orange for text/icons on light — 4.8:1)
- `--energy-soft #FEE9E1` (orange tint — streak pill, carbs track, soft chips)
- `--muted-foreground #556B76` secondary text (5.1:1) · hairlines are navy-alpha

## 2. Color budget (~70 / 22 / 8)

~70% neutral surfaces · ~22% supporting tints (`surface-alt`, `muted`,
`brand-soft`, `energy-soft`) · ~8% brand+energy.

**Navy surfaces** (deep structural layer, every screen): bottom tab bar,
diary summary hero, weight-journey hero, coach user-bubbles stay blue.

**Orange appears ONLY on the energy identity:**

1. Scan FAB (`MainShell`)
2. Home scan hero CTA «غذا را اسکن کن»
3. ScanSheet «گرفتن عکس» camera card
4. Calorie ring + «مصرف شده» line (`HomeTab`)
5. Diary summary progress bar + «باقی‌مانده» on navy (`DiaryTab`)
6. Streak pill + flame (`ProgressTab`)
7. Carbs macro bar (`MacroStrip`) · active-nav dot (`BottomNav`)
8. Weight-change delta on navy hero (`ProgressTab`)

Everything interactive/selected stays BLUE (`--primary`). Never color hovers
of secondary actions (`bg-muted`). Never hardcode hex in components.

Macro tones (no rainbow, palette-only): protein = blue, carbs = orange,
fat = navy, fiber = soft blue.

## 3. Contrast rules (verified)

- White text on `--primary` blue → 9:1 ✓
- White text/icons on navy surfaces → 16:1 ✓ · white/55 inactive nav ≈ 5.4:1 ✓
- Navy ink on `--energy` orange → 5.6:1 ✓ (orange surfaces ALWAYS use
  `text-foreground`, never white)
- Raw `#FF6E42` as text is allowed ONLY on navy surfaces (5.6:1 ✓ — diary
  «باقی‌مانده», weight delta); on light backgrounds use `text-energy-strong`
- Orange titles inside orange surfaces may use `text-foreground/90` only for
  ≥12px secondary copy; keep it ≥90% opacity

## 4. Typography & RTL (hard rules, unchanged)

- IRANSans everywhere; `.t-display/.t-title/.t-headline/.t-body/.t-body-sm/
  .t-caption/.t-label` tokens; no letter-spacing on Persian
- **Latin digits everywhere (v5)**: `enDigits()` (in `lib/phone.ts`) is the only
  display formatter — it passes numbers through AND normalizes any
  Persian/Arabic-Indic digits found in stored strings («۱۰۰ گرم» → «100 گرم»).
  Never render raw DB strings that may contain digits without it. `faDate`
  uses `fa-IR-u-nu-latn`. Number + unit are separate nodes.
- Text never overflows: `min-w-0` + truncate/wrap, dynamic heights only
- Directional icons keep their RTL semantics; don't blind-mirror

## 5. Micro-rules

- Primary actions ≥44px; long Persian labels wrap naturally
- Sheets use `bg-card` + `rounded-t-[28px]`
- **Home hero (v5)**: single deep-Marine gradient card
  (`155deg, foreground → #0A3A52 → primary`), rounded-[28px], ambient radial
  glows (energy @ 20% + white @ 8%), white ink ≥7:1. Gradient ring
  (energy → #FFA184, white/14 track) animates stroke on mount; macro row
  inside the card uses color-coded dots (brand-soft / energy / white) + white
  bars on white/15. Bento row: Water card (quick +1 glass, POST /api/water,
  optimistic) + Next-meal card. Entrance: one staggered fade+rise
  (stagger 0.07s, ease [0.22,1,0.36,1]); count-up numbers;
  `useReducedMotion` collapses everything to static.
- Charts: single blue ladder (`--chart-1..5`), baseline `var(--divider)`
- Focus rings `ring-ring/30`; destructive only for destructive
- `dark:` variants are inert (single light palette) — don't add new ones

## 6. Verification

```bash
cd /home/z/my-project
bunx --bun tsc --noEmit 2>&1 | grep -v "^examples/" | grep -v "^skills/"   # empty
bun run lint 2>&1 | tail -3                                                # clean
```

Do NOT restart the dev server. Visual QA: every screen readable, RTL correct,
no overflow; navy surfaces (tab bar + heroes) and orange energy moments present
on every screen; blue owns interaction.
