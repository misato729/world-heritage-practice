# 世界遺産ラボの独自ドメイン設定（2026-11-18）

ユーザーの依頼に基づき、公開URLを **https://world-heritage.misato-lab.com/** に設定した。旧 https://world-heritage-practice.netlify.app/ も保持し、ルートドメイン・www・メール用DNS・教材・会員・既存契約は変更していない。

## 設定

- ムームードメイン：`world-heritage` のCNAMEを `world-heritage-practice.netlify.app` へ追加。保存成功と権威DNS、Cloudflare/Google公開DNSを確認した。
- 既存Netlifyサイトの正規カスタムドメインへ追加し、自動管理のHTTPS証明書が `issued` になったことを確認した。既存の署名付きAPI転送と公開成果物は維持した。
- Flyの同じNRTマシン・同じイメージを維持。`FRONTEND_URL` / `BETTER_AUTH_URL` を新originに変更し、`CORS_ORIGINS` は新旧2つの完全一致HTTPS originとした。課金・再設定メール・障害通知の有効化状態を保持した。`fly.toml` も同じ公開URLへ更新した。
- 専用GASの `FRONTEND_URL` だけを新originへ変更した。公開originだけを検査・変更・復元できる補助ファイル `PublicOrigin20261118.gs` を専用projectのエディタへ追加し、旧値ガード付きの変更関数を実行した。鍵・他プロパティ・既存Webアプリのデプロイは変更していない。
- 世界遺産ラボ専用Stripe商品URL、Portalの戻り先・規約・プライバシーURLを新ドメインへ変更した。価格ID、料金、Portal機能・期間末解約条件は保持した。既存のFly直接Webhookは変更していない。

## 確認

- 新ホストのTLSと署名必須の `/api/auth/get-session`、`/api/v1/payments/config` が200/JSON。通常DNSを使う独立NRT環境でも新URLと両APIの200を確認した。Chromeの通常表示でも新URLが開いた。
- Fly実行プロセスの認証・メール・決済のoriginが全て新URLで一致し、health 200、NRT、各有効化フラグがtrueであることを確認した。
- 全級×PC/スマートフォンの6ケースで、会員案内・支援ページ・ログイン・再設定入口の新URL内遷移、無料範囲3/2/1と500円、横溢れなし、静的ページから問題APIを呼ばないことを確認した。存在しない合成メールによるログインは認証段階の401となり、新originが許可されていることを確認した。実会員は作成していない。
- 稼働コードのCheckout/Portal URL生成は、DB接続を不通の合成URLへ置換し、Stripe操作を全てスタブ化したプロセスで検査した。完了・取消・契約管理・規約リンクが新originで一致した。実Checkout・顧客・契約は作成・変更していない。
- 切替後も旧ホストのトップと匿名セッションAPIは200。旧originも認証段階へ到達し、存在しない合成メールで401。未知のoriginは403 `forbidden` で拒否した。
- 再設定メール/GAS/申込説明の既存単体検査9件成功。今回、実メール送信・実着信・実決済・実会員のパスワード変更は行っていない。メール配送自体の既存確認は[導入記録](mail-notifications-20261115.md)を継承し、今回の新URLによる実着信検証とは区別する。
- 一部ローカルOSのDNS負キャッシュが残ったため、ヘッドレス表示検査は公開DNSで確認した正規IPをChromeの名前解決へ指定した。TLS検証は有効のまま。通常Chromeと独立NRT環境の通常DNSによる成功とは区別した。

ドメイン変更後のログイン状態と級の記憶はホスト別のため、新URLでは再ログインが必要になる。旧リンク・旧URLは維持する。メールのorigin切替はGASを先行し、直後にFlyを切り替えたため、両方が一致するまでの短い区間の配送を無停止と保証しない。切替後の設定整合は検証済み。失敗時は実行状態を照合後、GASの復元関数とFlyの旧公開URL設定で戻せる。

詳細な安全な状態情報・検査ログ・公開画面は `local-only/domain-migration-20261118/` に保存。同日の追加依頼に基づくコミット・pushの対象は、本書と`fly.toml`のみとする。既存の並行差分は含めず、送信結果は同ローカル専用フォルダーに保存する。
