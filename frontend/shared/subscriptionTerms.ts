import type { ExamConfiguration } from './schemas/exam.ts'

export const CANCELLATION_STEPS = [
  'ログイン後、右上のメニューから「契約・解約の管理」を開きます。',
  'マイページの「契約・支払方法・解約の管理」を押し、Stripeの契約管理画面を開きます。',
  '対象の契約の解約（キャンセル）を選び、確認画面で確定します。管理画面に解約の受付完了と利用終了日が表示されたことを確認してください。',
] as const
export const CANCELLATION_DEADLINE = '次回分の請求を止めるには、次回の契約更新日時より前に解約の確定まで完了してください。次回更新日をStripe管理画面で確認し、余裕をもってお手続ください。更新後に解約した場合は、更新後の契約期間末で終了します。'
export const CANCELLATION_EFFECT = '解約は契約期間の末日に有効となります。支払済みの期間は引き続き利用でき、その後は無料会員となり、有料問題とお気に入り機能の利用は終了します。解約手続のためのアカウント削除は不要で、解約だけでは学習履歴やお気に入りは削除されません。'
export const CANCELLATION_REFUND = '利用者都合による期間途中の解約について、日割りの減額・返金は原則として行いません。重複決済・提供不能・契約内容に適合しない場合はお問い合わせください。法令上認められる権利を制限するものではありません。'

export function subscriptionCheckoutMessage(config: ExamConfiguration, origin: string) {
  const price = new Intl.NumberFormat('ja-JP').format(config.payments.amount)
  const free = config.grades.map(grade => {
    const count = grade.free_exam_count ?? config.payments.free_exam_count
    return `${grade.label}は${count === 0 ? '無料枠なし' : count === 1 ? '模試1が無料' : `模試1〜${count}が無料`}`
  }).join('・')
  return `月額${price}円（税込）。申込時に初回決済し、解約するまで毎月自動更新します。全級共通で公開中の全問題とお気に入り機能を利用できます。${free}。解約手順：${CANCELLATION_STEPS.join(' ')} ${CANCELLATION_DEADLINE} ${CANCELLATION_EFFECT} ${CANCELLATION_REFUND} [契約・解約の管理](${origin}/account#subscription-management)`
}
