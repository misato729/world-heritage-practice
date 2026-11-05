<script setup lang="ts">
import { newPasswordFormSchema } from '../../shared/schemas/auth.ts'
import { passwordResetToken } from '~/utils/passwordReset'
import { focusFormError } from '~/utils/apiFormErrors'
const route = useRoute()
const router = useRouter()
const { resetPassword } = useAuth()
const state = reactive({ password: '', password_confirmation: '' })
const token = ref('')
const ready = ref(false)
const submitting = ref(false)
const completed = ref(false)
const errorMessage = ref('')
useHead({ meta: [{ name: 'referrer', content: 'no-referrer' }] })
const loadLink = async (fragment: string) => {
  token.value = passwordResetToken(fragment)
  Object.assign(state, { password: '', password_confirmation: '' })
  completed.value = false; errorMessage.value = ''
  if (fragment || Object.keys(route.query).length) await router.replace({ path: route.path, hash: '', query: {} })
  ready.value = true
}
onMounted(() => loadLink(route.hash))
watch(() => route.hash, fragment => { if (fragment) void loadLink(fragment) })
const submit = async () => {
  if (submitting.value || !token.value) return
  const requestToken = token.value
  submitting.value = true; errorMessage.value = ''
  try {
    await resetPassword({ ...state, token: requestToken })
    if (token.value !== requestToken) return
    token.value = ''; Object.assign(state, { password: '', password_confirmation: '' }); completed.value = true
  } catch (error: any) {
    if (token.value === requestToken) errorMessage.value = error?.data?.error?.message ?? 'パスワードを再設定できませんでした。'
  } finally { submitting.value = false }
}
</script>
<template>
  <div class="page-wrap auth-page">
    <header class="page-intro"><h1>パスワードの再設定</h1><p>新しいパスワードを8〜128文字で入力してください。</p></header>
    <section v-if="completed" class="content-panel">
      <p role="status">パスワードを再設定しました。新しいパスワードでログインしてください。</p>
      <GradeLink class="primary-link" to="/login">ログインへ</GradeLink>
    </section>
    <section v-else-if="ready && !token" class="content-panel">
      <p role="alert">再設定リンクが無効です。メールのリンクからもう一度開くか、再設定メールを依頼してください。</p>
      <GradeLink class="primary-link" to="/forgot-password">再設定メールを依頼</GradeLink>
    </section>
    <UForm v-else-if="ready" :schema="newPasswordFormSchema" :state="state" class="content-panel auth-form" novalidate @error="focusFormError" @submit="submit">
      <FormTextField id="reset-new-password" v-model="state.password" name="password" label="新しいパスワード" type="password" autocomplete="new-password" />
      <FormTextField id="reset-confirmation" v-model="state.password_confirmation" name="password_confirmation" label="新しいパスワード（確認）" type="password" autocomplete="new-password" />
      <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
      <button class="primary-link" type="submit" :disabled="submitting">{{ submitting ? '設定しています' : 'パスワードを再設定' }}</button>
      <p class="auth-note"><GradeLink to="/forgot-password">再設定メールをもう一度依頼</GradeLink></p>
    </UForm>
  </div>
</template>
