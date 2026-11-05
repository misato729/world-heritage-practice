# パスワード変更とGASによる再設定メール

アカウント設定から現在のパスワードを確認して変更できます。ログイン画面の「パスワードを忘れた場合」から、登録メール宛に30分間・1回限りのリンクを依頼できます。未登録メールでは送信せず、同じ受付表示にします。メール機能は初期状態で無効です。

## 既存認証の利用

このテンプレートではBetter Authの標準`changePassword`・`requestPasswordReset`・`resetPassword`、scrypt、PrismaのDBセッションと検証用テーブルを使います。独自のハッシュ・署名セッション・認証版・再設定テーブルは追加しません。既存のPrismaマイグレーションを適用済みなら、この機能のための追加DB変更は不要です。検証用identifierは標準`verification.storeIdentifier: 'hashed'`で保存します。

新パスワードは既存設定と同じ8〜128文字です。確認欄を共有ZodスキーマとUFormで検査し、サーバーでも再検査します。bcrypt用の72バイト制限は追加しません。変更APIは呼出元の指定によらず他セッションを失効し、新しいCookieを現在のブラウザへ返します。再設定時は全DBセッションを失効し、再ログインを求めます。

再設定トークンの発行・期限判定・トランザクション内の単回消費はBetter Authが行います。標準動作では再申請で既発行リンクを一括無効化せず、通常のパスワード変更も既発行の再設定リンクを消費しません。別のリンクで再設定に成功した後も、他の未使用リンクは各30分の期限まで有効です。「最新の1通だけが有効」という独自の認証版方式はこのテンプレートには含めません。リンクはパスワードと同様に扱い、共有・記録しないでください。

[Better Auth公式のパスワード認証](https://better-auth.com/docs/authentication/email-password)も参照してください。導入中の固定バージョンと実APIで動作を検証し、ライブラリ更新時にも回帰確認します。

## 送信設定

導入先ごとに独立したGASプロジェクト・共有秘密鍵・URLを用意します。既存サービスの秘密値や配信先はコピーしません。同じGoogleアカウントを送信元に使う場合も、アプリごとに設定を分けます。独自ドメインの取得は不要です。

1. Google Apps Scriptで新しいスタンドアロンプロジェクトを作り、`frontend/automation/password-reset/Code.gs`をコードへ貼り付けます。
2. プロジェクトの設定で「appsscript.json マニフェスト ファイルをエディタで表示する」を有効にし、エディタ左の`appsscript.json`を開いて同ディレクトリの内容へ置き換えます。JSONはCode.gsへ貼りません。権限は`script.send_mail`だけです。
3. スクリプトプロパティに次を設定します。秘密鍵はソース・Git・チャットへ貼らず、手元の秘密管理で作成/保管してください。

| プロパティ | 内容 |
| --- | --- |
| `PASSWORD_RESET_GAS_SECRET` | 導入先専用のランダムな64桁の小文字16進数 |
| `FRONTEND_URL` | 導入先の正確なHTTPS origin。末尾スラッシュ・パス・queryなし |
| `SITE_NAME` | メールに表示するサービス名。省略時は「演習サービス」 |

共有鍵は、手元の端末で`openssl rand -hex 32`を実行して生成できます。出力はGASとAPIの設定先だけに保存します。

4. エディタで`authorizeMail`を選んで実行し、送信元Googleアカウントでメール送信を許可します。この関数はメールを送らず設定と送信残数を確認します。
5. 「デプロイ」→「新しいデプロイ」→「ウェブアプリ」。実行ユーザーは自分、アクセスできるユーザーは全員（Googleログイン不要）にします。Workspaceの管理制限で利用できない場合は、その管理方針に従ってください。
6. `/exec`で終わる公開URLを控え、APIサーバー側へ次を設定します。`/dev`は使用しません。コード変更後はデプロイ管理から新バージョンを公開します。

| APIサーバー環境変数 | 内容 |
| --- | --- |
| `PASSWORD_RESET_ENABLED` | 有効化するときだけ`true` |
| `PASSWORD_RESET_GAS_URL` | 自分のGASウェブアプリの`https://script.google.com/macros/s/…/exec` |
| `PASSWORD_RESET_GAS_SECRET` | GAS側と同じ秘密鍵 |
| `FRONTEND_URL` | GAS側と同じHTTPS origin |
| `BETTER_AUTH_URL` | ブラウザから使う同じ公開origin |

秘密値に`NUXT_PUBLIC_`を付けません。静的画面を別ホストへ配信する場合は、既存APIと同様に`/api/auth/*`も同一originからAPIへ転送してください。許可originは完全一致で設定し、ワイルドカードにしません。GASの`/exec`をブラウザで開いたときの`{"ok":false}`は正常なGET応答で、配送テストではありません。

## 有効化後の確認

自分が管理する登録済みのテストメールで申請し、受信した`/reset-password#token=…`から自分で新しいパスワードを保存します。新しいパスワードでログインできること、同じリンクの再利用が拒否されること、旧セッションが使えないことを確認してください。パスワードやリンクをログ・スクリーンショット・問い合わせ文へ残さないでください。

## 保護と運用上の制限

- サーバーが送信先を登録情報から選びます。クライアントによる宛先・本文・転送URLの指定は受け付けません。HMAC-SHA256署名、発行時刻、request ID、固定originをGAS側で検査します。GASのメール本文とリンク先のパスは固定です。
- リンクはfragmentからだけ読み、マウント後にURLから除去して部品内にだけ保持します。再読み込みではリンクの再提示が必要です。queryやパスにtokenを置くBetter AuthのGETコールバックは公開しません。再設定ページはnoindex・no-referrer・no-storeです。
- 認証APIのIP制限はBetter Auth標準customRules、メール単位と配送枠は既存の公式PostgreSQLストアを使います。申請IP30回/15分、メール3回/時間、保存30回/15分、通常変更10回/15分、配送20回/UTC日です。生のIPやメールは制限キーに保存しません。
- GASも20試行/UTC日とGoogleの送信残数で制限します。Google側の割当は契約等で異なり、`MailApp.getRemainingDailyQuota()`で確認します。共有鍵の誤り・権限・送信枠・Google障害の場合は配送できません。
- 受付成功は配送完了の意味ではありません。配送はBetter Authの公式backgroundTasksからNitroのwaitUntilへ実Promiseを登録します。15秒上限・再試行なしのベストエフォートで、永続キューではありません。単独のH3として実行してwaitUntilがない場合は送信完了を待ちます。受信できないときは迷惑メール・両側の設定/鍵・公開版・枠を確認して再申請してください。GASの重複受付は再送せず、失敗/不明の送信も自動再送しません。API/GASは宛先・リンク・署名・秘密値をログへ出しません。
- ローカル検査は合成会員・使い捨てDB・模擬GASを使います。E2Eの環境は実送信設定を継承せず、再設定画面の受付/保存応答には模擬通信を使います。通常変更は実APIで操作します。実メールの確認は導入先の所有者が行います。

Google公式：[ウェブアプリ](https://developers.google.com/apps-script/guides/web)、[マニフェスト](https://developers.google.com/apps-script/concepts/manifests)、[MailApp](https://developers.google.com/apps-script/reference/mail/mail-app)、[ContentService](https://developers.google.com/apps-script/guides/content)。
