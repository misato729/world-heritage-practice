# 日次スモークテスト

`.github/workflows/daily-smoke.yml` は毎日9:17（日本時間、UTC 00:17）に、本番の `https://world-heritage.misato-lab.com` へ匿名のGETリクエストを送る。Actions画面の **Daily production smoke test → Run workflow** から手動でも実行できる。

## 確認対象

- トップとログインページ（正規URL `/login/`）：HTTP 200、HTML形式、サイト名、Nuxtのマウント要素。
- `/api/v1/health`：公開ドメインからNetlifyのプロキシを経由し、HTTP 200と本サービスの正常応答。
- `/api/v1/me`：未ログインではHTTP 401と `unauthorized` を返すこと。

各リクエストの期限は30秒、失敗時は3秒間隔で最大3回試す。失敗した項目があっても残りの項目を確認し、最終的に1件でも失敗すればジョブを失敗させる。リダイレクトは失敗とし、SPAのHTMLがAPIへ誤配信される場合も検知する。追加依存パッケージ・GitHub Secrets・会員情報は不要。

結果はActionsのログとジョブのサマリーで確認する。レスポンス本文・ヘッダー・例外詳細は保存せず、固定の確認項目名・成否・試行回数・安全な失敗理由だけを出す。失敗通知はGitHubのActions通知設定に従う。

これはHTTPでの到達性と応答形式の監視であり、ブラウザでの描画、JavaScriptの実行、ログイン後の演習、DBの読み書き、決済・メール配送の成功は保証しない。会員・解答履歴・契約の作成や変更は行わない。PC・スマートフォンの操作回帰は既存CIの隔離DBを使うPlaywright E2Eが担当する。既存CIや配信処理とは独立して実行する。

定期実行はこのワークフローがデフォルトブランチに反映されてから有効になる。GitHub側の混雑で遅延や実行の欠落が起き得るため、厳密な実行時刻・毎日の実行は保証されない（[GitHub公式仕様](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)）。

ローカルで同じ確認を行う場合：`node scripts/production-smoke.mjs`。

## 作成時の確認（2026-11-27）

- `node --test scripts/production-smoke.test.mjs`：7件成功。正常応答、起動待ちからの回復、HTMLのAPI誤配信、別サービスの応答、JSON不正、通信失敗、匿名アクセスの予期しない成功を確認。
- 最終版スクリプトを本番へ実行：4項目すべて初回で成功。ログインページの正規URLへの301転送を事前に確認し、確認先を `/login/` に合わせた。
- ワークフローYAMLの構文、cron・手動トリガー、差分、ローカル専用資料のGit追跡・履歴検査：成功。
- GitHub上での実行・定期実行は未確認。コミット・pushは行っていない。
