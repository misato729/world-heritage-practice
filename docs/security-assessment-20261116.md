# 世界遺産ラボ 脆弱性診断（2026年11月16日）

## 結果

**修正を推奨する中程度（P2）の実装上の問題を3件確認した。** 既存の関連検査205件は成功したが、今回追加した検証で、既存検査が扱っていない経路の問題を確認した。依存関係の更新と公開ページの保護ヘッダーにも改善が必要である。

| ID | 優先度 | 問題 | 確認した範囲 |
| --- | --- | --- | --- |
| V1 | 中 / P2 | 退会時のパスワード照合に試行回数制限がない | 隔離した実APIで誤パスワード35回がすべて処理された |
| V2 | 中 / P2 | Webhook本文を容量制限なしで読み終えてから署名を検証する | ローカルで署名なし4MiB本文を読み込んだ後に400。サービス停止は試していない |
| V3 | 中 / P2 | URLエンコードでNetlify署名検証の対象判定を迂回できる | 実Nitroルートと公開Flyで確認。会員認証・管理者権限は引き続き必要 |

今回の範囲で、他人の履歴取得、管理者昇格、有料資格の迂回、任意コード実行は確認していない。依存監査の「high」はライブラリ自体の評価であり、本サービスの公開経路で高危険度の侵害を再現したという意味ではない。

診断のみを実施した。アプリの修正、依存更新、commit、push、本番設定・本番DBの変更は行っていない。

## 対象と方法

- 対象版: HEAD `fb0f894d92468adc9c3f846e4cd2eca60e7c3dcc` と開始時の作業ツリー。既存の1級表示・教材対応などの未コミット変更を含む。関連176ファイルのSHA-256を開始時に記録し、診断中の変更がないことを照合した。
- 実装: Nuxt/Nitro、Better Auth、業務API、認証・権限、課金/Webhook、パスワード再設定、表示ブロック、SQL呼出し、通知、配信設定を確認した。
- 依存関係: 実際のlockfileに対する `npm audit --json --ignore-scripts` と公式アドバイザリ。package.jsonの指定範囲とlockfileの固定版は区別した。
- 自動検証: Node.js **24.15.0**、PostgreSQL **16.14**。今回新設したloopback専用の使い捨てtest DBと合成データを使用した。既存の開発DB・本番DBは使用していない。
- 公開環境: 本サービスのNetlify/Flyに対する少数の匿名GETだけで、状態コードと許可したヘッダーを確認した。レスポンス本文・Cookie・利用者情報は収集していない。誤パスワード反復・大きな本文の送信はローカルのみ。
- 独立確認: `security_boundary_review` 担当が認証・権限境界を別に確認し、指摘と最終報告を反証レビューした。担当別の確認と親担当の実API検証を区別して記録した。

詳細な再現スクリプト、検査結果、指紋、独立レビューは保護された `local-only/security-assessment-20261116/` に保存した。

## V1: 退会時の再認証に回数制限がない

**根拠:** `frontend/server/services/accounts.ts:19-27`、`frontend/server/api/v1/me.delete.ts:4`、`frontend/server/core/rate-limit.ts:11-18`。

`DELETE /api/v1/me` は本人のセッションを確認した後、Better Authの `auth.api.verifyPassword` を直接呼ぶ。Better AuthのHTTP routerで実行される回数制限は、この内部API呼出しには適用されない。退会処理側にも共通の `throttle` 呼出しがない。

有効な会員セッションを持つ利用者は、誤パスワードによる高コストの照合を繰り返せる。盗用されたセッションがある場合には、退会前の追加認証に対する回数制限のないパスワード推測も可能になる。セッションなしで他人のパスワードを試せる、又は無条件にアカウントを奪えるという指摘ではない。

**再現:** 合成会員の有効Cookieと許可Originを使用し、必ず誤ったパスワードで35回実行。35回とも422 `validation_error`、約3.34秒、回数制限テーブルの行数は32→32、会員のセッションは200のままだった。対照として通常のパスワード変更を11回行うと、10回の400に続いて11回目は429だった。利用者・課金情報は変更せず、合成会員は検証後に削除した。

**修正方向:** パスワード照合前に、会員単位と信頼済みIP単位の制限を既存のPostgreSQLストアで適用する。上限到達時とストア障害時に照合処理へ進まないことを確認する。独自カウンターや生IPの記録は追加しない。

## V2: Webhook本文の無制限読込

**根拠:** `frontend/server/services/payments.ts:29-39`、`frontend/server/core/netlify-proxy.ts:9-14`、`fly.toml:37-40`。

Webhookは `readRawBody(event, false)` の後に `stripe-signature` を検査する。使用中のh3 1.15.11は、本文の全chunkを保持して `Buffer.concat` し、この呼出しには容量上限がない。署名のないリクエストも同じ処理を通る。Stripe用経路は直接Flyアクセスを許可しているため、Netlify側の制限だけではこの入口を保護できない。

未認証の送信者が大きな本文を送ることで、署名が不正でもメモリを消費させられる。リポジトリのFly設定は512MB・共有1CPUであり、可用性対策として優先する。ただし、実稼働マシンの設定取得、OOMや本番停止の試験は行っていない。

**再現:** ローカルの実APIに、署名ヘッダーなしで4,194,304バイトを送信。本文を読んだ後に400 `invalid_webhook`となり、413による容量拒否はなかった。これは読込経路の確認であり、4MiBの1件で障害が起きるという主張ではない。

**修正方向:** 署名ヘッダーの欠落・明らかな不正形式を早期拒否し、署名検証に必要なraw bytesを保ったまま、受信中に実バイト数の上限を適用する。Content-Lengthだけを信用せずchunked送信にも対応する。正規のStripe再送を妨げない容量・タイムアウトを選び、一般のJSON入口にも適切な上限を設ける。

## V3: URLエンコードによる署名プロキシ境界の迂回

**根拠:** `frontend/server/core/netlify-proxy.ts:9-15,34-37,56-60`。

保護対象の判定は `getRequestURL(event).pathname` の未デコード表記に対して `/api` を照合する一方、h3のルーティングはデコード後のパスを利用する。例えば `/%61pi/v1/me` は署名検査の対象から外れ、業務APIの `/api/v1/me` に到達する。

**実ルートの再現:** Node24のローカルHTTP、実Nitro scannerとh3 router、署名なし・Cookieなしで次を確認した。DB接続は不要だった。

| 経路 | 通常の `/api` | `/a` の `a` を `%61` とした表記 |
| --- | --- | --- |
| `/api/v1/me` | 403（プロキシ拒否） | 401（業務APIの認証へ到達） |
| `/api/v1/payments/config` | 403 | 200（公開設定を返す） |
| `/api/v1/admin/questions` | 403 | 401（管理APIの認証へ到達） |

公開Flyでも、通常の `/api/v1/me` は403、エンコードした `/me` と `/admin/questions` は401となることを匿名GETで確認した。意図された「healthとStripe Webhook以外はNetlify署名が必要」という入口制限を回避できる。

**影響の限定:** 会員認証、管理者権限、課金資格の判定は残る。管理者データや個人情報は取得していない。Fly側でのIPヘッダー上書きや、回数制限のIP偽装まで回避できるかは確認していない。

**修正方向:** middlewareとrouterで同じ正規化済みパスを使うか、非canonicalなAPI相当パスを安全側に拒否する。GET/HEADのhealthとPOSTのStripeだけを公開例外とする条件を維持し、エンコード・二重エンコード・区切り文字のケースを検査する。

## 依存関係: 更新が必要だが、警告数と侵害件数を分ける

監査サービスの集計は**16パッケージ（high 1 / moderate 13 / low 2 / critical 0）**。依存元への伝播を除いてURLで重複排除したアドバイザリは30件（high 8 / moderate 15 / low 7）だった。いずれも上流評価・version判定の未補正値であり、30件すべてが本サービスで悪用できるという意味ではない。

| 対象 | 固定版 | 評価と対応 |
| --- | --- | --- |
| Nuxt / `@nuxt/*` | 4.6.2 | 開発サーバーのファイル露出、ページ経路判定などの警告。4.6.4は公式のセキュリティ修正版。API handler自体はページ経路の既知問題の対象外であり、V3とは別件。Composeのホスト公開は127.0.0.1に限定され、本番UIは静的配信のため、開発用脆弱性を本番の秘密漏えいとして扱わない。 |
| node-forge | 1.4.0 + 既存RSAパッチ | 21アドバイザリ。既存のcanonical DERパッチが適用済みで、RSAの代表的な不正DigestInfoを拒否する検査も成功。GHSA-86w9-cpqp-85rvとGHSA-6qrw-m8cv-hcxfの検査対象を未修正と数えない。一方、他のPEM/ASN.1/TLS/Ed25519等の変更はこのRSAパッチに含まれない。修正済みリリースへ更新し、パッチ固定版ガードを正規の手順で見直す。 |
| glob / minimatch / deepmerge と依存元 | 13.0.6 / 10.2.6 / 4.3.1 など | ファイル走査、資源消費、prototype関連の警告。主にビルド・開発ツール経路で、外部API入力からの到達は今回確認できなかった。`@sentry/node`も依存元として集計されるため、通知SDK自体への直接攻撃と読み替えない。 |

node-forgeはlisthenの証明書処理から利用されている。業務APIから攻撃者入力をnode-forgeの署名検証等へ渡す経路は確認していない。既存パッチは版とハッシュを固定しており、単純な `npm audit fix` により起動・ビルドのガードが失敗する可能性がある。依存更新は専用の変更として、ガード・テスト・lockfileをそろえて行う。

公式根拠: [Nuxt 4.6.4](https://github.com/nuxt/nuxt/releases/tag/v4.6.4)、[Nuxtの開発バンドル露出](https://github.com/nuxt/nuxt/security/advisories/GHSA-648h-gw55-m2g7)、[ページパス判定とAPI非該当条件](https://github.com/nuxt/nuxt/security/advisories/GHSA-r99w-jh2x-3mg9)、[Forge RSAの修正](https://github.com/digitalbazaar/forge/security/advisories/GHSA-6qrw-m8cv-hcxf)、[Forge Ed25519の修正版1.4.3](https://github.com/digitalbazaar/forge/security/advisories/GHSA-6889-vf6x-f3g5)。

## 追加の強化点

- **公開HTMLの保護ヘッダー:** `/`、`/login/`、`/account/`、`/reset-password/` の200応答でCSP、X-Frame-Options、X-Content-Type-Optionsがない。HSTSはあり、reset-passwordのno-store/no-referrerとAPIのno-store/nosniffは有効。XSSやセッション付きクリックジャッキングは再現していないため、確定した権限侵害とは別の防御強化として扱う。不要なiframe埋込みを拒否し、Nuxtのinline script/styleに適合したCSPを段階的に導入する。
- **Portal作成:** `frontend/server/api/v1/payments/portal.post.ts:3` にアプリの回数制限がない。本人のcustomer IDだけを使うことは確認したが、同一契約者の連打によるStripe API消費を抑える制限を追加できる。実枠枯渇や第三者契約へのアクセスは未確認。
- **課金運用:** 月額契約の返金・紛争による失効は既存の配信記録どおり手動運用。自動対応済みとして扱わない。今回は実カード課金、返金、解約、Stripeアカウント設定を操作していない。
- **秘密情報:** 追跡中のテキスト541ファイルに選定した秘密値パターンを検査し、候補1件はremote接続を拒否するテストの合成URLと確認した。確認済みの実秘密値露出は0件。これは全種類の秘密値を保証する検査ではない。Stripe等の鍵は引き続きサービス専用・最小権限の秘密ストアに置き、ソース・ログへ出さない。Git履歴の検査はローカル専用資料のパス保護であり、履歴全blobの秘密値スキャンは未実施。

## 検証結果と証拠

| 検証 | 結果 | ローカル専用の根拠ファイル |
| --- | --- | --- |
| API・認証・課金・通知等12ファイル | 113成功 / 失敗0 / skip0 | `security-regressions.log` |
| 認証UIロジック・resetメール/GAS・依存パッチ・入力/表示等12ファイル | 92成功 / 失敗0 / skip0 | `frontend-security-tests.log` |
| V1/V2の安全な再現 | 上記の問題を確認、合成会員削除済み | `focused-probes.mjs`, `focused-probes.json` |
| V3の実Nitroルート再現 | 通常403、エンコード後401/200 | `proxy-canonicalization.mjs`, `proxy-canonicalization.json` |
| 公開環境の匿名GET | 匿名業務API401、通常の直接Fly403、V3とヘッダー不足を確認 | `public-observations.json`, `public-pageheaders.json`, `public-proxy-paths.json` |
| npm監査 | 警告あり。取得処理は完了 | `npm-audit.json`, `dependency-summary.json` |
| `security:check` / 資料保護 | 適用済みパッチハッシュ一致 / Git追跡・履歴の保護検査成功 | `verification-summary.json` |
| 独立レビュー | 指摘の条件・影響・反証・報告を確認 | `boundary-review.md` |
| 検証環境の後片付け | 専用PostgreSQL停止・使い捨てクラスタ削除済み | `cleanup.json` |

上表のファイルはすべて `local-only/security-assessment-20261116/` 配下。ソース指紋は `source-fingerprints.json`。初回のsandbox内ネットワーク/ソケット制約とPythonの公開GET接続失敗は、監査検出やアプリ不具合と区別し、利用可能な許可済み経路で検査を完了した。

本番の負荷試験、認証付き攻撃、本番DBやクラウドアカウント権限、全Git履歴blob、稼働コンテナのOSパッケージ、全ブラウザでの攻撃成立性は未確認。今回の作業は診断完了であり、V1〜V3の修正完了・再診断合格を意味しない。
