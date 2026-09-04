import { isAdminAuthenticated } from '@/lib/admin-auth'
import AdminLogin from '@/components/admin/AdminLogin'
import FoodBankPanel from '@/components/admin/FoodBankPanel'

/** /admin — owner-only panel behind the fita_admin password session. */
export default async function AdminPage() {
  const authed = await isAdminAuthenticated()
  return authed ? <FoodBankPanel /> : <AdminLogin />
}
