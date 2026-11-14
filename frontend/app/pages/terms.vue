<script setup lang="ts">
const { config: EXAM_CONFIG } = useGrade()
useSeoMeta({ title: `利用規約｜${SITE.name}`, robots: 'noindex' })
</script>

<template>
  <div class="page-wrap legal-page">
    <header class="page-intro"><h1>利用規約</h1><p>{{ SITE.name }}の利用について</p></header>
    <article class="legal-document">
      <p>本規約は、特定商取引法に基づく表記に記載する運営者が提供する{{ SITE.name }}の利用条件を定めるものです。</p>
      <section><h2>サービスの内容</h2><p>{{ SITE.name }}は、{{ SITE.exam_name }}の学習を支援する問題演習サービスです。問題と解説は学習の補助として利用するものであり、試験の合格を保証するものではありません。</p></section>
      <section><h2>アカウント</h2><p>登録情報は正確に入力し、パスワードを適切に管理してください。ログイン後は解答履歴を保存できます。</p></section>
      <section><h2>利用範囲と月額契約</h2><p v-if="PAYMENTS_ENABLED">各級の模試1〜{{ EXAM_CONFIG.payments.free_exam_count }}は無料です。有料会員は{{ PRICE_LABEL }}（税込）／月の全級共通契約により、各級模試4以降の公開問題とお気に入り機能を利用できます。現在は準1級・2級の模試1〜10を収録し、1級は準備中です。未公開教材の公開時期や追加を保証するものではありません。</p><p v-else>公開中の問題は無料で演習できます。お気に入りと解答履歴の保存にはログインが必要です。</p><p v-if="PAYMENTS_ENABLED">初回申込時と毎月の更新日に決済され、自動更新されます。契約管理から期間末解約すると次回の更新を停止し、支払済み期間の終了まで利用できます。アカウントを削除した場合は今後の請求を停止し、学習データと利用資格を削除します。販売条件と返金の取扱いは、<GradeLink to="/commercial-disclosure">特定商取引法に基づく表記</GradeLink>をご確認ください。</p></section>
      <section><h2>禁止事項と利用制限</h2><p>不正アクセス、他者の権利を侵害する行為、サービスの運営を妨げる行為は行わないでください。安定した提供のため、操作回数を一時的に制限する場合があります。</p></section>
      <section><h2>提供と責任範囲</h2><p>内容の誤りや不具合が分かった場合は、問い合わせ先へご連絡ください。保守や障害対応のため提供を一時停止する場合があります。本規約は、法令上認められる利用者の権利を制限するものではありません。</p></section>
      <section><h2>準拠法</h2><p>本規約は日本法に基づき解釈します。</p></section>
      <section><h2>お問い合わせ</h2><p v-if="SITE.contact_email"><a :href="`mailto:${SITE.contact_email}`">{{ SITE.contact_email }}</a></p><p v-else>公開前に運営者の問い合わせ先を設定してください。</p></section>
    </article>
  </div>
</template>
