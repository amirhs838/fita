/**
 * Fita food database seed — Iranian & common foods.
 * Per-100g baseline values are deterministic references (Iranian food composition + USDA approximations).
 * Run: bun prisma/seed-foods.ts   (idempotent: wipes previous SEED rows, keeps user logs safe via SetNull)
 */
import { PrismaClient } from '@prisma/client'
import { normalizeFaSearch } from '../src/lib/food-search'

const prisma = new PrismaClient()

// [nameFa, nameEn, category, foodType, isIranian, kcal, protein, carbs, fat, fiber, sugar, sodium, servings[]]
// serving: [labelFa, unitType, grams, isDefault]
interface FoodSeed {
  n: string
  e?: string
  c: string
  t: 'DISH' | 'INGREDIENT' | 'BRAND'
  ir: boolean
  kcal: number
  p: number
  cb: number
  f: number
  fib?: number
  sug?: number
  na?: number
  a?: string // extra search aliases
  s: [string, string, number, boolean?][]
}

const FOODS: FoodSeed[] = [
  // ── برنج و پلوها ──
  { n: 'چلو (برنج سفید پخته)', e: 'Plain steamed rice', c: 'RICE', t: 'DISH', ir: true, kcal: 130, p: 2.7, cb: 28.2, f: 0.3, fib: 0.6, s: [['یک بشقاب', 'PLATE', 300, true], ['یک کفگیر', 'LADLE', 180], ['نصف بشقاب', 'PLATE', 150]] },
  { n: 'کته برنج', e: 'Kateh rice', c: 'RICE', t: 'DISH', ir: true, kcal: 132, p: 2.7, cb: 28.6, f: 0.4, fib: 0.6, a: 'کته', s: [['یک کفگیر', 'LADLE', 180, true], ['یک بشقاب', 'PLATE', 300]] },
  { n: 'پلو سبزی', e: 'Herb rice', c: 'RICE', t: 'DISH', ir: true, kcal: 150, p: 3.3, cb: 27.5, f: 3.2, fib: 1.8, s: [['یک بشقاب', 'PLATE', 320, true], ['یک کفگیر', 'LADLE', 190]] },
  { n: 'باقالی پلو با گوشت', e: 'Dill rice with meat', c: 'RICE', t: 'DISH', ir: true, kcal: 175, p: 7.5, cb: 27, f: 4.3, fib: 2.4, s: [['یک بشقاب', 'PLATE', 350, true], ['یک کفگیر', 'LADLE', 200]] },
  { n: 'زرشک پلو با مرغ', e: 'Barberry rice with chicken', c: 'RICE', t: 'DISH', ir: true, kcal: 165, p: 8, cb: 26, f: 3.6, fib: 1.5, s: [['یک بشقاب', 'PLATE', 350, true], ['یک کفگیر', 'LADLE', 200]] },
  { n: 'عدس پلو', e: 'Lentil rice', c: 'RICE', t: 'DISH', ir: true, kcal: 165, p: 5.5, cb: 28, f: 3.8, fib: 3, a: 'عدس پلو با کشمش', s: [['یک بشقاب', 'PLATE', 350, true], ['یک کفگیر', 'LADLE', 200]] },
  { n: 'لوبیا پلو با گوشت', e: 'Green bean rice with meat', c: 'RICE', t: 'DISH', ir: true, kcal: 170, p: 7, cb: 26.5, f: 4.5, fib: 2.6, s: [['یک بشقاب', 'PLATE', 350, true], ['یک کفگیر', 'LADLE', 200]] },
  { n: 'استامبولی پلو', e: 'Cabbage rice', c: 'RICE', t: 'DISH', ir: true, kcal: 155, p: 4.5, cb: 27, f: 3.5, fib: 1.6, s: [['یک بشقاب', 'PLATE', 320, true], ['یک کفگیر', 'LADLE', 190]] },

  // ── خورشت‌ها و خوراک‌ها ──
  { n: 'خورشت قورمه سبزی', e: 'Ghormeh sabzi', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 110, p: 6.5, cb: 6.5, f: 6, fib: 2.8, na: 420, a: 'قرمه سبزی قورمه‌سبزی', s: [['یک ملاقه', 'LADLE', 250, true], ['یک بشقاب خورشتی', 'PLATE', 200]] },
  { n: 'خورشت قیمه', e: 'Khoresh gheymeh', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 105, p: 6, cb: 8, f: 5, fib: 2, a: 'قيمه', s: [['یک ملاقه', 'LADLE', 250, true], ['یک بشقاب خورشتی', 'PLATE', 200]] },
  { n: 'خورشت فسنجان', e: 'Fesenjan', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 185, p: 5, cb: 10, f: 14.5, sug: 4, a: 'فسنجون', s: [['یک ملاقه', 'LADLE', 220, true], ['یک بشقاب خورشتی', 'PLATE', 180]] },
  { n: 'خورشت بادمجان', e: 'Eggplant stew', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 95, p: 3.2, cb: 7.5, f: 5.8, s: [['یک ملاقه', 'LADLE', 240, true]] },
  { n: 'خورشت کرفس', e: 'Celery stew', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 85, p: 4.5, cb: 6, f: 4.4, s: [['یک ملاقه', 'LADLE', 240, true]] },
  { n: 'خورشت هویج', e: 'Carrot stew', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 90, p: 4, cb: 9, f: 4.5, s: [['یک ملاقه', 'LADLE', 240, true]] },
  { n: 'خورشت اسفناج و آلو', e: 'Spinach prune stew', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 80, p: 3.8, cb: 7, f: 4, s: [['یک ملاقه', 'LADLE', 240, true]] },
  { n: 'خوراک لوبیا سبز با گوشت', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 85, p: 5, cb: 6.5, f: 4.2, s: [['یک بشقاب', 'PLATE', 220, true]] },
  { n: 'کشک بادمجان', e: 'Kashke bademjan', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 135, p: 4.2, cb: 8.5, f: 9.3, s: [['یک بشقاب کوچک', 'PLATE', 150, true]] },
  { n: 'میرزا قاسمی', e: 'Mirza ghasemi', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 125, p: 3.8, cb: 9.5, f: 8.2, s: [['یک بشقاب کوچک', 'PLATE', 150, true]] },
  { n: 'آبگوشت بزباش', e: 'Abgoosht', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 125, p: 8, cb: 7, f: 7, na: 450, a: 'آبگوشت', s: [['یک بشقاب آبگوشت‌خوری', 'PLATE', 400, true]] },
  { n: 'حلیم گندم و گوشت', e: 'Halim', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 145, p: 6.5, cb: 20, f: 4.4, s: [['یک بشقاب', 'PLATE', 300, true]] },
  { n: 'عدسی', e: 'Lentil soup', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 72, p: 4.4, cb: 11, f: 1.4, fib: 3, s: [['یک کاسه', 'CUP', 250, true]] },
  { n: 'سوپ جو', e: 'Barley soup', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 65, p: 2.4, cb: 9.5, f: 2, s: [['یک کاسه', 'CUP', 250, true]] },
  { n: 'آش رشته', e: 'Ash reshteh', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 88, p: 2.9, cb: 12.5, f: 2.9, fib: 1.9, a: 'اَش رشته', s: [['یک کفگیر بزرگ', 'LADLE', 320, true], ['یک کاسه', 'CUP', 220]] },
  { n: 'املت گوجه', e: 'Tomato omelette', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 150, p: 7.3, cb: 4.5, f: 11.4, a: 'املت', s: [['یک بشقاب', 'PLATE', 200, true]] },
  { n: 'نیمرو (دو تخم‌مرغ)', e: 'Fried eggs', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 190, p: 10.4, cb: 1.2, f: 16, s: [['یک بشقاب', 'PLATE', 160, true]] },

  // ── کباب‌ها ──
  { n: 'کباب کوبیده', e: 'Koobideh kebab', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 213, p: 15, cb: 4.2, f: 15.4, na: 300, a: 'کباب کوبیده', s: [['یک سیخ', 'SKEWER', 110, true], ['دو سیخ', 'SKEWER', 220]] },
  { n: 'کباب برگ', e: 'Barg kebab', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 195, p: 22.5, cb: 1, f: 10.5, a: 'برگ', s: [['یک سیخ', 'SKEWER', 120, true]] },
  { n: 'جوجه کباب بی‌استخوان (سینه)', e: 'Chicken breast kebab', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 152, p: 25.5, cb: 0.8, f: 4.6, s: [['یک سیخ', 'SKEWER', 130, true]] },
  { n: 'جوجه کباب با پوست و استخوان', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 182, p: 21.5, cb: 1, f: 9.8, s: [['یک سیخ', 'SKEWER', 140, true]] },
  { n: 'شیشلیک', e: 'Shishlik', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 225, p: 18, cb: 1.2, f: 16, s: [['یک سیخ', 'SKEWER', 160, true]] },
  { n: 'چلوکباب کوبیده', e: 'Chelo kabab koobideh', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 165, p: 8.8, cb: 21.5, f: 5.4, a: 'چلو کباب', s: [['یک بشقاب کامل (یک سیخ)', 'PLATE', 420, true], ['نصف بشقاب', 'PLATE', 210]] },
  { n: 'کباب بختیاری', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 200, p: 18.5, cb: 2, f: 12.8, s: [['یک سیخ', 'SKEWER', 130, true]] },
  { n: 'دل و جگر', e: 'Liver and heart', c: 'MAIN_DISH', t: 'DISH', ir: true, kcal: 205, p: 21.5, cb: 3.5, f: 12, s: [['یک بشقاب کوچک', 'PLATE', 130, true]] },

  // ── نان‌ها ──
  { n: 'نان سنگک', e: 'Sangak bread', c: 'BREAD', t: 'INGREDIENT', ir: true, kcal: 275, p: 9, cb: 55, f: 1.4, fib: 2.9, s: [['یک تکه', 'SLICE', 60, true]] },
  { n: 'نان بربری', e: 'Barbari bread', c: 'BREAD', t: 'INGREDIENT', ir: true, kcal: 282, p: 8.6, cb: 56, f: 1.6, s: [['یک تکه', 'SLICE', 80, true]] },
  { n: 'نان تافتون', e: 'Taftoon bread', c: 'BREAD', t: 'INGREDIENT', ir: true, kcal: 276, p: 8.4, cb: 56, f: 1.1, s: [['یک تکه', 'SLICE', 50, true]] },
  { n: 'نان لواش', e: 'Lavash bread', c: 'BREAD', t: 'INGREDIENT', ir: true, kcal: 267, p: 8.6, cb: 53, f: 1.5, s: [['یک تکه', 'SLICE', 40, true]] },
  { n: 'نان جو سبوس‌دار', e: 'Whole wheat bread', c: 'BREAD', t: 'INGREDIENT', ir: true, kcal: 250, p: 10, cb: 43, f: 3.6, fib: 7, s: [['یک تکه', 'SLICE', 60, true]] },
  { n: 'نان تست سفید', e: 'White toast', c: 'BREAD', t: 'INGREDIENT', ir: false, kcal: 289, p: 9, cb: 52, f: 4, s: [['یک برش', 'SLICE', 25, true]] },

  // ── لبنیات ──
  { n: 'شیر پرچرب', e: 'Whole milk', c: 'DAIRY', t: 'INGREDIENT', ir: false, kcal: 61, p: 3.2, cb: 4.8, f: 3.3, sug: 4.8, s: [['یک لیوان', 'GLASS', 200, true]] },
  { n: 'شیر کم‌چرب', e: 'Low-fat milk', c: 'DAIRY', t: 'INGREDIENT', ir: false, kcal: 43, p: 3.4, cb: 5, f: 1, sug: 5, s: [['یک لیوان', 'GLASS', 200, true]] },
  { n: 'ماست پرچرب', e: 'Whole yogurt', c: 'DAIRY', t: 'INGREDIENT', ir: true, kcal: 72, p: 3.6, cb: 4.8, f: 3.6, s: [['یک کفگیر', 'LADLE', 100, true], ['یک کاسه', 'CUP', 150]] },
  { n: 'ماست کم‌چرب', e: 'Low-fat yogurt', c: 'DAIRY', t: 'INGREDIENT', ir: true, kcal: 48, p: 4.2, cb: 5.2, f: 0.9, s: [['یک کفگیر', 'LADLE', 100, true]] },
  { n: 'ماست چکیده', e: 'Strained yogurt', c: 'DAIRY', t: 'INGREDIENT', ir: true, kcal: 130, p: 8.5, cb: 5.5, f: 8, s: [['یک قاشق غذاخوری', 'SPOON', 30, true]] },
  { n: 'ماست یونانی', e: 'Greek yogurt', c: 'DAIRY', t: 'INGREDIENT', ir: false, kcal: 97, p: 9, cb: 3.9, f: 5, s: [['یک کاسه', 'CUP', 150, true]] },
  { n: 'پنیر سفید ایرانی', e: 'Iranian white cheese', c: 'DAIRY', t: 'INGREDIENT', ir: true, kcal: 262, p: 16.5, cb: 2.4, f: 21, na: 800, a: 'پنیر لیقوان', s: [['یک تکه', 'SLICE', 30, true]] },
  { n: 'پنیر خامه‌ای', e: 'Cream cheese', c: 'DAIRY', t: 'INGREDIENT', ir: false, kcal: 305, p: 7, cb: 4, f: 29.5, s: [['یک قاشق غذاخوری', 'SPOON', 20, true]] },
  { n: 'خامه پرچرب', e: 'Cream', c: 'DAIRY', t: 'INGREDIENT', ir: true, kcal: 345, p: 2.4, cb: 2.8, f: 36.5, s: [['یک قاشق غذاخوری', 'SPOON', 20, true]] },
  { n: 'کشک', e: 'Kashk (whey)', c: 'DAIRY', t: 'INGREDIENT', ir: true, kcal: 128, p: 8.2, cb: 6, f: 7.6, na: 600, s: [['یک قاشق غذاخوری', 'SPOON', 30, true]] },
  { n: 'دوغ', e: 'Doogh', c: 'DAIRY', t: 'INGREDIENT', ir: true, kcal: 42, p: 1.8, cb: 3.4, f: 1.9, na: 300, s: [['یک لیوان', 'GLASS', 250, true]] },
  { n: 'کره حیوانی', e: 'Butter', c: 'DAIRY', t: 'INGREDIENT', ir: false, kcal: 717, p: 0.9, cb: 0.1, f: 81, s: [['یک قاشق چای‌خوری', 'SPOON', 7, true]] },
  { n: 'پنیر پیتزا رنده‌شده', e: 'Shredded mozzarella', c: 'DAIRY', t: 'INGREDIENT', ir: false, kcal: 300, p: 22, cb: 3.1, f: 22, s: [['یک مشت', 'PIECE', 30, true]] },

  // ── پروتئین‌ها ──
  { n: 'سینه مرغ گریل‌شده', e: 'Grilled chicken breast', c: 'PROTEIN', t: 'DISH', ir: false, kcal: 165, p: 31, cb: 0, f: 3.6, s: [['یک تکه', 'PIECE', 100, true]] },
  { n: 'ران مرغ با پوست (پخته)', c: 'PROTEIN', t: 'DISH', ir: false, kcal: 209, p: 26, cb: 0, f: 11, s: [['یک عدد', 'PIECE', 130, true]] },
  { n: 'تخم‌مرغ آب‌پز', e: 'Boiled egg', c: 'PROTEIN', t: 'DISH', ir: false, kcal: 155, p: 12.6, cb: 1.1, f: 10.6, s: [['یک عدد', 'PIECE', 55, true]] },
  { n: 'سفیده تخم‌مرغ', e: 'Egg white', c: 'PROTEIN', t: 'DISH', ir: false, kcal: 52, p: 10.9, cb: 0.7, f: 0.2, s: [['یک عدد', 'PIECE', 33, true]] },
  { n: 'گوشت گوساله پخته (خورشتی)', c: 'PROTEIN', t: 'DISH', ir: false, kcal: 232, p: 27, cb: 0, f: 13, s: [['چند تکه', 'PIECE', 90, true]] },
  { n: 'فیله گوشت گریل', e: 'Grilled beef fillet', c: 'PROTEIN', t: 'DISH', ir: false, kcal: 220, p: 26.5, cb: 0, f: 12, s: [['یک تکه', 'PIECE', 100, true]] },
  { n: 'ماهی قزل‌آلا', e: 'Trout', c: 'PROTEIN', t: 'DISH', ir: true, kcal: 180, p: 23.5, cb: 0, f: 9, s: [['یک عدد متوسط', 'PIECE', 150, true]] },
  { n: 'ماهی سفید', e: 'White fish', c: 'PROTEIN', t: 'DISH', ir: true, kcal: 150, p: 22.3, cb: 0, f: 6.4, s: [['یک تکه', 'PIECE', 130, true]] },
  { n: 'تن ماهی در روغن (آبکش‌شده)', e: 'Canned tuna in oil', c: 'PROTEIN', t: 'INGREDIENT', ir: true, kcal: 198, p: 27, cb: 0, f: 9.5, s: [['یک قوطی', 'PIECE', 80, true]] },
  { n: 'تن ماهی در آب', e: 'Canned tuna in water', c: 'PROTEIN', t: 'INGREDIENT', ir: true, kcal: 116, p: 25.8, cb: 0, f: 0.8, s: [['یک قوطی', 'PIECE', 80, true]] },
  { n: 'میگو پخته', e: 'Shrimp', c: 'PROTEIN', t: 'DISH', ir: true, kcal: 99, p: 24, cb: 0.2, f: 0.3, s: [['یک بشقاب کوچک', 'PLATE', 100, true]] },

  // ── سبزیجات ──
  { n: 'خیار', e: 'Cucumber', c: 'VEGETABLE', t: 'INGREDIENT', ir: false, kcal: 15, p: 0.7, cb: 3.6, f: 0.1, fib: 0.5, s: [['یک عدد', 'PIECE', 100, true]] },
  { n: 'گوجه‌فرنگی', e: 'Tomato', c: 'VEGETABLE', t: 'INGREDIENT', ir: false, kcal: 18, p: 0.9, cb: 3.9, f: 0.2, fib: 1.2, s: [['یک عدد', 'PIECE', 120, true]] },
  { n: 'سبزی خوردن', c: 'VEGETABLE', t: 'DISH', ir: true, kcal: 32, p: 2.6, cb: 4.6, f: 0.4, fib: 2.1, s: [['یک بشقاب کوچک', 'PLATE', 100, true]] },
  { n: 'سالاد شیرازی', e: 'Shirazi salad', c: 'VEGETABLE', t: 'DISH', ir: true, kcal: 42, p: 1, cb: 7.2, f: 0.9, fib: 1.4, s: [['یک بشقاب', 'PLATE', 180, true]] },
  { n: 'سالاد فصل', e: 'Garden salad', c: 'VEGETABLE', t: 'DISH', ir: false, kcal: 55, p: 1.2, cb: 7.5, f: 2.2, fib: 1.8, s: [['یک بشقاب', 'PLATE', 200, true]] },
  { n: 'سیب‌زمینی آب‌پز', e: 'Boiled potato', c: 'VEGETABLE', t: 'INGREDIENT', ir: false, kcal: 87, p: 2, cb: 20.1, f: 0.1, fib: 1.8, s: [['یک عدد متوسط', 'PIECE', 150, true]] },
  { n: 'هویج خام', e: 'Carrot', c: 'VEGETABLE', t: 'INGREDIENT', ir: false, kcal: 41, p: 0.9, cb: 9.6, f: 0.2, fib: 2.8, s: [['یک عدد', 'PIECE', 70, true]] },
  { n: 'بادمجان سرخ‌شده', e: 'Fried eggplant', c: 'VEGETABLE', t: 'DISH', ir: true, kcal: 165, p: 1.2, cb: 9, f: 13, s: [['یک بشقاب کوچک', 'PLATE', 100, true]] },
  { n: 'کدو سبز پخته', e: 'Zucchini', c: 'VEGETABLE', t: 'INGREDIENT', ir: false, kcal: 20, p: 1.2, cb: 3.6, f: 0.3, fib: 1, s: [['چند عدد', 'PIECE', 120, true]] },
  { n: 'ترشی مخلوط', e: 'Mixed pickles', c: 'VEGETABLE', t: 'DISH', ir: true, kcal: 25, p: 0.8, cb: 5, f: 0.2, s: [['یک قاشق', 'SPOON', 30, true]] },
  { n: 'زیتون پرورده', e: 'Marinated olives', c: 'VEGETABLE', t: 'DISH', ir: true, kcal: 152, p: 1, cb: 5.8, f: 13.5, na: 700, s: [['چند عدد', 'PIECE', 30, true]] },
  { n: 'نخود سبز آب‌پز', e: 'Green peas', c: 'VEGETABLE', t: 'INGREDIENT', ir: false, kcal: 84, p: 5.4, cb: 15.6, f: 0.4, fib: 5.5, s: [['یک کفگیر', 'LADLE', 150, true]] },

  // ── میوه‌ها ──
  { n: 'سیب', e: 'Apple', c: 'FRUIT', t: 'INGREDIENT', ir: false, kcal: 52, p: 0.3, cb: 13.8, f: 0.2, fib: 2.4, sug: 10.4, s: [['یک عدد متوسط', 'PIECE', 150, true]] },
  { n: 'پرتقال', e: 'Orange', c: 'FRUIT', t: 'INGREDIENT', ir: false, kcal: 47, p: 0.9, cb: 11.8, f: 0.1, fib: 2.4, sug: 9.4, s: [['یک عدد', 'PIECE', 130, true]] },
  { n: 'موز', e: 'Banana', c: 'FRUIT', t: 'INGREDIENT', ir: false, kcal: 89, p: 1.1, cb: 22.8, f: 0.3, fib: 2.6, sug: 12.2, s: [['یک عدد', 'PIECE', 120, true]] },
  { n: 'هندوانه', e: 'Watermelon', c: 'FRUIT', t: 'INGREDIENT', ir: true, kcal: 30, p: 0.6, cb: 7.6, f: 0.2, fib: 0.4, sug: 6.2, s: [['یک برش بزرگ', 'SLICE', 300, true]] },
  { n: 'طالبی', e: 'Cantaloupe', c: 'FRUIT', t: 'INGREDIENT', ir: true, kcal: 34, p: 0.8, cb: 8.2, f: 0.2, fib: 0.9, s: [['یک برش', 'SLICE', 200, true]] },
  { n: 'انار', e: 'Pomegranate', c: 'FRUIT', t: 'INGREDIENT', ir: true, kcal: 83, p: 1.7, cb: 18.7, f: 1.2, fib: 4, sug: 13.7, s: [['یک عدد (محتوا)', 'PIECE', 170, true]] },
  { n: 'انگور', e: 'Grapes', c: 'FRUIT', t: 'INGREDIENT', ir: false, kcal: 69, p: 0.7, cb: 18.1, f: 0.2, fib: 0.9, sug: 15.5, s: [['یک خوشه کوچک', 'PIECE', 100, true]] },
  { n: 'خرما', e: 'Date', c: 'FRUIT', t: 'INGREDIENT', ir: true, kcal: 282, p: 2.5, cb: 75, f: 0.4, fib: 6.7, sug: 63, s: [['یک عدد', 'PIECE', 8, true]] },
  { n: 'کیوی', e: 'Kiwi', c: 'FRUIT', t: 'INGREDIENT', ir: false, kcal: 61, p: 1.1, cb: 14.7, f: 0.5, fib: 3, s: [['یک عدد', 'PIECE', 75, true]] },
  { n: 'هلو', e: 'Peach', c: 'FRUIT', t: 'INGREDIENT', ir: false, kcal: 39, p: 0.9, cb: 9.5, f: 0.3, fib: 1.5, s: [['یک عدد', 'PIECE', 150, true]] },
  { n: 'زردآلو', e: 'Apricot', c: 'FRUIT', t: 'INGREDIENT', ir: false, kcal: 48, p: 1.4, cb: 11.1, f: 0.4, fib: 2, s: [['یک عدد', 'PIECE', 35, true]] },
  { n: 'آلبالو', e: 'Sour cherry', c: 'FRUIT', t: 'INGREDIENT', ir: true, kcal: 50, p: 1, cb: 12.2, f: 0.3, fib: 1.6, s: [['یک مشت کوچک', 'PIECE', 80, true]] },
  { n: 'توت‌فرنگی', e: 'Strawberry', c: 'FRUIT', t: 'INGREDIENT', ir: false, kcal: 32, p: 0.7, cb: 7.7, f: 0.3, fib: 2, s: [['یک ظرف کوچک', 'CUP', 150, true]] },

  // ── فست‌فود ──
  { n: 'ساندویچ برگر', e: 'Burger', c: 'FAST_FOOD', t: 'DISH', ir: false, kcal: 290, p: 15, cb: 26, f: 14.2, na: 500, s: [['یک عدد', 'PIECE', 200, true]] },
  { n: 'چیزبرگر', e: 'Cheeseburger', c: 'FAST_FOOD', t: 'DISH', ir: false, kcal: 310, p: 16.3, cb: 26, f: 16.5, na: 560, s: [['یک عدد', 'PIECE', 220, true]] },
  { n: 'هات‌داگ', e: 'Hot dog', c: 'FAST_FOOD', t: 'DISH', ir: false, kcal: 268, p: 10.8, cb: 22, f: 16, na: 620, s: [['یک عدد', 'PIECE', 150, true]] },
  { n: 'پیتزا پپرونی', e: 'Pepperoni pizza', c: 'FAST_FOOD', t: 'DISH', ir: false, kcal: 282, p: 12.3, cb: 30, f: 12.7, na: 640, s: [['یک برش', 'SLICE', 110, true]] },
  { n: 'پیتزا مارگاریتا', e: 'Margherita pizza', c: 'FAST_FOOD', t: 'DISH', ir: false, kcal: 264, p: 11.2, cb: 30, f: 10.6, na: 550, s: [['یک برش', 'SLICE', 110, true]] },
  { n: 'سیب‌زمینی سرخ‌کرده', e: 'French fries', c: 'FAST_FOOD', t: 'DISH', ir: false, kcal: 312, p: 3.4, cb: 41, f: 15, na: 210, a: 'سیب زمینی', s: [['یک بشقاب کوچک', 'PLATE', 120, true]] },
  { n: 'ساندویچ سینه مرغ گریل', e: 'Grilled chicken sandwich', c: 'FAST_FOOD', t: 'DISH', ir: false, kcal: 188, p: 18, cb: 21.5, f: 3.9, s: [['یک عدد', 'PIECE', 220, true]] },
  { n: 'دنر کباب', e: 'Doner kebab', c: 'FAST_FOOD', t: 'DISH', ir: false, kcal: 228, p: 13, cb: 22, f: 11, a: 'ترکی', s: [['یک عدد', 'PIECE', 300, true]] },
  { n: 'فلافل', e: 'Falafel', c: 'FAST_FOOD', t: 'DISH', ir: true, kcal: 333, p: 10.8, cb: 31.8, f: 18.4, fib: 4.9, s: [['یک عدد', 'PIECE', 30, true]] },
  { n: 'ناگت مرغ', e: 'Chicken nuggets', c: 'FAST_FOOD', t: 'DISH', ir: false, kcal: 292, p: 15.2, cb: 18.3, f: 18, s: [['یک عدد', 'PIECE', 20, true]] },
  { n: 'کتلت', e: 'Cutlet', c: 'FAST_FOOD', t: 'DISH', ir: true, kcal: 240, p: 8.5, cb: 20, f: 14, s: [['یک عدد', 'PIECE', 90, true]] },
  { n: 'ساندویچ کوکو سبزی', e: 'Kookoo sabzi sandwich', c: 'FAST_FOOD', t: 'DISH', ir: true, kcal: 225, p: 6.5, cb: 22, f: 12.5, s: [['یک عدد', 'PIECE', 110, true]] },

  // ── آجیل و تنقلات ──
  { n: 'پسته بوداده', e: 'Roasted pistachio', c: 'SNACK', t: 'INGREDIENT', ir: true, kcal: 560, p: 21, cb: 28, f: 45, fib: 10.3, s: [['یک مشت کوچک', 'PIECE', 30, true]] },
  { n: 'بادام درختی', e: 'Almond', c: 'SNACK', t: 'INGREDIENT', ir: false, kcal: 579, p: 21.2, cb: 21.6, f: 49.9, fib: 12.5, s: [['یک مشت کوچک', 'PIECE', 28, true]] },
  { n: 'گردو', e: 'Walnut', c: 'SNACK', t: 'INGREDIENT', ir: false, kcal: 654, p: 15.2, cb: 13.7, f: 65.2, fib: 6.7, s: [['یک مشت کوچک', 'PIECE', 28, true]] },
  { n: 'تخمه آفتابگردان', e: 'Sunflower seeds', c: 'SNACK', t: 'INGREDIENT', ir: true, kcal: 584, p: 20.8, cb: 20, f: 51.5, fib: 8.6, a: 'ژرمن', s: [['یک مشت کوچک', 'PIECE', 30, true]] },
  { n: 'تخمه کدو', e: 'Pumpkin seeds', c: 'SNACK', t: 'INGREDIENT', ir: true, kcal: 559, p: 30.2, cb: 10.7, f: 49, fib: 6, s: [['یک مشت کوچک', 'PIECE', 30, true]] },
  { n: 'آجیل مخلوط', e: 'Mixed nuts', c: 'SNACK', t: 'INGREDIENT', ir: true, kcal: 590, p: 18, cb: 25, f: 49, fib: 8, s: [['یک مشت', 'PIECE', 30, true]] },
  { n: 'کشمش پلویی', e: 'Raisins', c: 'SNACK', t: 'INGREDIENT', ir: true, kcal: 299, p: 3.1, cb: 79.2, f: 0.5, fib: 3.7, sug: 59, s: [['یک قاشق غذاخوری', 'SPOON', 10, true]] },
  { n: 'چیپس سیب‌زمینی', e: 'Potato chips', c: 'SNACK', t: 'BRAND', ir: false, kcal: 536, p: 7, cb: 53, f: 34, na: 525, s: [['یک کیسه کوچک', 'PIECE', 30, true]] },
  { n: 'پاپ‌کورن ساده', e: 'Popcorn', c: 'SNACK', t: 'DISH', ir: false, kcal: 387, p: 12.9, cb: 78, f: 4.5, fib: 14.5, s: [['یک کاسه', 'CUP', 30, true]] },
  { n: 'بیسکویت ساده', e: 'Plain biscuit', c: 'SNACK', t: 'BRAND', ir: false, kcal: 430, p: 7, cb: 70, f: 13, sug: 20, s: [['یک عدد', 'PIECE', 12, true]] },
  { n: 'شکلات شیری', e: 'Milk chocolate', c: 'SNACK', t: 'INGREDIENT', ir: false, kcal: 535, p: 7.6, cb: 59.4, f: 30, sug: 51.5, s: [['یک قطعه کوچک', 'PIECE', 10, true]] },
  { n: 'حلوا ارده', e: 'Halva ardeh (tahini halva)', c: 'SNACK', t: 'INGREDIENT', ir: true, kcal: 420, p: 8, cb: 48, f: 22, sug: 35, a: 'حلوای ارده', s: [['یک قاشق', 'SPOON', 30, true]] },

  // ── شیرینی و دسر ──
  { n: 'بستنی وانیلی', e: 'Vanilla ice cream', c: 'SWEET', t: 'DISH', ir: false, kcal: 207, p: 3.5, cb: 23.6, f: 11, sug: 21, s: [['یک اسکوپ', 'PIECE', 60, true]] },
  { n: 'بستنی سنتی زعفرانی', e: 'Traditional saffron ice cream', c: 'SWEET', t: 'DISH', ir: true, kcal: 218, p: 4.2, cb: 27, f: 10.6, sug: 24, a: 'بستنی ایرانی', s: [['یک بشقاب کوچک', 'PLATE', 80, true]] },
  { n: 'شله زرد', e: 'Sholeh zard', c: 'SWEET', t: 'DISH', ir: true, kcal: 145, p: 2.8, cb: 28.5, f: 2.8, sug: 14, s: [['یک بشقاب کوچک', 'PLATE', 150, true]] },
  { n: 'فرنی', e: 'Ferni (rice pudding)', c: 'SWEET', t: 'DISH', ir: true, kcal: 122, p: 2.5, cb: 20.5, f: 3.2, sug: 12, s: [['یک بشقاب کوچک', 'PLATE', 150, true]] },
  { n: 'حلوا', e: 'Halva', c: 'SWEET', t: 'DISH', ir: true, kcal: 380, p: 3.4, cb: 55, f: 17, sug: 40, s: [['یک قاشق غذاخوری', 'SPOON', 50, true]] },
  { n: 'باقلوا', e: 'Baklava', c: 'SWEET', t: 'DISH', ir: true, kcal: 428, p: 6, cb: 50, f: 23, sug: 28, s: [['یک عدد', 'PIECE', 40, true]] },
  { n: 'زولبیا و بامیه', e: 'Zoolbia & bamieh', c: 'SWEET', t: 'DISH', ir: true, kcal: 380, p: 3, cb: 60, f: 14, sug: 42, s: [['یک عدد', 'PIECE', 30, true]] },
  { n: 'شیرینی نخودچی', c: 'SWEET', t: 'DISH', ir: true, kcal: 478, p: 8, cb: 62, f: 22, sug: 38, s: [['یک عدد', 'PIECE', 15, true]] },
  { n: 'کیک اسفنجی ساده', e: 'Plain sponge cake', c: 'SWEET', t: 'DISH', ir: false, kcal: 352, p: 5.9, cb: 50, f: 14, sug: 30, s: [['یک برش', 'SLICE', 80, true]] },
  { n: 'کیک شکلاتی', e: 'Chocolate cake', c: 'SWEET', t: 'DISH', ir: false, kcal: 402, p: 5.5, cb: 55, f: 18, sug: 38, s: [['یک برش', 'SLICE', 90, true]] },
  { n: 'مربای توت‌فرنگی', e: 'Strawberry jam', c: 'SWEET', t: 'INGREDIENT', ir: false, kcal: 273, p: 0.4, cb: 69, f: 0.2, sug: 66, s: [['یک قاشق غذاخوری', 'SPOON', 20, true]] },

  // ── نوشیدنی‌ها ──
  { n: 'چای بدون قند', e: 'Tea without sugar', c: 'DRINK', t: 'INGREDIENT', ir: true, kcal: 2, p: 0, cb: 0.4, f: 0, s: [['یک استکان', 'GLASS', 100, true]] },
  { n: 'چای شیرین (با یک حبه قند)', c: 'DRINK', t: 'INGREDIENT', ir: true, kcal: 20, p: 0, cb: 5, f: 0, sug: 5, s: [['یک استکان', 'GLASS', 100, true]] },
  { n: 'قهوه تلخ', e: 'Black coffee', c: 'DRINK', t: 'INGREDIENT', ir: false, kcal: 2, p: 0.3, cb: 0, f: 0, s: [['یک فنجان', 'GLASS', 150, true]] },
  { n: 'لاته با شکر', e: 'Latte with sugar', c: 'DRINK', t: 'INGREDIENT', ir: false, kcal: 62, p: 2, cb: 8.5, f: 2, sug: 7, s: [['یک فنجان', 'GLASS', 240, true]] },
  { n: 'نسکافه سه‌در‌یک', e: '3-in-1 instant coffee', c: 'DRINK', t: 'BRAND', ir: false, kcal: 50, p: 0.5, cb: 9, f: 1.2, sug: 8, s: [['یک فنجان', 'GLASS', 200, true]] },
  { n: 'آب پرتقال طبیعی', e: 'Fresh orange juice', c: 'DRINK', t: 'INGREDIENT', ir: false, kcal: 45, p: 0.7, cb: 10.4, f: 0.2, sug: 8.4, s: [['یک لیوان', 'GLASS', 200, true]] },
  { n: 'نوشابه قنددار', e: 'Regular soda', c: 'DRINK', t: 'INGREDIENT', ir: false, kcal: 42, p: 0, cb: 10.6, f: 0, sug: 10.6, s: [['یک قوطی', 'GLASS', 330, true]] },
  { n: 'نوشابه رژیمی', e: 'Diet soda', c: 'DRINK', t: 'INGREDIENT', ir: false, kcal: 0.4, p: 0, cb: 0.1, f: 0, s: [['یک قوطی', 'GLASS', 330, true]] },
  { n: 'ماءالشعیر', e: 'Non-alcoholic malt', c: 'DRINK', t: 'INGREDIENT', ir: true, kcal: 45, p: 0, cb: 9, f: 0, sug: 8.5, a: 'ماء الشعیر', s: [['یک قوطی', 'GLASS', 330, true]] },
  { n: 'آب', e: 'Water', c: 'DRINK', t: 'INGREDIENT', ir: false, kcal: 0, p: 0, cb: 0, f: 0, s: [['یک لیوان', 'GLASS', 250, true]] },

  // ── چربی‌ها و سس‌ها ──
  { n: 'روغن زیتون', e: 'Olive oil', c: 'OTHER', t: 'INGREDIENT', ir: false, kcal: 884, p: 0, cb: 0, f: 100, s: [['یک قاشق غذاخوری', 'SPOON', 14, true]] },
  { n: 'روغن سرخ‌کردنی', e: 'Cooking oil', c: 'OTHER', t: 'INGREDIENT', ir: false, kcal: 884, p: 0, cb: 0, f: 100, s: [['یک قاشق غذاخوری', 'SPOON', 14, true]] },
  { n: 'مایونز', e: 'Mayonnaise', c: 'OTHER', t: 'INGREDIENT', ir: false, kcal: 680, p: 1, cb: 2.4, f: 75, s: [['یک قاشق غذاخوری', 'SPOON', 15, true]] },
  { n: 'سس گوجه (کچاپ)', e: 'Ketchup', c: 'OTHER', t: 'INGREDIENT', ir: false, kcal: 101, p: 1.2, cb: 25.8, f: 0.1, sug: 21.8, na: 900, s: [['یک قاشق غذاخوری', 'SPOON', 17, true]] },
  { n: 'عسل', e: 'Honey', c: 'OTHER', t: 'INGREDIENT', ir: false, kcal: 304, p: 0.3, cb: 82.4, f: 0, sug: 82, s: [['یک قاشق غذاخوری', 'SPOON', 21, true]] },
  { n: 'قند', c: 'OTHER', t: 'INGREDIENT', ir: true, kcal: 385, p: 0, cb: 99.8, f: 0, sug: 99.8, s: [['یک عدد', 'PIECE', 5, true]] },
  { n: 'شکر سفید', e: 'Sugar', c: 'OTHER', t: 'INGREDIENT', ir: false, kcal: 387, p: 0, cb: 100, f: 0, sug: 100, s: [['یک قاشق چای‌خوری', 'SPOON', 4, true]] },
  { n: 'رب گوجه‌فرنگی', e: 'Tomato paste', c: 'OTHER', t: 'INGREDIENT', ir: true, kcal: 82, p: 4.3, cb: 16, f: 0.5, na: 200, s: [['یک قاشق غذاخوری', 'SPOON', 20, true]] },
  { n: 'آرد گندم', e: 'Wheat flour', c: 'OTHER', t: 'INGREDIENT', ir: false, kcal: 364, p: 10.3, cb: 76.3, f: 1, fib: 2.7, s: [['یک قاشق غذاخوری', 'SPOON', 8, true]] },
  { n: 'برنج خام', e: 'Uncooked rice', c: 'OTHER', t: 'INGREDIENT', ir: true, kcal: 360, p: 7.5, cb: 79, f: 0.6, fib: 1.4, s: [['یک پیمانه', 'CUP', 180, true]] },
]

async function main() {
  const existing = await prisma.food.count({ where: { source: 'SEED' } })
  if (existing > 0) {
    console.log(`[seed-foods] ${existing} SEED foods already present — deleting and re-seeding.`)
    await prisma.food.deleteMany({ where: { source: 'SEED' } })
  }

  let count = 0
  for (const item of FOODS) {
    const searchText = normalizeFaSearch([item.n, item.e ?? '', item.a ?? ''].join(' '))
    await prisma.food.create({
      data: {
        nameFa: item.n,
        nameEn: item.e,
        category: item.c,
        foodType: item.t,
        isIranian: item.ir,
        source: 'SEED',
        confidence: 1,
        searchText,
        kcalPer100g: item.kcal,
        proteinPer100g: item.p,
        carbsPer100g: item.cb,
        fatPer100g: item.f,
        fiberPer100g: item.fib,
        sugarPer100g: item.sug,
        sodiumMgPer100g: item.na,
        servings: {
          create: item.s.map(([labelFa, unitType, grams, isDefault]) => ({
            labelFa,
            unitType,
            grams,
            isDefault: isDefault ?? false,
          })),
        },
      },
    })
    count++
  }
  console.log(`[seed-foods] Seeded ${count} foods with servings. ✅`)
}

main()
  .catch((e) => {
    console.error('[seed-foods] FAILED:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
