import { defineApiHandler } from '../../../core/api-handler.ts'
import { throttle } from '../../../core/rate-limit.ts'
import { subscriptionPortal } from '../../../services/subscriptions.ts'
export default defineApiHandler(async (event,user) => {
  await throttle(event, 'portal_ip')
  await throttle(event, 'portal_user', String(user!.id))
  return subscriptionPortal(user!)
}, { authentication: 'required' })
