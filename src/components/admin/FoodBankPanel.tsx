'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Bot,
  CalendarRange,
  ChefHat,
  ImagePlus,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Search,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { api, ApiClientError } from '@/lib/client'
import AiSettingsPanel from '@/components/admin/AiSettingsPanel'
import { enDigits } from '@/lib/phone'
import { cn } from '@/lib/utils'
import type {
  AdminBudgetLevel,
  AdminCreateFoodData,
  AdminDeleteFoodData,
  AdminFoodDto,
  AdminFoodListData,
  AdminMealSlot,
} from '@/lib/types'

// ─────────────────────── Constants ───────────────────────

const CATEGORIES: { id: string; label: string }[] = [
  { id: 'MAIN_DISH', label: 'غذای اصلی' },
  { id: 'RICE', label: 'برنج و پلو' },
  { id: 'BREAD', label: 'نان' },
  { id: 'DAIRY', label: 'لبنیات' },
  { id: 'FRUIT', label: 'میوه' },
  { id: 'VEGETABLE', label: 'سبزیجات' },
  { id: 'PROTEIN', label: 'پروتئین' },
  { id: 'SNACK', label: 'میان‌وعده' },
  { id: 'DRINK', label: 'نوشیدنی' },
  { id: 'FAST_FOOD', label: 'فست‌فود' },
  { id: 'SWEET', label: 'دسر و شیرینی' },
  { id: 'OTHER', label: 'سایر' },
]

const FOOD_TYPES: { id: string; label: string }[] = [
  { id: 'DISH', label: 'غذا' },
  { id: 'INGREDIENT', label: 'ماده اولیه' },
  { id: 'BRAND', label: 'محصول برند' },
]

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label]),
)

const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  USER: { label: 'دستی', className: 'bg-brand-soft text-brand-strong' },
  AI_ESTIMATE: { label: 'هوش مصنوعی', className: 'bg-energy-soft text-energy-strong' },
}

const MEAL_SLOT_ORDER: AdminMealSlot[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']

const MEAL_SLOT_LABEL: Record<AdminMealSlot, string> = {
  BREAKFAST: 'صبحانه',
  LUNCH: 'ناهار',
  DINNER: 'شام',
  SNACK: 'میان‌وعده',
}

const BUDGET_ORDER: AdminBudgetLevel[] = ['ECONOMY', 'MID', 'FLEXIBLE']

const BUDGET_LABEL: Record<AdminBudgetLevel, string> = {
  ECONOMY: 'اقتصادی',
  MID: 'متوسط',
  FLEXIBLE: 'آزاد',
}

interface ServingRow {
  labelFa: string
  grams: string
}

interface FormState {
  nameFa: string
  nameEn: string
  category: string
  foodType: string
  isIranian: boolean
  servings: ServingRow[]
  kcal: string
  protein: string
  carbs: string
  fat: string
  fiber: string
  mealSlots: AdminMealSlot[]
  budget: AdminBudgetLevel | null
}

const EMPTY_FORM: FormState = {
  nameFa: '',
  nameEn: '',
  category: 'MAIN_DISH',
  foodType: 'DISH',
  isIranian: false,
  servings: [{ labelFa: '', grams: '' }],
  kcal: '',
  protein: '',
  carbs: '',
  fat: '',
  fiber: '',
  mealSlots: [],
  budget: null,
}

/** PATCH response (kept local — mirrors the API envelope). */
interface AdminUpdateFoodData {
  food: AdminFoodDto
}

// ─────────────────────── Helpers ───────────────────────

/** Downscale to ≤640px JPEG (0.8) in-browser — keeps the DB row small. */
async function fileToDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('image-decode'))
      el.src = objectUrl
    })
    const maxSide = 640
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.8)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function num(v: string): number | null {
  const t = v.trim().replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

// ─────────────────────── Panel ───────────────────────

export default function FoodBankPanel() {
  const router = useRouter()

  const [section, setSection] = useState<'BANK' | 'PLAN' | 'AI'>('BANK')

  // Bank list
  const [foods, setFoods] = useState<AdminFoodDto[]>([])
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(true)
  const [listQuery, setListQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // Plan board (own state — only foods tagged with slots + budget)
  const [planFoods, setPlanFoods] = useState<AdminFoodDto[]>([])
  const [planLoading, setPlanLoading] = useState(false)
  const planLoadedRef = useRef(false)
  const planDirtyRef = useRef(false)

  // Form (shared by create + edit)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState<AdminFoodDto | null>(null)
  const [deleting, setDeleting] = useState<AdminFoodDto | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const nameFaRef = useRef<HTMLInputElement>(null)
  const focusNameRef = useRef(false)

  // ─── Bank list loading ───

  const loadList = useCallback(async (q: string) => {
    setListLoading(true)
    try {
      const data = await api<AdminFoodListData>(
        `/api/admin/foods?limit=60${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      )
      setFoods(data.foods)
      setTotal(data.total)
    } catch {
      toast.error('بارگذاری بانک غذا انجام نشد.')
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadList('')
  }, [loadList])

  // Debounce the list search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(listQuery), 300)
    return () => clearTimeout(t)
  }, [listQuery])

  useEffect(() => {
    void loadList(debouncedQuery)
  }, [debouncedQuery, loadList])

  // ─── Plan board loading ───

  const loadPlan = useCallback(async () => {
    setPlanLoading(true)
    try {
      const data = await api<AdminFoodListData>('/api/admin/foods?plan=1&limit=300')
      setPlanFoods(data.foods)
      planLoadedRef.current = true
      planDirtyRef.current = false
    } catch {
      toast.error('بارگذاری گزینه‌های برنامه‌ساز انجام نشد.')
    } finally {
      setPlanLoading(false)
    }
  }, [])

  function switchSection(next: 'BANK' | 'PLAN' | 'AI') {
    if (next === section) return
    setSection(next)
    if (next === 'PLAN' && (!planLoadedRef.current || planDirtyRef.current)) {
      void loadPlan()
    }
  }

  /** After any create/edit/delete: refresh the visible list, mark the plan board stale. */
  function afterMutation(planVisible: boolean) {
    planDirtyRef.current = true
    void loadList(debouncedQuery)
    if (planVisible) void loadPlan()
  }

  // Focus the Persian-name field when arriving from a plan-board «افزودن»
  useEffect(() => {
    if (focusNameRef.current && section === 'BANK') {
      focusNameRef.current = false
      nameFaRef.current?.focus()
    }
  }, [section])

  // ─── Auth ───

  async function logout() {
    try {
      await api('/api/admin/logout', { method: 'POST' })
    } catch {
      // cookie is cleared server-side anyway on next guarded request
    }
    router.refresh()
  }

  // ─── Photo ───

  async function onPhoto(file: File) {
    try {
      const dataUrl = await fileToDataUrl(file)
      setImageUrl(dataUrl)
    } catch {
      toast.error('خواندن عکس انجام نشد. عکس دیگری انتخاب کن.')
    }
  }

  // ─── Servings ───

  function setServingRow(i: number, patch: Partial<ServingRow>) {
    setForm((f) => ({
      ...f,
      servings: f.servings.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    }))
  }

  function addServingRow() {
    setForm((f) => (f.servings.length >= 10 ? f : { ...f, servings: [...f.servings, { labelFa: '', grams: '' }] }))
  }

  function removeServingRow(i: number) {
    setForm((f) =>
      f.servings.length <= 1
        ? f
        : { ...f, servings: f.servings.filter((_, idx) => idx !== i) },
    )
  }

  // ─── Plan tags ───

  function toggleMealSlot(slot: AdminMealSlot) {
    setForm((f) => ({
      ...f,
      mealSlots: f.mealSlots.includes(slot)
        ? f.mealSlots.filter((s) => s !== slot)
        : [...f.mealSlots, slot],
    }))
  }

  function toggleBudget(budget: AdminBudgetLevel) {
    setForm((f) => ({ ...f, budget: f.budget === budget ? null : budget }))
  }

  // ─── Edit / preset ───

  function startEdit(food: AdminFoodDto) {
    setEditing(food)
    setForm({
      nameFa: food.nameFa,
      nameEn: food.nameEn ?? '',
      category: food.category,
      foodType: food.foodType,
      isIranian: food.isIranian,
      servings:
        food.servings.length > 0
          ? food.servings.map((s) => ({ labelFa: s.labelFa, grams: String(s.grams) }))
          : [{ labelFa: '', grams: '' }],
      kcal: String(food.kcalPer100g),
      protein: String(food.proteinPer100g),
      carbs: String(food.carbsPer100g),
      fat: String(food.fatPer100g),
      fiber: food.fiberPer100g != null ? String(food.fiberPer100g) : '',
      mealSlots: [...food.mealSlots],
      budget: food.budgetLevel,
    })
    setImageUrl(food.imageUrl ?? null)
    setSection('BANK')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** «افزودن» from the plan board — preset meal slot + budget, focus the name. */
  function startPresetAdd(slot: AdminMealSlot, budget: AdminBudgetLevel) {
    setEditing(null)
    setForm((f) => ({ ...EMPTY_FORM, category: f.category, mealSlots: [slot], budget }))
    setImageUrl(null)
    focusNameRef.current = true
    setSection('BANK')
  }

  function cancelEdit() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, category: form.category })
    setImageUrl(null)
  }

  // ─── Submit (create + edit) ───

  async function submit() {
    if (submitting) return
    const nameFa = form.nameFa.trim()
    if (nameFa.length < 2) {
      toast.error('نام فارسی غذا را بنویس.')
      return
    }
    const servings = form.servings
      .map((s) => ({ labelFa: s.labelFa.trim(), grams: num(s.grams) }))
      .filter((s): s is { labelFa: string; grams: number } => s.labelFa !== '' || s.grams !== null)
    if (servings.length === 0 || servings.some((s) => !s.labelFa || s.grams === null || s.grams < 5)) {
      toast.error('برای هر واحد، عنوان و وزن گرمی معتبر بنویس.')
      return
    }
    const kcal = num(form.kcal)
    const protein = num(form.protein)
    const carbs = num(form.carbs)
    const fat = num(form.fat)
    const fiber = num(form.fiber)
    if (kcal === null || protein === null || carbs === null || fat === null) {
      toast.error('کالری، پروتئین، کربوهیدرات و چربی را کامل وارد کن.')
      return
    }

    const per100g = {
      kcal,
      protein,
      carbs,
      fat,
      ...(fiber !== null ? { fiber } : {}),
    }
    const servingsBody = servings.map((s) => ({ labelFa: s.labelFa, grams: s.grams }))

    setSubmitting(true)
    try {
      if (editing) {
        await api<AdminUpdateFoodData>(`/api/admin/foods/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            nameFa,
            nameEn: form.nameEn.trim() || null,
            category: form.category,
            foodType: form.foodType,
            isIranian: form.isIranian,
            imageUrl, // null clears the photo
            per100g,
            servings: servingsBody,
            budgetLevel: form.budget,
            mealSlots: form.mealSlots,
          }),
        })
        toast.success('تغییرات ذخیره شد')
        setEditing(null)
        setForm({ ...EMPTY_FORM, category: form.category })
        setImageUrl(null)
        afterMutation(section === 'PLAN')
      } else {
        const data = await api<AdminCreateFoodData>('/api/admin/foods', {
          method: 'POST',
          body: JSON.stringify({
            nameFa,
            ...(form.nameEn.trim() ? { nameEn: form.nameEn.trim() } : {}),
            category: form.category,
            foodType: form.foodType,
            isIranian: form.isIranian,
            ...(imageUrl ? { imageUrl } : {}),
            per100g,
            servings: servingsBody,
            budgetLevel: form.budget,
            ...(form.mealSlots.length > 0 ? { mealSlots: form.mealSlots } : {}),
          }),
        })
        toast.success(`«${data.food.nameFa}» به بانک اضافه شد`, {
          description: 'از همین حالا در جستجوی اپ قابل پیدا کردن است.',
        })
        setForm({ ...EMPTY_FORM, category: form.category })
        setImageUrl(null)
        afterMutation(section === 'PLAN')
      }
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'ذخیره غذا انجام نشد.')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Delete ───

  async function confirmDelete() {
    if (!deleting) return
    const target = deleting
    setDeleting(null)
    try {
      await api<AdminDeleteFoodData>(`/api/admin/foods/${target.id}`, { method: 'DELETE' })
      toast.success(`«${target.nameFa}» حذف شد`)
      afterMutation(section === 'PLAN')
    } catch {
      toast.error('حذف انجام نشد.')
    }
  }

  const catLabel = (id: string) => CATEGORY_LABEL[id] ?? id

  return (
    <div className="mx-auto min-h-dvh w-full max-w-md bg-background px-5 pb-16 pt-8">
      {/* Header */}
      <header>
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowRight className="size-3.5" aria-hidden />
          برگشت به فیتا
        </a>
        <div className="mt-4 flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-foreground">
            <ChefHat className="size-6 text-primary-foreground" strokeWidth={1.6} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-7">بانک غذای فیتا</h1>
            <p className="tnum text-xs text-muted-foreground">
              {listLoading ? '…' : `${enDigits(total)} غذا در بانک`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
          >
            <LogOut className="size-4" aria-hidden />
            خروج
          </button>
        </div>

        {/* Section tabs */}
        <div
          role="tablist"
          aria-label="بخش‌های پنل مدیریت"
          className="mt-5 grid grid-cols-3 gap-1 rounded-full bg-muted/60 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={section === 'BANK'}
            aria-controls="admin-panel-bank"
            onClick={() => switchSection('BANK')}
            className={cn(
              'flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-full text-[13px] font-bold transition-colors',
              section === 'BANK' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <UtensilsCrossed className="size-4" aria-hidden />
            بانک غذا
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === 'PLAN'}
            aria-controls="admin-panel-plan"
            onClick={() => switchSection('PLAN')}
            className={cn(
              'flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-full text-[13px] font-bold transition-colors',
              section === 'PLAN' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <CalendarRange className="size-4" aria-hidden />
            برنامه
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === 'AI'}
            aria-controls="admin-panel-ai"
            onClick={() => switchSection('AI')}
            className={cn(
              'flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-full text-[13px] font-bold transition-colors',
              section === 'AI' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Bot className="size-4" aria-hidden />
            هوش مصنوعی
          </button>
        </div>
      </header>

      {section === 'BANK' ? (
        <div id="admin-panel-bank" role="tabpanel">
          {/* Add / edit form */}
          <section
            aria-label={editing ? 'ویرایش غذا' : 'افزودن غذای جدید'}
            className="mt-6 rounded-3xl border border-border/70 bg-card p-5 shadow-[0_1px_3px_oklch(0.175_0_0/0.05)]"
          >
            <h2 className="text-[15px] font-bold">{editing ? 'ویرایش غذا' : 'غذای جدید'}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              عکس، نام و ارزش غذایی در 100 گرم را وارد کن؛ حداقل یک واحد (مثل یک بشقاب) لازم است.
            </p>

            {/* Editing banner */}
            {editing && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-full bg-brand-soft py-1.5 pe-1.5 ps-3.5">
                <span className="truncate text-xs font-medium text-brand-strong">
                  در حال ویرایش: {editing.nameFa}
                </span>
                <button
                  type="button"
                  onClick={cancelEdit}
                  aria-label="لغو ویرایش"
                  className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-brand-strong transition-colors hover:bg-brand-strong/10"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
            )}

            {/* Photo */}
            <div className="mt-4 flex items-center gap-3">
              <input
                ref={photoRef}
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label="انتخاب عکس غذا"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) void onPhoto(f)
                }}
              />
              {imageUrl ? (
                <span className="relative">
                  <img src={imageUrl} alt="عکس غذا" className="size-20 rounded-2xl object-cover" />
                  <button
                    type="button"
                    onClick={() => setImageUrl(null)}
                    aria-label="حذف عکس"
                    className="absolute -end-1.5 -top-1.5 flex size-6 cursor-pointer items-center justify-center rounded-full bg-foreground text-primary-foreground shadow"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => photoRef.current?.click()}
                  className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <ImagePlus className="size-5" strokeWidth={1.7} aria-hidden />
                  <span className="text-[10px] font-medium">عکس غذا</span>
                </button>
              )}
              <p className="min-w-0 flex-1 text-[11px] leading-5 text-muted-foreground">
                عکس اختیاری است و خودکار کوچک می‌شود. عکس غذا کنار نامش در لیست جستجو نمایش داده می‌شود.
              </p>
            </div>

            {/* Names */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">نام فارسی *</span>
                <Input
                  ref={nameFaRef}
                  value={form.nameFa}
                  onChange={(e) => setForm((f) => ({ ...f, nameFa: e.target.value }))}
                  placeholder="مثلاً خوراک قارچ"
                  className="h-11 rounded-xl"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">نام انگلیسی</span>
                <Input
                  value={form.nameEn}
                  onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
                  placeholder="mushroom stew"
                  dir="ltr"
                  className="h-11 rounded-xl"
                />
              </label>
            </div>

            {/* Category + type */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">دسته‌بندی</span>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-border/80 bg-transparent px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">نوع</span>
                <select
                  value={form.foodType}
                  onChange={(e) => setForm((f) => ({ ...f, foodType: e.target.value }))}
                  className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-border/80 bg-transparent px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {FOOD_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Iranian */}
            <label className="mt-3 flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={form.isIranian}
                onChange={(e) => setForm((f) => ({ ...f, isIranian: e.target.checked }))}
                className="size-4.5 cursor-pointer accent-[var(--primary)]"
              />
              <span className="text-xs font-medium text-foreground/85">غذای ایرانی است</span>
            </label>

            {/* Servings */}
            <div className="mt-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  واحدها <span className="text-[10px] font-normal">(واحد اول = پیش‌فرض)</span>
                </span>
                <button
                  type="button"
                  onClick={addServingRow}
                  disabled={form.servings.length >= 10}
                  className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-primary transition-opacity hover:opacity-75 disabled:opacity-40"
                >
                  <Plus className="size-3.5" aria-hidden />
                  افزودن واحد
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {form.servings.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={s.labelFa}
                      onChange={(e) => setServingRow(i, { labelFa: e.target.value })}
                      placeholder="مثلاً یک بشقاب"
                      className="h-11 flex-1 rounded-xl"
                      aria-label={`عنوان واحد ${i + 1}`}
                    />
                    <Input
                      value={s.grams}
                      onChange={(e) => setServingRow(i, { grams: e.target.value })}
                      placeholder="350"
                      inputMode="numeric"
                      className="tnum h-11 w-20 rounded-xl text-center"
                      aria-label={`وزن گرمی واحد ${i + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeServingRow(i)}
                      disabled={form.servings.length <= 1}
                      aria-label={`حذف واحد ${i + 1}`}
                      className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground">وزن هر واحد را گرمی بنویس، مثل 350 برای یک بشقاب.</p>
              </div>
            </div>

            {/* Per-100g */}
            <div className="mt-5">
              <span className="text-xs font-medium text-muted-foreground">ارزش غذایی در 100 گرم</span>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {(
                  [
                    { key: 'kcal', label: 'کالری (kcal) *', placeholder: '250' },
                    { key: 'protein', label: 'پروتئین (گرم) *', placeholder: '12' },
                    { key: 'carbs', label: 'کربوهیدرات (گرم) *', placeholder: '30' },
                    { key: 'fat', label: 'چربی (گرم) *', placeholder: '9' },
                    { key: 'fiber', label: 'فیبر (گرم)', placeholder: '3' },
                  ] as const
                ).map((f) => (
                  <label key={f.key} className="block">
                    <span className="mb-1.5 block text-[11px] text-muted-foreground">{f.label}</span>
                    <Input
                      value={form[f.key]}
                      onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      inputMode="decimal"
                      className="tnum h-11 rounded-xl text-center"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Plan-builder tags */}
            <div role="group" aria-label="گزینه‌های برنامه‌ساز" className="mt-5 border-t border-border/60 pt-4">
              <span className="text-xs font-bold text-foreground/85">گزینه‌های برنامه‌ساز</span>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                اگر وعده و بودجه انتخاب کنی، هوش مصنوعی می‌تواند این غذا را در برنامه کاربران بچیند.
              </p>

              {/* Meal slots — multi toggle */}
              <div className="mt-3 flex flex-wrap gap-2">
                {MEAL_SLOT_ORDER.map((slot) => {
                  const active = form.mealSlots.includes(slot)
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => toggleMealSlot(slot)}
                      aria-pressed={active}
                      className={cn(
                        'h-9 cursor-pointer rounded-full border px-3.5 text-xs font-medium transition-colors',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                      )}
                    >
                      {MEAL_SLOT_LABEL[slot]}
                    </button>
                  )
                })}
              </div>

              {/* Budget — single segmented, tap again to clear */}
              <div className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-muted/60 p-1">
                {BUDGET_ORDER.map((budget) => {
                  const active = form.budget === budget
                  return (
                    <button
                      key={budget}
                      type="button"
                      onClick={() => toggleBudget(budget)}
                      aria-pressed={active}
                      className={cn(
                        'h-9 cursor-pointer rounded-full text-xs font-bold transition-colors',
                        active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {BUDGET_LABEL[budget]}
                    </button>
                  )
                })}
              </div>
            </div>

            <Button
              onClick={() => void submit()}
              disabled={submitting}
              className="mt-6 h-13 w-full rounded-full text-base font-bold"
            >
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {editing ? 'ذخیره تغییرات' : 'افزودن به بانک غذا'}
            </Button>
            {editing && (
              <button
                type="button"
                onClick={cancelEdit}
                className="mt-2 w-full cursor-pointer rounded-full py-2 text-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                انصراف
              </button>
            )}
          </section>

          {/* List */}
          <section aria-label="غذاهای بانک" className="mt-8">
            <h2 className="text-[15px] font-bold">غذاهای بانک</h2>
            <div className="relative mt-3">
              <Search
                className="absolute start-3.5 top-1/2 size-4.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                placeholder="جستجو در بانک…"
                className="h-12 rounded-2xl border-border/80 bg-card ps-11 text-[15px]"
                aria-label="جستجوی بانک غذا"
              />
            </div>

            <div className="mt-3 space-y-1.5">
              {listLoading && foods.length === 0 ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/70" />
                  ))}
                </div>
              ) : foods.length === 0 ? (
                <p className="px-1 py-8 text-center text-sm text-muted-foreground">
                  چیزی پیدا نشد.
                </p>
              ) : (
                foods.map((food) => {
                  const badge = SOURCE_BADGE[food.source]
                  const def = food.servings.find((s) => s.isDefault) ?? food.servings[0]
                  return (
                    <div
                      key={food.id}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl border bg-card px-3 py-2.5 transition-colors',
                        editing?.id === food.id ? 'border-primary/50' : 'border-border/60',
                      )}
                    >
                      {food.imageUrl ? (
                        <img
                          src={food.imageUrl}
                          alt=""
                          aria-hidden
                          className="size-12 shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted">
                          <UtensilsCrossed className="size-5 text-muted-foreground/70" strokeWidth={1.6} aria-hidden />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{food.nameFa}</p>
                        <p className="tnum mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">
                          {catLabel(food.category)}
                          {' · '}
                          {enDigits(Math.round(food.kcalPer100g))} کیلوکالری در 100 گرم
                          {def ? ` · ${def.labelFa}` : ''}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {badge && (
                            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', badge.className)}>
                              {badge.label}
                            </span>
                          )}
                          {food.mealSlots.length > 0 && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {food.mealSlots.map((s) => MEAL_SLOT_LABEL[s]).join('، ')}
                            </span>
                          )}
                          {food.budgetLevel && (
                            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand-strong">
                              {BUDGET_LABEL[food.budgetLevel]}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => startEdit(food)}
                          aria-label={`ویرایش ${food.nameFa}`}
                          className="flex size-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="size-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(food)}
                          aria-label={`حذف ${food.nameFa}`}
                          className="flex size-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </section>
        </div>
      ) : section === 'PLAN' ? (
        <div id="admin-panel-plan" role="tabpanel">
          {/* Plan board */}
          <section aria-label="گزینه‌های برنامه‌ساز" className="mt-6">
            <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-[0_1px_3px_oklch(0.175_0_0/0.05)]">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft">
                  <CalendarRange className="size-4.5 text-brand-strong" strokeWidth={1.7} aria-hidden />
                </span>
                <h2 className="text-[15px] font-bold">گزینه‌های برنامه‌ساز</h2>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                هوش مصنوعی فقط از غذاهایی برنامه می‌سازد که اینجا با وعده و بودجه ثبت شده‌اند. بودجه
                سلسله‌مراتبی است: «آزاد» شامل همه، «متوسط» شامل اقتصادی و متوسط، «اقتصادی» فقط اقتصادی.
              </p>
            </div>

            {planLoading && planFoods.length === 0 ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-40 animate-pulse rounded-3xl bg-muted/70" />
                ))}
              </div>
            ) : (
              MEAL_SLOT_ORDER.map((slot) => {
                const slotFoods = planFoods.filter((f) => f.mealSlots.includes(slot))
                return (
                  <div
                    key={slot}
                    className="mt-4 rounded-3xl border border-border/70 bg-card p-4 shadow-[0_1px_3px_oklch(0.175_0_0/0.05)]"
                  >
                    <h3 className="flex items-center gap-2 text-sm font-bold">
                      {MEAL_SLOT_LABEL[slot]}
                      <span className="tnum text-[11px] font-normal text-muted-foreground">
                        {enDigits(slotFoods.length)} گزینه
                      </span>
                    </h3>

                    <div className="mt-3 space-y-3">
                      {BUDGET_ORDER.map((budget) => {
                        const rows = planFoods.filter(
                          (f) => f.budgetLevel === budget && f.mealSlots.includes(slot),
                        )
                        return (
                          <div
                            key={budget}
                            className={cn(
                              'rounded-2xl border p-3',
                              rows.length === 0 ? 'border-dashed border-border/80' : 'border-border/60 bg-background/60',
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] font-bold text-muted-foreground">
                                {BUDGET_LABEL[budget]}
                                <span className="tnum ms-1.5 font-normal">({enDigits(rows.length)})</span>
                              </p>
                              <button
                                type="button"
                                onClick={() => startPresetAdd(slot, budget)}
                                className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-primary transition-opacity hover:opacity-75"
                                aria-label={`افزودن گزینه ${BUDGET_LABEL[budget]} برای ${MEAL_SLOT_LABEL[slot]}`}
                              >
                                <Plus className="size-3.5" aria-hidden />
                                افزودن
                              </button>
                            </div>

                            {rows.length === 0 ? (
                              <p className="py-3 text-center text-[11px] text-muted-foreground">
                                گزینه‌ای ثبت نشده
                              </p>
                            ) : (
                              <ul className="mt-2 space-y-0.5">
                                {rows.map((f) => (
                                  <li key={f.id} className="flex items-center gap-2.5 rounded-xl px-0.5 py-1.5">
                                    {f.imageUrl ? (
                                      <img
                                        src={f.imageUrl}
                                        alt=""
                                        aria-hidden
                                        className="size-8 shrink-0 rounded-lg object-cover"
                                      />
                                    ) : (
                                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                                        <UtensilsCrossed className="size-3.5 text-muted-foreground/70" strokeWidth={1.6} aria-hidden />
                                      </span>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-xs font-bold">{f.nameFa}</p>
                                      <p className="tnum truncate text-[10px] leading-4 text-muted-foreground">
                                        {enDigits(Math.round(f.kcalPer100g))} کیلوکالری در 100 گرم
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => startEdit(f)}
                                      aria-label={`ویرایش ${f.nameFa}`}
                                      className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                                    >
                                      <Pencil className="size-3.5" aria-hidden />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeleting(f)}
                                      aria-label={`حذف ${f.nameFa}`}
                                      className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                                    >
                                      <Trash2 className="size-3.5" aria-hidden />
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            )}
          </section>
        </div>
      ) : (
        <div id="admin-panel-ai" role="tabpanel">
          <AiSettingsPanel />
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent className="max-w-xs rounded-3xl">
          <AlertDialogHeader className="text-start">
            <AlertDialogTitle>حذف «{deleting?.nameFa}»؟</AlertDialogTitle>
            <AlertDialogDescription>
              این غذا از بانک و جستجو حذف می‌شود؛ رکوردهای ثبت‌شده قبلی در دفتر باقی می‌مانند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2">
            <AlertDialogCancel className="mt-0 flex-1 rounded-full">انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              className="flex-1 rounded-full bg-destructive text-white hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
