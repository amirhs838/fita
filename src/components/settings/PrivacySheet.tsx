'use client'

import { useState } from 'react'
import { Download, Loader2, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { getToken, clearToken } from '@/lib/client'

/**
 * Phase 12 — privacy & data sheet.
 * Export: GET /api/account/export (raw JSON file, not the standard envelope).
 * Delete: POST /api/account/delete with explicit confirm — hard erasure.
 */
export function PrivacySheet({
  open,
  onOpenChange,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function handleExport() {
    setExporting(true)
    try {
      const token = getToken()
      const res = await fetch('/api/account/export', {
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) throw new Error('export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = /filename="?([^"]+)"?/.exec(disposition)
      a.href = url
      a.download = match?.[1] ?? 'fita-export.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('خروجی داده‌ها آماده شد.')
    } catch {
      toast.error('دریافت خروجی ناموفق بود. دوباره تلاش کن.')
    } finally {
      setExporting(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const token = getToken()
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ confirm: true }),
      })
      // Envelope or not — a 2xx means the account is gone; clear local state.
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null
        throw new Error(json?.error?.message ?? 'حذف حساب ناموفق بود.')
      }
      clearToken()
      toast.success('حساب و همه داده‌هایش حذف شد.')
      onDeleted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حذف حساب ناموفق بود.')
      setDeleting(false)
      setConfirmOpen(false)
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-[28px] px-6 pb-8 pt-3">
          <SheetHeader className="text-start">
            <SheetTitle className="flex items-center gap-2 text-base font-bold">
              <ShieldCheck className="size-4.5" strokeWidth={1.8} aria-hidden />
              حریم خصوصی و داده‌ها
            </SheetTitle>
            <SheetDescription className="text-sm">
              مالک داده‌هایت خودتی — هر زمان بخواهی می‌توانی ببری یا پاکشان کنی.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-3">
            {/* Export */}
            <section className="rounded-2xl border border-border/70 p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Download className="size-4.5" strokeWidth={1.8} aria-hidden />
                </span>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold">دریافت خروجی داده‌ها</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    یک فایل JSON شامل پروفایل، اهداف، وزن‌ها، دفتر غذای روزانه،
                    برنامه‌های غذایی، گفتگوهای مربی و دستاوردهایت.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => void handleExport()}
                disabled={exporting}
                className="mt-3 h-10 w-full rounded-xl"
              >
                {exporting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Download className="size-4" aria-hidden />
                )}
                دانلود فایل خروجی
              </Button>
            </section>

            <Separator />

            {/* Delete */}
            <section className="rounded-2xl border border-destructive/25 p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
                  <Trash2 className="size-4.5 text-destructive" strokeWidth={1.8} aria-hidden />
                </span>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-destructive">حذف حساب کاربری</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    همه داده‌هایت برای همیشه پاک می‌شود: غذاها، وزن‌ها، برنامه‌ها،
                    گفتگوها و دستاوردها. این کار بازگشت‌پذیر نیست.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => setConfirmOpen(true)}
                disabled={deleting}
                className="mt-3 h-10 w-full rounded-xl border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
              >
                <Trash2 className="size-4" aria-hidden />
                حذف همیشگی حساب
              </Button>
            </section>
          </div>

          <p className="mt-4 text-center text-[11px] leading-5 text-muted-foreground">
            عکس‌های غذا هرگز ذخیره نمی‌شوند و در این فایل هم وجود ندارند.
          </p>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader className="text-start">
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <TriangleAlert className="size-5 text-destructive" aria-hidden />
              از حذف حساب مطمئنی؟
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-6">
              این عمل برای همیشه است. تمام غذاها، وزن‌ها، برنامه‌های غذایی،
              گفتگوهای مربی و پیشرفتت پاک می‌شود و قابل بازیابی نخواهد بود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2">
            <AlertDialogCancel className="mt-0 flex-1 rounded-xl">
              انصراف
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="flex-1 rounded-xl bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              بله، حذف کن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
