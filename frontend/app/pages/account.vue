<script setup lang="ts">
const portalError = ref('')
const openPortal = async () => {
 try { const {data} = await useNuxtApp().$api<{data:{url:string}}>('/api/v1/payments/portal',{method:'POST',body:{}}); window.location.assign(data.url) }
 catch { portalError.value = '契約管理を開けませんでした。時間をおいて再度お試しください。' }
}

const { config: EXAM_CONFIG } = useGrade()
import { deleteAccountFormSchema, changePasswordFormSchema } from '../../shared/schemas/auth.ts'
import { apiFormErrors, focusFormError } from '~/utils/apiFormErrors'
definePageMeta({ middleware: 'auth' })
const route = useRoute()
const settingsSection = useTemplateRef<HTMLElement>('settingsSection')
const alignAccountSettings = async () => { if(route.hash !== '#account-settings') return; await nextTick(); if(route.hash === '#account-settings') settingsSection.value?.scrollIntoView({block:'start'}) }

const { isLoggedIn, user, logout, deleteAccount: removeAccount, changePassword, ensureCurrentUser } = useAuth()
await ensureCurrentUser()
const passwordState = reactive({ current_password: '', password: '', password_confirmation: '' })
const passwordForm = useTemplateRef('passwordForm')
const changingPassword = ref(false)
const passwordMessage = ref('')
const passwordError = ref('')
watch(passwordState, () => { passwordMessage.value = ''; passwordError.value = '' })
const submitPassword = async () => {
  if (changingPassword.value) return
  changingPassword.value = true
  passwordMessage.value = ''; passwordError.value = ''
  try {
    await changePassword(passwordState)
    Object.assign(passwordState, { current_password: '', password: '', password_confirmation: '' })
    await nextTick()
    passwordMessage.value = 'パスワードを変更しました。ほかのログイン状態は解除されました。'
  } catch (error: any) {
    passwordForm.value?.setErrors(apiFormErrors(error, { current_password: '現在のパスワード', password: '新しいパスワード' }))
    passwordError.value = error?.data?.error?.message ?? 'パスワードを変更できませんでした。'
  } finally { changingPassword.value = false }
}

const deleteFormOpen = ref(false)
const deleteState = reactive({ current_password: '', confirmed: false })
const accountForm = useTemplateRef('accountForm')
const deleting = ref(false)
const deleteError = ref('')
watch(deleteState, () => { deleteError.value = '' })
const handleLogout = async () => {
  await logout()
  await navigateTo('/')
}

const membershipLabel = computed(() => {
  if (!PAYMENTS_ENABLED) return user.value?.role === 'admin' ? '管理者' : '一般会員'
  if (user.value?.role === 'admin') return '管理者（全問題利用可）'
  if (user.value?.membership.status === 'active') return 'プレミアム会員'
  if (user.value?.verification_access) return '検証用（有料機能利用可）'
  if (user.value?.membership.status === 'revoked') return '無料会員（有料資格は失効）'
  return '無料会員'
})

const deleteAccount = async () => {
  if (deleting.value) return

  deleting.value = true
  deleteError.value = ''
  try {
    await removeAccount(deleteState.current_password)
    await navigateTo('/')
  }
  catch (error: any) {
    accountForm.value?.setErrors(apiFormErrors(error, { current_password: '現在のパスワード' }))
    deleteError.value = error?.data?.error?.message ?? 'アカウントを削除できませんでした。'
  }
  finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="page-wrap">
    <header class="page-intro"><h1>マイページ</h1><p>登録情報や学習状況の確認、アカウント設定を行います。</p></header>
    <div v-if="!isLoggedIn" class="empty-state">
      <h2>ログインが必要です</h2>
      <p>マイページはログイン後に利用できます。</p>
      <GradeLink class="primary-link" to="/login">ログインへ</GradeLink>
    </div>
    <template v-else>
      <section class="content-panel account-info" aria-labelledby="registration-heading">
        <h2 id="registration-heading">登録情報</h2>
        <div><span>ユーザー名</span><strong>{{ user?.name }}</strong></div>
        <div><span>メールアドレス</span><strong>{{ user?.email }}</strong></div>
        <div><span>会員区分</span><strong>{{ membershipLabel }}</strong></div>
        <div v-if="PAYMENTS_ENABLED && user?.membership.purchased_at"><span>購入確認日時</span><strong>{{ new Date(user.membership.purchased_at).toLocaleString('ja-JP') }}</strong></div>
        <button v-if="user?.subscription" type="button" @click="openPortal">契約・支払方法・解約の管理</button><p v-if="portalError" role="alert">{{ portalError }}</p>
        <div v-if="PAYMENTS_ENABLED && user?.membership.status === 'active'"><span>有効期限</span><strong>{{ user?.membership.expires_at ? new Date(user.membership.expires_at).toLocaleDateString('ja-JP') : '既存の会員資格' }}</strong></div>
        <div v-if="PAYMENTS_ENABLED && user?.verification_access && user?.membership.status !== 'active'"><span>検証用資格の期限</span><strong>{{ new Date(user.verification_access.expires_at).toLocaleString('ja-JP') }}</strong></div>
      </section>
      <AchievementReport @settled.once="alignAccountSettings" />
      <section id="account-settings" ref="settingsSection" class="account-settings" aria-labelledby="account-settings-heading">
        <h2 id="account-settings-heading">アカウント設定</h2>
      <section v-if="PAYMENTS_ENABLED && !user?.paid_content_access" class="content-panel membership-action">
        <h3>プレミアム会員</h3>
        <p>{{ PRICE_LABEL }}（税込）／月で、模擬試験{{ EXAM_CONFIG.payments.free_exam_count + 1 }}以降を利用できます。</p>
        <GradeLink class="primary-link" to="/premium">プレミアム会員の詳細を見る</GradeLink>
      </section>
      <section class="content-panel password-settings">
        <h3>パスワード変更</h3>
        <p>現在のパスワードと、8〜128文字の新しいパスワードを入力してください。</p>
        <UForm ref="passwordForm" :schema="changePasswordFormSchema" :state="passwordState" class="auth-form" novalidate @error="focusFormError" @submit="submitPassword">
          <FormTextField id="change-current-password" v-model="passwordState.current_password" name="current_password" label="現在のパスワード" type="password" autocomplete="current-password" />
          <FormTextField id="change-new-password" v-model="passwordState.password" name="password" label="新しいパスワード" type="password" autocomplete="new-password" />
          <FormTextField id="change-password-confirmation" v-model="passwordState.password_confirmation" name="password_confirmation" label="新しいパスワード（確認）" type="password" autocomplete="new-password" />
          <p v-if="passwordError" class="form-error" role="alert">{{ passwordError }}</p>
          <p v-if="passwordMessage" role="status">{{ passwordMessage }}</p>
          <button class="primary-link" type="submit" :disabled="changingPassword">{{ changingPassword ? '変更しています' : 'パスワードを変更' }}</button>
        </UForm>
      </section>
      <section class="content-panel account-actions">
        <h3>ログイン状態</h3>
        <button class="secondary-link" type="button" @click="handleLogout">
          <UIcon name="i-lucide-log-out" />
          ログアウト
        </button>
      </section>
      <section class="content-panel danger-zone">
        <h3>アカウント削除</h3>
        <p>アカウントを削除すると、解答履歴とお気に入りを復元できなくなります。<template v-if="PAYMENTS_ENABLED">プレミアム会員資格も削除され、再登録による復元や自動返金は行われません。</template></p>
        <button v-if="!deleteFormOpen" type="button" @click="deleteFormOpen = true">アカウントを削除</button>
        <UForm v-else ref="accountForm" :schema="deleteAccountFormSchema" :state="deleteState" class="delete-form" novalidate @error="focusFormError" @submit="deleteAccount">
          <FormTextField id="current-password" v-model="deleteState.current_password" name="current_password" label="現在のパスワード" type="password" autocomplete="current-password" />
          <UFormField name="confirmed" :ui="{ error: 'form-field-error' }">
            <UCheckbox v-model="deleteState.confirmed" class="delete-confirmation" :label="`削除後にデータ${PAYMENTS_ENABLED ? 'とプレミアム会員資格' : ''}を復元できないことを確認しました。`" />
          </UFormField>
          <p v-if="deleteError" class="form-error" role="alert">{{ deleteError }}</p>
          <div class="delete-actions">
            <button type="button" @click="deleteFormOpen = false">キャンセル</button>
            <button class="danger-button" type="submit" :disabled="!deleteState.confirmed || !deleteState.current_password || deleting">{{ deleting ? '削除しています' : '完全に削除する' }}</button>
          </div>
        </UForm>
      </section>
      </section>
    </template>
  </div>
</template>

<style scoped>
.account-info h2 { margin:0; font-size:1.25rem; }
.account-info strong { overflow-wrap:anywhere; }
.account-settings { margin-top:28px; scroll-margin-top:calc(var(--site-navigation-height, var(--header-height)) + 20px); }
.account-settings > h2 { margin:0 0 18px; font-size:1.5rem; }
.account-info { display: grid; gap: 18px; }
.account-info div { display: grid; grid-template-columns: 160px 1fr; gap: 20px; }
.account-info span { color: var(--muted); }
.password-settings h2, .account-actions h3, .danger-zone h3 { font-size: 20px; }
.membership-action p { margin-bottom: 18px; }
.danger-zone { border-color: #e8b9af; }
.danger-zone button { min-height: 42px; padding: 0 14px; border: 1px solid #d65e49; border-radius: 6px; background: #fff; color: #b33b29; font-weight: 700; cursor: pointer; }
.delete-form { margin-top: 22px; padding-top: 22px; border-top: 1px solid #efd8d3; }
.delete-confirmation { display: grid; grid-template-columns: 20px 1fr; gap: 9px; margin-top: 18px; color: #6a4740; line-height: 1.7; }
.delete-confirmation input { width: 18px; height: 18px; margin-top: 4px; accent-color: #b33b29; }
.delete-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
.delete-actions button:first-child { border-color: #b9c8cc; color: var(--ink); }
.delete-actions button:disabled { opacity: .45; cursor: not-allowed; }
@media (max-width: 520px) { .account-info div { grid-template-columns: 1fr; gap: 5px; } }
</style>
