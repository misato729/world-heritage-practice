# Stripeウォレット対応（2026-11-03）

## 対応内容

4リポジトリへカード・Apple Pay・Google Pay・Link・PayPayの対応をそろえるユーザー依頼。PayPayは審査中のため、コードの許可対象へ加え、実際の表示はStripeの審査・有効化・利用条件に従う。

Checkoutの `allowed_payment_method_types` は `card`・`link`・`paypay` の3つに限定する。Apple Pay/Google Payはカード系ウォレットであり、APIへ独立したpayment method typeとして追加しない。元の `card` 指定だけで両ウォレットが禁止されるという説明は訂正する。アプリでウォレット非表示指定を追加せず、Stripe-hosted Checkoutが端末・ブラウザー・アカウント等の条件に従って表示する構成を維持する。

一般の決済手段をすべて解禁しない。LinkとPayPayは公式仕様上即時確定であり、現行の署名付き `checkout.session.completed` のpaid・金額・通貨・利用者・Price・livemode照合後だけ資格を付与する。コンビニ等の遅延確定方式は今回追加しない。PaymentIntentのmetadata、規約同意、ラボ固有のブランド表示、冪等性、返金・紛争、既存の販売準備確認を保持する。

既存のopen Checkoutは、保存された `allowed_payment_method_types` が3方式だけの集合に一致する場合に再利用する（順序不問）。カード限定・card/linkのみ・null・余分な方式がある場合は、Stripeから同ID・expired・同livemodeの応答を確認した後だけDBをexpiredへ更新して新発行する。支払完了と競合する/期限切れ未確定/異なる応答の場合は新規作成せず止める。実際のサーバーへ配信後、利用者が再度購入開始する際に適用される処理であり、今回のローカル作業で本番のCheckoutを期限切れにしてはいない。

特商法ページの支払方法は5手段を列挙し、「利用可能な方法はStripeの決済画面に表示」と明示する。審査中PayPayや非対応端末にも必ず表示されるとは約束しない。料金、月額なし/買い切り、返金条件等は変更しない。

## 確認結果

- 専用の使い捨てPostgreSQLコンテナと4つの新規test DBを用意し、それぞれの既存マイグレーションを適用。通常DB・会員・教材・Stripe接続キーを持ち込まない。
- 本版の全決済回帰 30件が成功、失敗/skip 0。4版合計140件。Stripeクライアントは合成で、実Stripeの決済試験とは区別する。
- 新規9件：旧4種フィルタからの新発行、期限切れ応答の3不正状態では新規0、Link/PayPay各paidのみ付与・unpaid拒否・重複通知冪等。既存の再利用試験では3方式の順序を変えても再利用することを確認する。
- `npm run typecheck` と既存の `legalPages.test.ts` が4版すべて成功。重い検査は順番に行う。
- 現行Stripe SDKのCheckout型で許可enum/Sessionのallowlist応答を照合。新しい依存ライブラリ、migration、秘密値は追加しない。

実画面は通常のAPIサーバーを除外した専用プレビュー/合成の販売者情報で確認。4版ともPC1280×800/SP390×844で5手段の表記・表示条件の注記・折り返し・横はみ出しなしを確認し、8枚の画像を目視した。テンプレートは検証用コピーだけ課金表示を有効にし、元の設定は変更していない。情報教認では、今回変更した特商法ページの既存の最終更新日だけ2026年11月3日へそろえ、その既存テスト4件も成功した。

独立担当 `premium_review` が4版のコード/回帰/文書/型・法務テストの記録を照合し、PC/SP8枚を目視して最終PASS。既存dirtyと設定の保持、情報教認の最終更新日、検証用コピーだけの課金表示も区別して確認した。

4つのプレビューサーバーを停止し、画面サイズの上書きを解除した。専用テストコンテナと4検証DBは削除済み。既存の別作業ファイルは開始時の照合値を保持した（世界史は今回更新する共有stateを除く）。Stripeの管理画面、既存Checkout、通常DB、本番の販売状態は変更していない。

一時控え：`/tmp/wallet-template-payments-20261103.log`、`/tmp/wallet-template-types-20261103.log`、`/tmp/wallet-template-legal-20261103.log`、`/tmp/wallet-template-pc-20261103.png`、`/tmp/wallet-template-sp-20261103.png`。本記録とリポジトリ内の回帰を継続検証の正本とし、一時控えの永続性を前提にしない。

## 公式根拠

- [Checkout作成API](https://docs.stripe.com/api/checkout/sessions/create)：allowlistはStripeが動的に判定した利用可能手段へのフィルタ。
- [LinkとCheckout](https://docs.stripe.com/payments/link/checkout-link)：Linkの有効化と決済方式指定。
- [Link](https://docs.stripe.com/payments/link)：支払原資によらず即時確定。
- [PayPay](https://docs.stripe.com/payments/paypay)：JPY/1回払い/即時確定、Checkout対応と有効化条件。
- [StripeのApple Pay対応](https://stripe.com/payments/apple-pay)：Checkoutのカード系ウォレットとしての対応。

## 今回の変更ファイル

- [frontend/server/services/payment-checkout.ts](../frontend/server/services/payment-checkout.ts)
- [frontend/server-tests/payments.test.ts](../frontend/server-tests/payments.test.ts)
- [frontend/app/pages/commercial-disclosure.vue](../frontend/app/pages/commercial-disclosure.vue)
- [docs/stripe-wallets.md](../docs/stripe-wallets.md)

今回の依頼/評価はGit・Docker除外の `local-only/stripe-wallets-20261103/task.json` に記録する。テンプレート同梱workflowは世代0/空のまま保持する。

既存の別作業は保全。今回、コミット・push・Netlify/Fly配信・Stripe設定・審査手続き・本番データ変更は行わない。Apple Pay/Google Pay対応実機、Linkログイン/PayPayアプリ、実Stripe Sandbox/本番の支払確定・返金を成功確認したものではない。

## 後続の送信・公開依頼

2026年11月3日の明示依頼により、上記ローカル実装を送信・公開する。[配信段階の確認結果](stripe-wallets-release.md)を参照。テンプレートは追加回答によりcommit/pushのみ。
