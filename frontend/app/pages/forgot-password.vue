<script setup lang="ts">
import { requestPasswordResetSchema } from '../../shared/schemas/auth.ts'
import { focusFormError } from '~/utils/apiFormErrors'
const { requestPasswordReset } = useAuth()
const state = reactive({ email: '' })
const submitting = ref(false)
const accepted = ref(false)
const errorMessage = ref('')
useHead({ meta: [{ name: 'referrer', content: 'no-referrer' }] })
const submit = async () => {
  if (submitting.value) return
  submitting.value = true; errorMessage.value = ''
  try { await requestPasswordReset(state); accepted.value = true }
  catch (error: any) { errorMessage.value = error?.data?.error?.message ?? 'メールを依頼できませんでした。しばらく待ってからお試しください。' }
  finally { submitting.value = false }
}
</script>
<template>
  <div class="page-wrap auth-page">
    <header class="page-intro"><h1>パスワードを忘れた場合</h1><p>登録したメールアドレスに、パスワード再設定用のリンクを送ります。</p></header>
    <section v-if="accepted" class="content-panel">
      <p role="status">登録されているメールアドレスの場合、再設定用のメールを送信します。メールが届くまで少しお待ちください。</p>
      <p>迷惑メールフォルダーもご確認ください。リンクの有効期限は30分です。</p>
      <button class="secondary-link" type="button" @click="accepted = false">もう一度依頼する</button>
      <p class="auth-note"><NuxtLink to="/login">ログインへ戻る</NuxtLink></p>
    </section>
    <UForm v-else :disabled="submitting" :schema="requestPasswordResetSchema" :state="state" class="content-panel auth-form" novalidate @error="focusFormError" @submit="submit">
      <FormTextField id="reset-email" v-model="state.email" name="email" label="メールアドレス" type="email" autocomplete="email" />
      <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
      <button class="primary-link" type="submit" :disabled="submitting">{{ submitting ? '受け付けています' : '再設定メールを依頼' }}</button>
      <p class="auth-note"><NuxtLink to="/login">ログインへ戻る</NuxtLink></p>
    </UForm>
  </div>
</template>
