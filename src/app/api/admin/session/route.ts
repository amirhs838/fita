import { handleError, ok } from '@/lib/api'
import { isAdminAuthenticated } from '@/lib/admin-auth'

/** GET /api/admin/session — lets clients check the admin sign-in state. */
export async function GET() {
  try {
    return ok({ authed: await isAdminAuthenticated() })
  } catch (err) {
    return handleError(err)
  }
}
