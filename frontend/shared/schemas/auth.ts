import { z } from 'zod'

export const AUTH_PASSWORD_MIN_LENGTH = 8
export const AUTH_PASSWORD_MAX_LENGTH = 128

const email = z.string({ error: 'メールアドレスを入力してください。' }).trim()
  .min(1, 'メールアドレスを入力してください。').max(255, 'メールアドレスは255文字以内で入力してください。')
  .email('メールアドレスの形式を確認してください。')
const password = z.string({ error: 'パスワードを入力してください。' })
  .min(AUTH_PASSWORD_MIN_LENGTH, 'パスワードは8文字以上で入力してください。')
  .max(AUTH_PASSWORD_MAX_LENGTH, 'パスワードは128文字以内で入力してください。')

/** Passwords are never trimmed or normalized. Better Auth validates again on the server. */
export const loginFormSchema = z.object({ email, password })
export const signupFormSchema = loginFormSchema.extend({
  name: z.string({ error: 'ユーザー名を入力してください。' }).trim().min(1, 'ユーザー名を入力してください。')
    .refine(value => Array.from(value).length <= 100, 'ユーザー名は100文字以内で入力してください。'),
  password_confirmation: z.string({ error: '確認用パスワードを入力してください。' }),
}).refine(value => value.password === value.password_confirmation, {
  path: ['password_confirmation'], message: '確認用パスワードが一致していません。',
})
export const deleteAccountFormSchema = z.object({
  current_password: z.string({ error: '現在のパスワードを入力してください。' }).min(1, '現在のパスワードを入力してください。')
    .max(AUTH_PASSWORD_MAX_LENGTH, '現在のパスワードを確認してください。'),
  confirmed: z.boolean().refine(value => value, '削除後にデータを復元できないことを確認してください。'),
})

export const passwordResetTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{24,128}$/, 'リンクが無効です。もう一度メールを依頼してください。')
export const requestPasswordResetSchema = z.object({ email: email.toLowerCase() })
export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, '現在のパスワードを入力してください。').max(AUTH_PASSWORD_MAX_LENGTH),
  newPassword: password,
}).refine(value => value.currentPassword !== value.newPassword, { path: ['newPassword'], message: '現在とは異なるパスワードを入力してください。' })
export const resetPasswordRequestSchema = z.object({ token: passwordResetTokenSchema, newPassword: password })
export const newPasswordFormSchema = z.object({
  password, password_confirmation: z.string({ error: '確認用パスワードを入力してください。' }),
}).refine(value => value.password === value.password_confirmation, {
  path: ['password_confirmation'], message: '確認用パスワードが一致していません。',
})
export const changePasswordFormSchema = newPasswordFormSchema.safeExtend({
  current_password: z.string().min(1, '現在のパスワードを入力してください。').max(AUTH_PASSWORD_MAX_LENGTH),
}).refine(value => value.current_password !== value.password, { path: ['password'], message: '現在とは異なるパスワードを入力してください。' })
