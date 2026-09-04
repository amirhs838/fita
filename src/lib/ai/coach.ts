import { z } from 'zod'
import { db } from '@/lib/db'
import { computeTargets, type ActivityLevel, type ComputedTargets, type Gender, type GoalType } from '@/lib/nutrition/engine'
import { todayIso } from '@/lib/date'
import { AiError, getAiProvider, type GatewayTextMessage } from '@/lib/ai/gateway'
import { COACH_SUGGESTION_CODES, COACH_SYSTEM_PROMPT } from '@/lib/ai/prompts'

/**
 * AI Coach (Phase 7 — AI.md §3): assembles a compact, privacy-safe context,
 * enforces guardrails through the centralized system prompt, and zod-validates
 * every reply (1 retry). Suggestion codes are whitelisted before storage.
 * Medical notes never leave the server — only a boolean flag is shared.
 */

const ReplySchema = z.object({
  reply: z.string().trim().min(1).max(2000),
  suggestion: z.enum([...COACH_SUGGESTION_CODES, 'null']).nullable().optional(),
})

export interface CoachContextUser {
  name: string | null
}

/** Build the compact JSON context for the coach from live user data. */
export async function buildCoachContext(userId: string): Promise<{
  contextJson: string
  profileReady: boolean
} | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { profile: { include: { user: true } }, allergies: true, dislikedFoods: true, dietPreferences: true },
  })
  if (!user?.profile) return null
  const p = user.profile

  const goal = p.onboardedAt
    ? await db.goal.findFirst({ where: { userId, status: 'ACTIVE' } })
    : null

  let targets: ComputedTargets | null = null
  if (goal && p.gender && p.birthYear && p.heightCm && p.currentWeightKg && p.activityLevel) {
    targets = computeTargets(
      {
        gender: p.gender as Gender,
        age: new Date().getFullYear() - p.birthYear,
        heightCm: p.heightCm,
        currentWeightKg: p.currentWeightKg,
        activityLevel: p.activityLevel as ActivityLevel,
        pregnancy: p.pregnancy,
        breastfeeding: p.breastfeeding,
      },
      goal.type as GoalType,
      goal.targetWeightKg,
    )
  }

  const date = todayIso()
  const logs = await db.foodLog.findMany({ where: { userId, date }, include: { items: true } })
  const consumed = logs
    .flatMap((l) => l.items)
    .reduce(
      (acc, it) => ({
        kcal: acc.kcal + it.kcal,
        proteinG: acc.proteinG + it.proteinG,
        carbG: acc.carbG + it.carbsG,
        fatG: acc.fatG + it.fatG,
      }),
      { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 },
    )
  const water = await db.waterLog.aggregate({ where: { userId, date }, _sum: { amountMl: true } })

  const plan = await db.mealPlan.findFirst({
    where: { userId, status: 'ACTIVE' },
    include: { days: { where: { date }, include: { items: true } } },
  })
  const plannedToday = plan?.days[0]?.items.map((i) => `${i.titleFa} (${i.kcal} kcal)`) ?? []

  const context = {
    profile: {
      name: user.name ?? 'کاربر',
      gender: p.gender ?? null,
      ageYears: p.birthYear ? new Date().getFullYear() - p.birthYear : null,
      heightCm: p.heightCm,
      weightKg: p.currentWeightKg,
      goalType: goal?.type ?? null,
      targetWeightKg: goal?.targetWeightKg ?? null,
      activityLevel: p.activityLevel,
      mealsPerDay: p.mealsPerDay,
      budget: p.budgetLevel,
      dietTags: user.dietPreferences.map((d) => d.tag),
    },
    targets: targets
      ? { kcal: targets.kcal, proteinG: targets.proteinG, carbG: targets.carbG, fatG: targets.fatG }
      : null,
    today: {
      consumed,
      remainingKcal: targets ? Math.round(targets.kcal - consumed.kcal) : null,
      waterMl: water._sum.amountMl ?? 0,
      plannedMealsToday: plannedToday,
    },
    restrictions: {
      allergies: user.allergies.map((a) => a.name),
      disliked: user.dislikedFoods.map((d) => d.name),
    },
    flags: {
      // Never send the raw medical text to the model — only the fact a note exists.
      hasMedicalNotes: Boolean(p.medicalNotes || p.medications),
      pregnancy: p.pregnancy,
      breastfeeding: p.breastfeeding,
    },
  }

  return { contextJson: JSON.stringify(context), profileReady: Boolean(p.onboardedAt && goal) }
}

function extractJson(raw: string): unknown {
  const stripped = raw.replace(/```(?:json)?/gi, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end <= start) throw new AiError('AI_INVALID_RESPONSE', 'پاسخ نامعتبر از مربی.')
  try {
    return JSON.parse(stripped.slice(start, end + 1))
  } catch {
    throw new AiError('AI_INVALID_RESPONSE', 'پاسخ نامعتبر از مربی.')
  }
}

/**
 * Ask the coach one message with history. Returns validated {reply, suggestion}.
 * Retries once on invalid structure; throws AiError after that.
 */
export async function askCoach(
  contextJson: string,
  history: GatewayTextMessage[],
  userText: string,
): Promise<{ reply: string; suggestion: string | null }> {
  const provider = await getAiProvider()
  const userMessage = `زمینه (context JSON):\n${contextJson}\n\nپیام کاربر: ${userText}`

  let lastError: AiError = new AiError('AI_INVALID_RESPONSE', 'پاسخ نامعتبر از مربی.')
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await provider.completeText({
        system: COACH_SYSTEM_PROMPT,
        messages: [...history.slice(-12), { role: 'user', content: userMessage }],
        json: true,
        maxTokens: 700,
      })
      const parsed = ReplySchema.safeParse(extractJson(raw))
      if (parsed.success) {
        const suggestion = parsed.data.suggestion
        return {
          reply: parsed.data.reply,
          suggestion: suggestion && suggestion !== 'null' ? suggestion : null,
        }
      }
      lastError = new AiError('AI_INVALID_RESPONSE', 'ساختار پاسخ مربی نامعتبر بود.')
    } catch (err) {
      lastError = err instanceof AiError ? err : new AiError('AI_UNAVAILABLE', 'مربی موقتاً در دسترس نیست.')
    }
  }
  throw lastError
}
