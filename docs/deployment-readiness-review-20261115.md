# 新規本番環境・月額販売の独立レビュー（最終）

確認日：2026年11月15日。担当：`production_readiness_review`。対象はNetlify静的フロント、Fly.io Nitro API、Neon PostgreSQL 16、既存Stripe本番アカウント内に追加する世界遺産ラボ専用月額プラン。

**最終判定：PASS（新規本番配信・月額申込受付、実課金なしの確認範囲）。未解決の必須指摘は0件。** D1〜D6の修正と、公開後に判明したD7の専用3リンクによる対応を、最終ソース・安全な実行記録・保存画像で照合した。

対象は[公開UI](https://world-heritage-practice.netlify.app)、Netlify deploy `6af8a4cec1fed4b0a8cb6cf9`、Fly image `registry.fly.io/world-heritage-practice:deployment-01M7DP1YNC84CTWSDMBW3CHV92`。最終配信対象250ファイルのmanifest SHA-256は`91a92aaf1f93d898ad699fb888eb347ca585046792ed4297f08cda2665bf6d40`。この担当の再計算でも現在の250ファイルに不一致0件で、release記録・LIVE画面確認記録も同じmanifestを指した。

公開された準1級・2級の模試1〜10、計1200問/4800肢、各級1〜3無料・4以降有料、税込500円/月の全級共通申込、同一Originの会員操作、無料会員/匿名の有料境界、未払い/失効Sessionの非付与、専用同意と後片付けを確認した。検査や本番操作をこの担当が再実行したという意味ではなく、配信担当が保存した安全な結果と対象版・実画面を独立照合した判定である。

既知の制約は、共通フッターの他ラボ向け特商法リンクの残存、実課金・更新・有料契約者Portal/解約の未検証、移行前空DBの可搬復元に限る検証、通常envとしてのNetlify署名値保存、メール再設定/外部障害通知の無効状態である。これらを対応済み機能や実証済み運用とせず、末尾の最終確認に詳記した。1級教材は未収録、並行する模試11〜20は未公開のまま。コミット・pushは行っていない。

以下の初期指摘・途中判定・途中指紋は当時の記録として保持する。現在の判定と対象版の正本はこの冒頭と末尾の最終確認である。

## 初期レビュー時点の対象版・確認範囲

- HEAD：`537f9ee1ba1fbb51d0686ca64ff92bc9a5b6b2c5`。開始時点の追跡済み差分は既存の`docs/workflow/state.json`のみ。アプリの追跡済みソースに未コミット差分はなかった。
- `AGENTS.md`、実設定・認証・共通API境界・回数制限、月額Checkout/契約照合/Portal/退会、旧買切り処理とWebhook、教材読込CLI、Nuxt/Netlify/Docker設定、Prismaモデル・マイグレーション、公開の申込・規約・プライバシー・特商法ページ、既存実装記録を確認した。
- 本番・開発DB、Stripe・Netlify・Fly・Neonのアカウント情報、秘密値、会員情報、教材本文、PDF・OCR・原画像は取得していない。外部サービスやDB、アプリコード、stateは変更していない。
- `frontend/server-tests/subscriptions.test.ts`は検査意図を確認したのみで、既存の合格を今回の実行結果として扱わない。DB試験・ビルド・ブラウザ試験は今回未実施。
- 下記の行番号はこの初期対象版の番号。修正後は変更点の指紋と実行根拠に結び直す。

## 修正・確認が必要な事項

| ID | 優先度 | 根拠 | 具体的影響と対処 |
| --- | --- | --- | --- |
| D1 | P1 | `netlify.toml:1-10`、`frontend/app/plugins/api.ts:8-15`、`frontend/server/core/http.ts:35-44` | 静的配信だけが定義され、`/api/*`をFlyへ送る規則がない。`frontend/public/_redirects`もない。このままでは会員登録・ログイン・教材・購入APIがNetlifyから使えない。API規則をSPAフォールバックより前に追加し、元の`/api/`パスを保持する。`NUXT_PUBLIC_API_BASE`は同一Originのままとし、返却JSON、Cookie、署名付きWebhook、未定義APIの扱いを実配信で確認する。 |
| D2 | P1 | `frontend/app/pages/terms.vue:10,15`、`frontend/app/pages/privacy-policy.vue:9,13-14`、`frontend/app/pages/commercial-disclosure.vue:42`、`config/exam.json:12`、`frontend/app/pages/premium/index.vue:117` | 規約・プライバシー・特商法に草案案内が残り、問い合わせ先は空。申込ページには旧買切り資格の「サービス終了まで有効」等の文言が残り、月額期限と矛盾する。実際の運営・委託先・問い合わせ・保存/削除方針と、支払済み期間・自動更新・解約/退会・返金の扱いを整合させてから販売する。販売者envを埋めるだけではこれらの固定文言は完成しない。 |
| D3 | P1 | `frontend/server/core/rate-limit.ts:10-15,31-34`、`frontend/server/api/auth/[...all].ts:19-24` | 前段がNetlifyのとき、`Fly-Client-IP`は閲覧者ではなくNetlify側のIPになる。複数利用者が新規登録10回/15分・ログイン30回/5分等の同じ制限を消費し、正常利用者が拒否される。前段の真正性を確認できる境界を用意してから信頼する閲覧者IPを採り、APIへ直接送った偽装ヘッダーでは制限を回避できないことも検証する。任意のXFFやNetlify名のヘッダーを無条件では信頼しない。[Fly公式](https://docs.fly.io/networking/request-headers)は前段プロキシがある場合の値を明記し、[Netlify公式](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/)は外部向け署名付きプロキシを提供する。署名の利用だけで任意の付属ヘッダーまで改ざん耐性があると扱わない。 |
| D4 | P1 | `frontend/server/services/payment-webhooks.ts:39-47,70-76,155-160`、`frontend/server/services/payments.ts:40-45` | 共有Stripeアカウントの他ラボの`mode=payment`の`checkout.session.completed`が旧買切り処理へ入り、世界遺産DBに行がないため`PaymentNotReadyError`→HTTP 500になる。専用Webhook destinationでもイベント種別だけでは他商品の同種イベントは分離できない。本サービスのStripe資源/ローカル所有行を境界に、他サービスは成功応答で無視し、本サービスの到着順競合だけを再試行させる。旧買切りのrefund/disputeにある共通metadata判定も確認する。逆方向に新規契約イベントを受ける既存他ラボendpointの挙動は未確認。 |
| D5 | P2・販売前必須 | `frontend/server/services/subscriptions.ts:71-78` | Portal Sessionに`configuration`がなく、アカウントの既定Portalへ依存する。既定が解約不可・即時解約・プラン/数量変更・割引等を許す設定なら、案内と異なるか、請求額/Priceが変わり照合で拒否される。世界遺産用の設定IDを明示し、期間末解約、支払方法更新、プラン/数量変更なし、割引・休止なし等を確認する。既存他ラボの既定設定は変更しない。[Stripe公式](https://docs.stripe.com/customer-management/integrate-customer-portal)は未指定時の既定設定と個別設定の指定を説明する。 |
| D6 | P2・販売前必須 | `config/exam.json:16`、`frontend/app/pages/premium/index.vue:97,108-117`、`frontend/server/services/subscriptions.ts:29` | ホームは準1級・2級を収録、他教材は準備中と示すが、購入ページとCheckoutの説明は3級共通の対象だけを述べ、1級未収録を購入前に確認できる場所で明記していない。現時点の収録級・回数を明示し、1級の実問題や公開時期を約束しない。設定上の1級90問×10回のメニューは教材収録の証拠としない。 |

D4は2026年11月15日に実装を直接呼んで再現した。Stripe/DBに接続しないfake DBと合成の他サービス`checkout.session.completed`を`processStripeEvent`へ渡し、`foreignCheckoutError: PaymentNotReadyError`を確認した。HTTP 500への変換は`payments.ts:40-45`で静的確認した。実カード・本番通知の試験ではない。

## 実設定で満たす条件

| 対象 | 必須条件 |
| --- | --- |
| 配信先 | 世界遺産専用のNetlify Site、Fly App、Neon project/DBを明示。既存ラボの配信先・DB・鍵を流用しない。公開フロントOriginは1つに定める。 |
| Netlify | `frontend`をbase、`npm run generate`、`.output/public`のみを配信。Node 24、static Nitro、API baseは空。同一OriginのAPIプロキシ、SPA再読込、APIエラー、Cookieと`no-store`を確認。署名の秘密値はコード/静的出力へ入れない。 |
| Fly | リポジトリルートをDocker context、`frontend/Dockerfile`のproduction段階を指定。`APP_ENV=production`、`NODE_ENV=production`、3000番へ到達する設定、HTTPS、実際のhealth endpointを確認。開発段階や自動seedで起動しない。 |
| 認証 | 独立した64文字以上の`BETTER_AUTH_SECRET`。`BETTER_AUTH_URL`と`FRONTEND_URL`は公開フロントの正確なHTTPS Origin。CORSは必要なOriginのみ。プレビューOrigin、Fly API Origin、ワイルドカードを慣例だけで許可しない。 |
| Neon | PostgreSQL 16の専用空DB。接続はTLS必須。現コードは業務API・rate limiter・Prisma Migrateが同じ`DATABASE_URL`を読むため、無変更ならdirect URLを使って単一プロセス最大12接続（業務10+制限2）とマイグレーション等の余裕を確保する。pooled/directを分けるならMigrateとdump/restore用のdirect接続を明示する実装/実行設定が必要。[Neon公式](https://neon.com/docs/connect/connection-pooling)はMigrate・dump/restore等にdirectを指定する。 |
| 初期DB | Prisma Migrateの未適用4件を空DBへ適用し、適用状態・DB制約・公開教材件数を確認。稼働DBのコピー・reset・自動baseline・マイグレーション書換えは行わない。空DBにもバックアップと、ローカルtest使い捨てDBでの復元検証の根拠を用意する。 |
| 教材 | production起動は教材を投入しない。承認済み2級600問・準1級600問を、級を明示して空級へ登録し、公開状態・各回60問/240肢・正答1件・原稿/DB指紋を確認する。1級へ他級の教材を流用しない。内容と件数は既存記録上の期待値で、今回は実DBを調べていない。 |
| Stripe商品 | 世界遺産専用のProductとPrice。active/live、JPY 500、recurring、month、interval_count=1、tax_behavior=inclusive。既存の他ラボProduct/Price/Subscriptionは変更しない。`STRIPE_PRICE_ID`はこのPrice。 |
| Stripe秘密設定 | Fly側だけにサービス用の権限を絞ったliveキーと専用destinationの署名鍵を登録。`STRIPE_LIVEMODE=true`。`PAID_MEMBERSHIP_ENABLED`は修正・設定・実配信確認後に有効化。キーの値、Webhook本文、個人情報は出力しない。 |
| Checkout | subscription、quantity=1、割引/クーポン/無料期間なし、税込500円の自動更新が見える。現在の単純月額プランでは自動税加算なし。`automatic_tax=false`と税込Priceの組合せは課税登録や納税の確認を代替しない。対応支払方法は実装と案内をそろえる。 |
| Portal | 本サービス用configurationを明示。解約は期間末、支払方法の更新可、プラン・数量・割引・休止による請求条件変更なし。設定IDだけでなく取得した設定内容と実画面で確認。 |
| 規約リンク | `consent_collection.terms_of_service=required`はStripeアカウントの公開設定に有効な規約URLが必要。インストール済Stripe 23の`Checkout/Sessions.d.ts:2476-2479`で確認。現Checkoutは専用の同意文言/規約リンクを上書きしていない。既存他ラボ向けの共通URL/ブランドを一括変更せず、本サービス規約・プライバシーへの行き先を実Checkoutで確認する。 |
| 販売者 | name/representative/email必須。所在地/電話を公開するか、`SELLER_CONTACT_DISCLOSURE_MODE=on_request`と対応体制readyを実際の運用に基づいて設定する。値を埋めるだけで対応体制ありと扱わない。公開ページと連絡窓口が利用できることを確認。 |
| 通知・問い合わせ | Webhook失敗を安全な固定情報で検知し、照合/再送・解約・返金/紛争対応の担当と手順が利用できる。メール再設定が未構成なら利用者向け表示との整合を確認する。 |

## Webhookと契約の境界

現在実装が契約照合へ結び付ける最小イベントは次の6系統。

- `checkout.session.completed`（subscriptionモード）
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

API版はインストール済Stripe SDKと整合する版に固定し、署名鍵は当該destination用とする。`invoice.parent.subscription_details.subscription`と旧`invoice.subscription`の両方を解決する実装である。成功ページは権限付与の根拠にしない。

旧買切り用の`checkout.session.expired`、`refund.created/updated/failed`、`charge.dispute.created/closed`は存在するが、新サブスクの失効処理を意味しない。`charge.refunded`と`radar.early_fraud_warning.created`も現状は契約処理へ結び付かない。未対応イベントを購読するだけで対応済みにしない。

新サブスクの返金・紛争の自動失効は既存設計から未実装である（`docs/multi-grade-subscription-implementation.md:22-24`）。販売前に、対象契約をStripeで即時停止し、Webhook又は明示的照合でcanceled/期限を確認してから返金等を扱う運用を確定する。通知・問い合わせを放置せず対応できる根拠が必要である。自動化を追加するならイベント所有境界と全額/一部返金・紛争の受入条件を別途実装し検証する。

`subscriptions:sync`は`stripe_subscription_id`を持つ行だけを照合する（`frontend/server/operations/cli.ts:27-31`）。初回通知がすべて欠落してpending Checkoutだけが残ったケースを修復しないため、そのケースはStripe通知の再送など別の手順が必要である。

## 静的に確認できた保護

- Better Authの公式Prismaアダプター・DBセッション・現DB権限を利用し、Secure/HttpOnly/SameSite=Laxを設定。任意Hostで公開URLを選ばない。業務APIもOrigin/JSON/CSRFの境界を通る。Webhookだけはraw bodyのStripe署名で認証する。
- 有料問題の取得・回答はAPIで無料枠1〜3と現在の資格を確認する。新Subscriptionの有効な支払済み期間は全3級共通、旧Membershipは2級のみ。回答前の公開payloadは正答・解説を含まない。
- Priceは税込JPY500・毎月1回を検査。支払済みInvoiceの期間だけを延長し、支払失敗では期限を追加しない。Subscription単位ロック、利用者行ロック、イベントID一意性と同一トランザクションを用いる。古い通知でも現在のStripe Subscriptionを再取得する。
- 退会は利用者行をロックし、未完了Checkoutの停止又はSubscriptionの即時停止を確認してから関連行を削除する。
- 新規空DB用の追加マイグレーションはgrade列・級を含む一意索引・Subscriptionを追加し、教材/利用者の再投入をしない。Prisma Migrate以外のresetや自動baselineはしない。
- ルート`.dockerignore`は`.env`、鍵、local-only、textbook、past-examと派生原資料を除外。Dockerfileはルートcontext前提であり、`frontend/.dockerignore`だけを根拠に原資料保護を保証しない。
- Netlifyに出す対象は静的出力だけ。Flyには確定済み教材と必要コード、Neonには承認された公開用教材の構造化データだけを扱い、PDF・OCR・原本画像・作問の内部レビュー資料・個人データを一括転送しない。ローカル専用保護を別名コピー等で迂回しない。送信前の`node scripts/check-private-sources.mjs`は配信担当で実施する。

## 次回の再レビュー条件

1. D1〜D6の修正差分と対象指紋、実際のFly/Netlify設定、接続先・Stripe Price/Portal/destinationの安全な設定要約を受領する。
2. 空DBの適用/バックアップ・復元根拠、教材登録の前後件数/指紋と公開状態を確認する。
3. 独立test環境の自動検査と、公開後のPC/SPで無料問題・ログイン・有料境界・申込案内・未収録1級・Portal/規約リンクを確認する。
4. Stripe通知の再送・順序違い・更新失敗/期限切れ・期間末解約・退会・他ラボ通知無視の結果と、無課金LIVE Checkoutの表示/失効確認を点検する。実カード課金が未実施ならその限界を明記する。
5. 配信された版とレビュー対象版を一致させ、販売フラグを有効にした後の公開payment config・教材有料境界を確認して判定を更新する。

本ファイル以外はこの担当から書き込んでいない。コミット/push・配信・販売設定変更は行っていない。

## 修正版の再レビュー（同日・本番リリース前）

対象は同じHEAD上の今回の差分と新規ファイル。新たに`fly.toml`、`frontend/server/core/netlify-proxy.ts`、`frontend/server/middleware/netlify-proxy.ts`、対応回帰を確認し、既存の教材作成履歴や問題本文を再読していない。並行する2級模試11〜20の作問差分・stateはレビュー対象外。

| 初期指摘 | 再確認した修正 | 残る実確認 |
| --- | --- | --- |
| D1 | `netlify.toml:14-24`で`/api/*`をFlyの`/api/:splat`へforce/proxyし、その後に`/200.html`のSPAフォールバックを置いた。API baseは空。 | 実Netlify配信でAPI JSON、再読込、Cookie、未定義API、キャッシュを確認。 |
| D2 | 規約・プライバシー・特商法の草案表示を削除し、運営者の参照、実際の4配信/決済先、国外処理、支払済み期間・期間末解約・退会・取引記録/バックアップの扱いを記載。問い合わせ先を設定し、旧買切り文言を修正。 | 公開ページの販売者実表示・問い合わせ導線・PC/SP表示を確認。法律適合性の専門家判定を行ったという意味ではない。 |
| D3 | Netlify標準HS256 JWTを`jose`で検証し、issuer/exp/site ID/production contextを限定。単一の妥当な接続IPだけを採用し、Better Authと業務制限に共用。署名なし・不完全設定はfail closed。直接許可はhealth GET/HEADとStripe署名を別途検査するWebhook POSTだけ。 | 実Netlifyからの署名/接続IPヘッダー、Cookie/Origin経路が成立すること。JWT自体はIPを署名対象に含まないので、Netlifyが利用者から指定された同名IPヘッダーを上書きし、直接Flyへの偽装では採用されないことも確認する。 |
| D4 | `payment-webhooks.ts:39-52,83-89`で他サービスの未記録Checkout/refund/disputeを無視。本サービス明示tag、現在のPrice、DB履歴上の旧Priceを所有判定に使用し、既存のStripe資源ID bindingを優先。本サービスのDB commit前通知は再試行可能なまま保持。 | 親実施のDB/HTTP回帰根拠と実署名通知結果を確認。既存他ラボendpointの設定変更や他ラボへの修正展開は今回行わない。 |
| D5 | `payment-settings.ts:45`と`subscriptions.ts:83-90`でサービス用Portal configurationをSessionへ明示できるようにした。既定fallbackは互換用に残る。 | 本番の`STRIPE_PORTAL_CONFIGURATION_ID`が指定した専用bpcを指し、実Portalで期間末解約・支払方法更新だけを提供すること。 |
| D6 | premium、特商法、規約、Checkoutの申込説明で準1級・2級の模試1〜10と1級準備中を明示。 | 新規本番DBの実収録・公開件数と、公開Checkout/申込案内の一致を確認。 |

月額Checkoutは型付きの`allowed_payment_method_types=['card']`へ変更し、料金/quantity/割引なし/自動税加算なしの条件を維持した。専用の規約Markdownリンクとランダムな8文字suffixの`integration_identifier`も確認した。Stripeアカウント全体の既定規約・privacy・ブランドは変更していない前提で、公開Checkoutのリンク先を実画面で確認する。

`frontend/server-tests/netlify-proxy.test.ts`は署名偽造/失効/他site/他context/不正IP/不完全設定、middleware未経由、health/Webhook限定の例外、2閲覧者が同じFly側IPでも独立したBetter Auth制限を使うケース、実Nitro scannerでのmiddleware順序を含む。課金回帰も、他サービスへの成功応答と非付与、本サービス記録待ちの非ack、旧Priceのbinding、専用Portalパラメーターを確認する内容である。テストが実装の任意ヘッダー受理だけをもってNetlify自体の上書き挙動を証明したとは扱わない。

Flyは`sin`・production段階・3000番・HTTPS・healthを明示し、`BETTER_AUTH_URL/FRONTEND_URL/CORS_ORIGINS`は同じ公開Netlify Origin。Docker起動時だけ`DATABASE_URL_UNPOOLED`をMigrateへ渡し、APIの通常接続は`DATABASE_URL`のままにする変更を確認した。販売・パスワード再設定メール・外部障害通知は、この時点の`fly.toml`では無効である。

配信担当からの安全な設定要約（この担当がアカウントへ接続して再取得した値ではない）：

- UI：`https://world-heritage-practice.netlify.app`、API：`https://world-heritage-practice.fly.dev`、Netlify site：`5ce0a431-2976-4636-a6ed-39052dfd21b4`。
- 新規Neon project：`shiny-pine-67698341`、PostgreSQL 16、Singapore。Flyも`sin`。既存ラボのDBは使用しない。
- 新規専用Product：`prod_world_heritage_lab_monthly`。Price：`price_1UbkYn4aKzZO4ferAPsPNTFJ`、active/live・JPY500・inclusive・month/1。
- 専用Portal：`bpc_1Ubkft4aKzZO4ferMaCS7J9k`、期間末解約・プラン変更なし・本サービスの規約/privacy。既存他ラボ設定は変更していないとの報告。
- 専用制限付きStripeキーと認証/proxy/DBの秘密値は、この担当では読んでいない。秘密領域への登録と本番bindingの結果を別途確認する。

配信担当から、fresh PostgreSQL 16で対象DB/API/課金/proxy回帰55件と型検査が成功したとの報告あり。この担当はまだ実行結果ファイルを確認していないため、今回の自担当実行としては数えない。E2Eの初回停止は専用ブラウザ未導入による環境要因で、準備後に再実行予定との報告である。成功と読み替えない。

教材はローカル専用archiveを転送せず、承認された開発DB教材を共通CLIから新規exportし、新本番DBへ級別importする方針を確認した。現在報告された各600問と個人所有行0のpayloadを固定し、並行作業の11〜20が加わったDBから無条件に取り直さない。import後の件数・回数1〜10限定・肢数・指紋・無料有料境界は未確認。

返金/紛争は、新規自動失効や他ラボの通知設定変更へ拡張せず、既存設計の「本サービス契約を即時停止→取消し/期限の同期を確認→返金等」を本番運用記録へ明記するという配信担当の方針を確認した。これは現実装と整合する。Sentry外部通知が無効のままであることと、Stripe既存の通知/問い合わせに基づく運用を、自動失効や自動障害通知が実装済みであるかのように説明しない。

現時点の結論：**今回の修正ソースと提示された構成設計に、追加の必須修正指摘はない。総合判定は実設定・配信・教材移行・代表画面・無課金LIVE Checkoutの確認待ち。**

修正版の対象指紋。下表のpath順で`[[path, SHA-256], ...]`を空白なしJSONにしたSHA-256は`79596584011a8a778a8ae8a9d23be6f4ad3c86c4ad2202568ef0a35e70d9e609`。この一覧にない既存コードは前記HEADからの差分がないことを確認した範囲を継承する。

| path | SHA-256 |
| --- | --- |
| `.env.example` | `e35f790faaee50e9b6df138758349e63e055d93ee315db648002ad8c50493a14` |
| `config/exam.json` | `dae8be908a81b1bd1557aaa5f036104e270edd7309b41a9d9da87e9503e5a99f` |
| `fly.toml` | `9dbc5ac07b3d24fd2cef9dd8dc59f6d84ddcaed3b4ffb1392156ad42886bfb3b` |
| `frontend/Dockerfile` | `a05e76083373c72995001873dc80df6eae1ecc632d5fbcae6315a8ac29228db0` |
| `frontend/app/pages/commercial-disclosure.vue` | `dcd18df400eca304d755617f6d125262d9906dab92dec83cb8f72628206e6190` |
| `frontend/app/pages/premium/index.vue` | `c3cae4336ae3f2181ed861083292bad93fc3d4b839cc3aa8d2d55ca9d1c0f640` |
| `frontend/app/pages/privacy-policy.vue` | `c5b5b7d7e67c037a29f611c261aa77cb21d975cdef0697465530ebaf07e6aa6a` |
| `frontend/app/pages/terms.vue` | `b40e41ce51e807bf9fcbb1229e8e57102822668efc09ae35dbcdeff9f332667a` |
| `frontend/package-lock.json` | `e2a95d17201656f6797f7084dacbcf631671f68b62c9e767bc90d0c7b5c2d8a7` |
| `frontend/package.json` | `4585f8b0a64b53d70400c8f3db78cce29d4fca83dc9eddf15d283fe0f3f97f2f` |
| `frontend/server-tests/helpers/api-app.ts` | `ac4cd58acecbf72d1f4f77fab1f2100a4f718290f68174c977505ef13726c890` |
| `frontend/server-tests/netlify-proxy.test.ts` | `1268424a6a8984a54da665d124f62fa63eace352a54933b4970c9050a908568b` |
| `frontend/server-tests/payments.test.ts` | `6096433140028209cfed880d98fa0aca9ca34da603f2ffea4eda4c7e5ae2cffa` |
| `frontend/server-tests/subscriptions.test.ts` | `ddd3b0e92609c772b74fd71a9b58a06948d5b124412b1447d64739fed42df9c8` |
| `frontend/server/core/netlify-proxy.ts` | `ed20ea41da696d045cdfe78798696ceef31ea96077a20fc43c2c6ef62adb286a` |
| `frontend/server/core/rate-limit.ts` | `5232997638e1c28d3bc3ea2e00c99b3748826a3a79717d40bb6dd9c47c36b603` |
| `frontend/server/middleware/netlify-proxy.ts` | `259497ac59881789d69c6a4a1375f41a168124dc34cf39c81fc2391e80dd4da3` |
| `frontend/server/services/payment-settings.ts` | `89d18a61012767dcf684e0eda1f2920fdb99f981c31158716a2bae8cbec327fe` |
| `frontend/server/services/payment-webhooks.ts` | `7ce036cf85d646cd766129d229a6917e15543632085f82c573aaa6dca69154b2` |
| `frontend/server/services/subscriptions.ts` | `1730ae3022cbb19904b25af94bc93ede87f71cd1ec664b2e9ecd68085f46a5d0` |
| `netlify.toml` | `a47d8f239234ef9ab080dd43adf2c3597ccf39c01e2b401221ce931c64a242b5` |

## 静的生成の追加2ガードと安全な実行記録の限定確認

追加差分は`frontend/server/plugins/readiness.ts:8-10`と`frontend/app/composables/useAuth.ts:79-81`の`import.meta.prerender`ガードだけ。前者は静的生成時だけ起動時の秘密値・Origin・DB疎通の検査を省き、通常のNitro APIでは既存の全検査と終了処理を維持する。インストール済Nitroの`dist/rollup/index.mjs:1866-1881`で、このフラグが`nitro-prerender` presetの場合だけtrueになる実装も確認した。

後者は静的生成時に匿名shellを作り、`authResolved`・user・request generation・重複排除mapを変更せずにreturnする。通常サーバー/ブラウザでは従来どおり`/api/v1/me`を確認する。初期値falseの`authResolved`を解決済みとしないため、hydration時の`session.global.ts`と`auth-session.client.ts`によるセッション確認が残る。**この2変更に必須修正指摘はない。** 生成成功・匿名payload・実公開後のセッション確認はこの静的判断と区別する。

対象指紋：

| path | SHA-256 |
| --- | --- |
| `frontend/server/plugins/readiness.ts` | `19d6efdee67909ec8a1917af684a4161b3400b2b33d8c1e49f95fe5bdf57a1e1` |
| `frontend/app/composables/useAuth.ts` | `c7ffe3aef143157cb8a6f9d22836b4dcb57cdc7c73d34aa6bb02ebbe6c5dd926` |

`local-only/deployment-20261115/source-manifest.json`の250ファイルと現作業領域を機械照合し、差分は上の2ファイルだけだった。manifestは追加前の版なので配信担当で更新する。親実施の認証回帰14件成功は報告として確認し、この担当で再実行した結果とはしていない。

今回、この担当が安全な項目に限って直接確認した記録：

- `local-only/deployment-20261115/verification.json`はDB/API/proxy回帰55件成功・失敗0・skip0、型検査成功、資料保護/設定/schema生成/差分検査成功を記録。記録内の14対象指紋を現在のファイルと照合し全件一致した。
- 同記録の26E2E成功・失敗0と参照先`e2e-final.log`の`26 passed (2.4m)`を確認した。Playwrightが導入済みChromeを使用したPC/SP幅の検査であり、物理スマートフォンや実課金の検査ではない。初回の環境準備による停止結果は最終成功へ書き換えていない。追加2ガード後の静的生成検査とは別の根拠である。
- `stripe-binding.json`で専用runtimeキーによるPrice readの成功、指定Priceのactive/live・JPY500・recurring month/1・inclusive・trialなし、専用Portalのactive/live・本サービス規約/privacy URL・支払方法更新可・期間末解約・prorationなし・プラン変更無効を確認した。秘密値を取得したのではなく、配信担当が安全に保存したStripe read結果の確認である。
- `import-result.json`は2級600問/2400肢（SHA-256 `a3a077d5d8f1faa0e0ebfa8300939c0e111a6c25929c1ede7dcc958bcc17aa45`）、準1級600問/2400肢（SHA-256 `f3a095cd0316b4b4ccf9d05f72ca6d52c8210ded217bde43a6bcd7040f91a9f7`）の成功、新本番からの再exportと承認済みsourceの一致、個人データ移行なしを記録している。教材本文や原資料は読んでいない。実公開APIの件数・利用制限確認は別途残る。
- `restore-result.json`は原本dumpを保持し、`no-owner/no-acl`、stock PostgreSQL 16にない`pg_attver`列option138件だけを除いた可搬版を、新規のローカル使い捨てtest DBへ復元した成功を記録。対象はimport前の質問0・会員0・契約0、適用マイグレーション4・制約49。**クラウド原本を無変更で復元した証明や、教材import後/非空会員データの復元保証ではない。** 失敗と正規化の理由を隠して通常の完全復元成功として扱わない。

配信担当から、Neon poolerが既存のPrisma接続のtimezone/search_path startup optionを拒否したため、Fly APIもTLS `verify-full`のdirect URIへ統一したと報告があった。単一VM、業務プール10＋rate limiter2という上限を前提にする。この構成ならMigrateとAPIを同一direct接続先にすることは先の指摘と整合する。接続秘密値は確認していない。

Netlifyの署名用envについて、無料プランでscope制限/secret属性が拒否された後、通常envへproduction/runtimeを含む全scopeで保存することをユーザーが明示許可したという配信担当の報告を確認した。Netlify管理者から閲覧できる保存であることを秘密属性ありと説明しない。今回の公開生成プロセスには値を渡さず、静的出力への漏出検査を実施予定との報告。Stripe秘密キーはFlyの秘密領域だけとし、この担当は両値とも読んでいない。

総合判定は実配信と代表ケースの確認待ちを維持する。今回の追加ガードでAPIの認証/DB検査を弱める変更や、月額条件・教材の公開範囲を拡張する変更は確認されなかった。

## 最終確認・D7の対応と残る制約

確認日：2026年11月15日。実配信の経緯は[配信記録](deployment-20261115.md)、詳細な安全な記録と画像は`local-only/deployment-20261115/`に保持する。この担当は秘密値・本番DB・会員情報にアクセスせず、アプリコードやstateを変更していない。

| 項目 | 独立照合した最終根拠と結果 |
| --- | --- |
| 配信版 | `release.json`のNetlify production deployはready/public、Flyの同意文言追修正版imageは前記ID。`source-match.json`の250件・不一致0・manifestを、実際の`source-manifest.json`のSHAと現在の全対象ファイルから再計算し一致した。`stripe-normal-browser-final.json`も同じmanifestを指す。 |
| 公開API・認証 | `production-smoke.json`と`production-member-checkout.json`で、Netlify経由のJSON、偽造signature/IPヘッダーの上書き、直接Fly偽造リクエスト拒否、会員登録、Secure/HttpOnly/Lax Cookie、再読込・ログアウト/再ログイン・履歴保持、管理API拒否を確認。初期smokeの販売falseは初期状態として保持し、後続member記録のJPY500受付有効と区別した。 |
| 教材・有料境界 | importと再exportの件数/指紋一致は前述のとおり。公開記録では両級10回、回答前の正答非表示、模試3の取得/回答200、模試4の無料会員取得/回答403・匿名回答401、1級0問を確認。PC/SP保存画像で月額・収録級・1級準備中・同意/申込導線も確認した。全教材画面を本番で再検査した意味ではない。 |
| 最終の関連検査 | `verification.json.checkout_policy_followup`の対象は`payments.test.ts`と`subscriptions.test.ts`。明示したローカルtest PostgreSQL 16で41件成功・失敗0・skip0。参照ログの`tests 41 / pass 41 / fail 0 / skipped 0`を直接確認し、対象2ファイルの指紋も現在値と一致した。旧文言の完全一致期待値も3リンクへ更新済み。その他の55回帰・26E2E等は、前述の対象版と影響範囲を確認した結果を継承し、今回全件を再実行したとしない。 |
| LIVE Checkout | `stripe-normal-browser-final.json`で制限付き本番キーによるlive/subscription/open/unpaid、JPY500、指定Price、自動税額加算falseを確認。通常ChromeのCUAで`js.stripe.com`の独立iframe内のカード入力欄、未選択の専用同意、登録ボタン、月額/収録範囲/解約説明を観測した記録である。カード・同意・登録は操作していない。 |
| D7専用リンク | `stripe-policy-links-final.png`をこの担当が目視し、登録ボタン直前の「世界遺産ラボの」規約/privacy/特商法の3リンクと、税込500円の自動更新契約に対する未選択の同意欄を確認した。上記JSONの3つのhrefは本サービスの`/terms`・`/privacy-policy`・`/commercial-disclosure`を指し、各HTTP200。コード`subscriptions.ts:37`と一致する。 |
| 非付与・後片付け | 同じ最終LIVE記録は、未払い時/失効後の有料利用false、Session失効成功、退会204、セッション401、対象の合成会員残存0を記録。初回の「フォーム0」は主文書だけの検出結果であり、独立iframeの実表示結果へ無断で成功を書き換えず、診断記録として保持した。 |

### D7：共有フッターと本サービスの直前同意

追加指摘D7（P2）は、Stripe共通フッターの「特定商取引法に基づく表記」が世界史ラボを指し、配信担当の通常Chrome確認では買切り・自動更新なしの条件を示していた点である。同じ事業者というだけで、この販売条件を世界遺産の月額契約の根拠にはできないと評価した。

限定修正は`subscriptions.ts:37`の専用同意文言である。サービス名と3つの適用文書を一体にし、税込500円/月の自動更新への同意を支払い直前に求める。実際の新規Sessionで表示と参照先が確認できたため、**本サービスの受付レビュー上、D7の必要な専用導線対応は完了**とする。共通フッターの既定URL自体を修正したとは扱わない。最終確認時に参照先を明示して必要事項を容易に認識できるという[消費者庁ガイドラインの考え方（4頁）](https://www.no-trouble.caa.go.jp/pdf/20230421la02_09.pdf)を踏まえた判定であり、全表示について法律適合性の専門家判断を行ったという意味ではない。

共通フッターには引き続き`https://world-history-practice.netlify.app/commercial-disclosure`が残る。Stripe自身の規約/privacyも本サービス文書とは別である。共有アカウント設定や他ラボの契約・表記は変更せず、この残存を最終の既知制約として明示する。

最終変更ファイルのSHA-256：

- `frontend/server/services/subscriptions.ts`：`a593e2231033269fbbc12a092dbf8d72a2fdd713c1057963bc3dbd7019f8037d`
- `frontend/server-tests/payments.test.ts`：`54c29934cdcd7d26d056f82a1aff8fde402de72fe8c2e9a0e48ed00527dcb074`

### 運用上の限界

- 本番の実カード支払い、実課金後の資格付与、翌月更新、更新失敗、実有料契約の解約、契約者のPortal操作は未実施。これらの回帰検査・設定readと、今回の本番無課金確認を区別する。PC/SPはブラウザの表示幅であり、物理スマートフォン試験ではない。
- 返金/紛争の自動失効は未実装。既存設計どおり、本サービスの対象契約をStripeで即時停止し、取消し/期限の同期を確認してから返金等を扱う手動運用を維持する。他ラボの実イベントを本番で送信して検査したものでもない。
- 復元は前述のimport前空DBの可搬正規化版に限る。未変更のNeon原本dumpのクラウド復元、教材/会員/契約がある状態の復元演習を成功済みとしない。
- Netlifyの署名値は、ユーザーの明示承認に基づく管理者閲覧可能な通常envであり、秘密属性付き保存ではない。StripeキーはFlyの秘密領域だけ。静的公開成果物への秘密値一致0・有料問題本文の検査対象一致0という配信記録も保持する。
- パスワード再設定メールと外部障害通知は無効のまま。自動通知が有効、又は実運用の月間稼働/通信量が検証済みとは説明しない。direct DB接続はFly単一VM・Prisma10＋制限2接続の前提である。
- `cleanup.json`は一時認証情報・承認済み教材の転送ファイル、native testクラスタ、依存コピー/キャッシュの削除と、合成Session失効/会員削除を記録している。Docker応答停止のため今回の使い捨てコンテナ1件の削除は未確認と報告している。既存コンテナの削除やDocker全体の操作で解消したとは扱わない。

上記の範囲・制約を明記したうえで、今回依頼された新規本番配信と月額申込受付の独立レビューを完了する。本ファイルのみを更新し、state更新は配信担当へ委ねる。
