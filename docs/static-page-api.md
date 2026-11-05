# 静的ページと共有ナビゲーションのAPI境界

## テンプレートの仕様

共有サイドバーは `config/exam.json` から作る `EXAM_CATALOG` / `FREE_EXAM_CATALOG` を使い、問題APIを取得しない。設定上のナビゲーションは公開済みの問題数や取得権限を証明するものではなく、問題の存在・公開状態・資格は引き続きAPIが検査する。派生サービスの動的カタログや大問分類、課金導線は持ち込まない。

サイドバー自身の資格確認・待機・再試行表示は、トップ `/` と演習 `/practice` 配下だけで行う。それ以外は資格が未確定・確認に失敗した場合でも、設定由来の一覧を即時表示する。未知の静的ページと `/practice-guide` は演習へ分類しない。資格確認が進行中のまま静的ページへ移動しても、遅延応答で資格待機・エラー表示へ戻らない。演習へ再入場した場合は、従来の資格確認と再確認操作を維持する。

`session.global.ts`、Better Auth、ページ固有の認証・購入設定は変更しない。グローバルのセッション照合では静的ページでも `/api/v1/me` 等を呼ぶ。『問題APIを呼ばない』と『すべてのAPIを呼ばない』を区別する。共有認証の通信は取り消さず、利用者状態の更新や保護ページの認可を維持する。

## 検証

2026-11-03、以下を確認した。

- 新規9件を含む関連41件（`sidebarStaticAccess`、`examSidebarLayout`、`apiStatus`、`authGuard`、`authSessionSync`）が成功。失敗・skip 0。実SFC setup・実Favorites composableとVue反応性を使い、通信境界と資格応答だけを合成化した。
- 全静的ルート×5会員状態、直アクセス、未知ページ、未解決/失敗資格、資格待機中の離脱・遅延成功/失敗、演習復帰と再確認を確認。問題APIを使う変更が入った場合は検査が失敗する。
- `frontend` の `npm run typecheck` が成功。重い検査と画面プレビューは順番に実行した。

実Nuxt/共通部品と合成APIの専用プレビューを使い、PC1280×800/SP390×844でポリシー直アクセス・規約への内部遷移・一覧開閉・問題リンクへの移動・静的復帰・横はみ出しなしを確認した。意図的に資格確認を503にしてもサイドバーは静的一覧を表示した。静的区間の問題APIは0件、演習移動後は `/api/v1/questions/next` が2件（合成503への既存の再試行）となり、静的復帰後も2件のまま増えなかった。`/api/v1/me` 8件と `/api/auth/get-session` 1件は維持されたグローバル認証によるものであり、停止済みとは扱わない。実DB・Stripe・外部の配信先は使っていない。

独立担当 `template_static_review` が差分を確認し、新規9テストを別途再実行して9/9成功、関連41件/型検査の記録、元dirty31件の全ハッシュ不変、PC/SP2画像、合成APIの通信記録を照合してPASS。プレビューは停止し、画面サイズの上書きを解除した。

実画面/通信の一時控え：`/tmp/template-static-pc-20261103.png`、`/tmp/template-static-sp-20261103.png`、`/tmp/template-static-preview-requests-20261103.jsonl`。消去され得る控えであり、継続検査はリポジトリ内の回帰テストを正本とする。型検査・関連41件・独立レビュー・合成画面の確認であり、通常DB/実決済/本番配信/全体ビルドの確認へ広げない。

## 変更ファイルと運用範囲

- [frontend/app/components/ExamSidebar.vue](../frontend/app/components/ExamSidebar.vue)：資格確認/待機/エラー表示をトップ・演習に限定。
- [frontend/tests/sidebarStaticAccess.test.ts](../frontend/tests/sidebarStaticAccess.test.ts)：静的ページと資格・遷移の回帰検査。
- [AGENTS.md](../AGENTS.md)：静的ページの問題API非依存と、認証APIを維持する一般ルール。
- [docs/testing.md](testing.md)：検査の対象・実行方法・認証との区別。
- [docs/static-page-api.md](static-page-api.md)：本仕様と検証の記録。

テンプレート同梱の `docs/workflow/state.json` は世代0・空のタスク一覧を維持する。今回の依頼・受入条件・評価履歴は、Git/Docker除外の `local-only/static-page-api-20261103/task.json` に保存し、共通の `workflow-policy.mjs` で評価する。派生サービスへ今回の作業履歴や承認を引き継がせない。

既存の認証・パスワード関連の未コミット31ファイルは保全する。DB・サーバーAPI・料金・既存の画面文言/レイアウトは変更しない。ローカル実装時点ではコミット・push・配信を行っていなかった。2026-11-03の後続指示で今回の5ファイルだけのコミット・pushが承認された。既存の別作業は除外し、`[skip netlify]` 付きで送信する。本番配信は行わない。
