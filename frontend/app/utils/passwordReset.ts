import { passwordResetTokenSchema } from '../../shared/schemas/auth.ts'
export function passwordResetToken(fragment: string): string {
  const params = new URLSearchParams(fragment.replace(/^#/, ''))
  if ([...params.keys()].length !== 1 || params.getAll('token').length !== 1) return ''
  const result = passwordResetTokenSchema.safeParse(params.get('token'))
  return result.success ? result.data : ''
}
