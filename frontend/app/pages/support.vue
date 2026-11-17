<script setup lang="ts">
useSeoMeta({ title: `開発者支援｜${SITE.name}`, description: '世界遺産ラボの継続開発をAmazonギフト券で応援する方法をご案内します。' })
const recipient = SITE.contact_email
const copyMessage = ref('')
const copyRecipient = async () => {
  try { await navigator.clipboard.writeText(recipient); copyMessage.value = 'メールアドレスをコピーしました。' }
  catch { copyMessage.value = 'コピーできませんでした。下のメールアドレスを選択してコピーしてください。' }
}
const amazonUrl = 'https://www.amazon.co.jp/s?k=Amazon%E3%82%AE%E3%83%95%E3%83%88%E3%82%AB%E3%83%BC%E3%83%89+E%E3%83%A1%E3%83%BC%E3%83%AB%E3%82%BF%E3%82%A4%E3%83%97'
</script>

<template>
  <div class="page-wrap support-page">
    <header class="page-intro support-intro">
      <h1>開発者支援</h1>
      <p>いつも世界遺産ラボをご利用いただき、ありがとうございます。日々の学習のお役に立てていたら、開発者を応援していただけるとうれしいです。</p>
      <p>世界遺産ラボでは、問題の作成・改善に最新のAIモデルを活用しており、モデルの利用料に加えて、サーバーやデータベースなどのインフラ維持費がかかっています。</p>
      <p>いただいたご支援は、問題・解説の品質向上と、AIモデルの利用料やインフラ維持費に充てます。</p>
    </header>
    <section class="content-panel gift-panel" aria-labelledby="support-heading">
      <div class="gift-icon" aria-hidden="true"><UIcon name="i-lucide-gift" /></div>
      <div><h2 id="support-heading">Amazonギフト券で応援する</h2><p>金額はご自由に。無理のない範囲でお送りください。<br>いただいた応援は、サービスを育てていく励みになります。</p></div>
      <div class="recipient-panel">
        <span class="recipient-label">ギフト券の送信先</span>
        <strong class="recipient-email">{{ recipient }}</strong>
        <button type="button" class="secondary-link" @click="copyRecipient"><UIcon name="i-lucide-copy" />メールアドレスをコピー</button>
        <p class="copy-message" role="status" aria-live="polite">{{ copyMessage }}</p>
      </div>
      <a class="primary-link amazon-link" :href="amazonUrl" target="_blank" rel="noopener noreferrer">Amazonでギフトカードを選ぶ<UIcon name="i-lucide-external-link" /><span class="sr-only">（新しいタブで開きます）</span></a>
    </section>
    <section class="content-panel steps-panel" aria-labelledby="steps-heading">
      <h2 id="steps-heading">支援の手順</h2>
      <ol>
        <li><strong>Eメールで送れるタイプを選ぶ</strong><p>Amazon.co.jpで、Eメールで送信できるAmazonギフトカードを選びます。</p></li>
        <li><strong>金額と送信先を入力する</strong><p>希望する金額を指定し、受取人のメールアドレスに上記の送信先を入力します。金額や入力項目はAmazonの購入画面でご確認ください。</p></li>
        <li><strong>送信先を確認して贈る</strong><p>購入内容とメールアドレスを確認し、Amazon上で手続を完了してください。メッセージは任意です。</p></li>
      </ol>
    </section>
    <aside class="support-note" aria-label="支援について">
      <h2>お気持ちだけでも、ありがとうございます。</h2>
      <p>支援は任意です。支援の有無や金額によって、問題の利用範囲や会員資格が変わることはありません。プレミアム会員の登録・更新とは別の応援方法です。</p>
      <p>有料問題の利用をご希望の方は、<GradeLink to="/premium">プレミアム会員のご案内</GradeLink>をご覧ください。</p>
    </aside>
  </div>
</template>

<style scoped>
.support-page { max-width: 960px; }
.support-intro { padding: 18px 0 8px; }
.support-intro h1 { margin-top: 16px; line-height: 1.4; }
.support-intro p { line-height: 1.9; }
.gift-panel { display: grid; grid-template-columns: 64px 1fr; gap: 20px; border-top: 4px solid var(--teal-dark); }
.gift-icon { width: 60px; height: 60px; border-radius: 16px; background: var(--theme-soft); color: var(--teal-dark); display: grid; place-items: center; font-size: 30px; }
.gift-panel h2, .steps-panel h2 { font-size: 1.4rem; margin-bottom: 12px; }
.gift-panel p { line-height: 1.9; }
.recipient-panel { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 22px; border: 1px solid var(--line); border-radius: 10px; background: var(--theme-soft); min-width: 0; }
.recipient-label { width: 100%; font-size: .85rem; color: var(--muted); }
.recipient-email { flex: 1 1 280px; overflow-wrap: anywhere; font-size: 1.1rem; user-select: all; }
.recipient-panel button { gap: 8px; }
.copy-message { width: 100%; margin: 0; font-size: .85rem; color: var(--teal-dark); }
.copy-message:empty { display: none; }
.amazon-link { grid-column: 1 / -1; justify-self: start; gap: 10px; }
.steps-panel { margin-top: 24px; }
.steps-panel ol { list-style: decimal; padding-left: 1.5em; margin: 20px 0 0; }
.steps-panel li { padding-left: 8px; line-height: 1.9; }
.steps-panel li + li { margin-top: 22px; }
.steps-panel li::marker { color: var(--teal-dark); font-weight: 800; }
.steps-panel li p { color: var(--muted); margin: 6px 0 0; }
.support-note { padding: 24px 8px 0; color: var(--muted); line-height: 1.9; }
.support-note h2 { color: var(--ink); font-size: 1.15rem; }
.support-note a { color: var(--teal-dark); text-underline-offset: 3px; }
@media(max-width: 600px) {
  .gift-panel { grid-template-columns: 1fr; gap: 16px; }
  .recipient-panel { padding: 16px; }
  .recipient-email { flex-basis: 100%; font-size: 1rem; }
  .amazon-link { width: 100%; text-align: center; }
}
</style>
