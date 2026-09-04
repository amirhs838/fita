import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'مدیریت فیتا',
  description: 'پنل مدیریت فیتا — بانک غذا و گزینه‌های برنامه‌ساز',
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children
}
