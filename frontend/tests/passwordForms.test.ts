import assert from 'node:assert/strict'
import test from 'node:test'
import { changePasswordFormSchema, newPasswordFormSchema, requestPasswordResetSchema } from '../shared/schemas/auth.ts'
import { passwordResetToken } from '../app/utils/passwordReset.ts'
test('password forms share confirmation and native character limits without a bcrypt byte limit', () => {
 const form = {current_password:'old synthetic',password:'新'.repeat(50),password_confirmation:'新'.repeat(50)}
 assert.ok(changePasswordFormSchema.safeParse(form).success)
 assert.ok(!changePasswordFormSchema.safeParse({...form,password_confirmation:'different'}).success)
 assert.ok(!changePasswordFormSchema.safeParse({...form,password:form.current_password,password_confirmation:form.current_password}).success)
 assert.ok(!newPasswordFormSchema.safeParse({password:'x'.repeat(129),password_confirmation:'x'.repeat(129)}).success)
 assert.equal(requestPasswordResetSchema.parse({email:'  PERSON@example.invalid '}).email,'person@example.invalid')
})
test('reset link accepts native tokens only from a single fragment parameter', () => {
 const token='A'.repeat(24)
 assert.ok(passwordResetToken('#token='+token)===token)
 for(const fragment of ['', '#token=short','#token='+token+'&token='+token,'#token='+token+'&other=x','#token=https%3A%2F%2Fevil.invalid','#token='+ 'A'.repeat(129)])assert.equal(passwordResetToken(fragment),'')
})
