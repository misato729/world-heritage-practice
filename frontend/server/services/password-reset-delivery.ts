import { consumeRateLimit } from '../core/rate-limit.ts'
import { passwordResetMailSettings, sendPasswordResetMail } from './password-reset-mail.ts'

/** Native token creation/consumption stays in Better Auth. Delivery is best effort. */
export async function deliverPasswordReset({ user, token }: { user: { email: string }, token: string }): Promise<void> {
  const delivery = async () => {
    const settings = passwordResetMailSettings()
    if (!(await consumeRateLimit('password_reset_delivery', 'gas-mail')).allowed) throw new Error('Delivery unavailable')
    await sendPasswordResetMail(settings, user.email, token)
  }
  // Return the real promise: Better Auth/Nitro owns its request lifetime.
  await delivery().catch(() => console.error(JSON.stringify({ category: 'password_reset_delivery_failed' })))
}
