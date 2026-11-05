import { defineApiHandler } from '../../../core/api-handler.ts'
import { subscriptionPortal } from '../../../services/subscriptions.ts'
export default defineApiHandler((_event,user) => subscriptionPortal(user!), { authentication: 'required' })
