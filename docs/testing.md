# 共有スキーマとブラウザテスト

## 検証ルールの正本

試験設定・問題・表示ブロックの基本形式は、`frontend/shared/`のZodスキーマで定義します。画面・API・問題取込・設定検査CLIは同じ定義を使用します。管理フォームの入力正規化、アーカイブの厳密な属性検査、公開セットの全問整合、DBの外部キーなど、入口や保存処理に固有の条件は引き続き検査します。

`config/exam.schema.json`はZodから生成する編集支援用のJSON Schemaです。直接編集しません。分類間の参照や選択肢と設定の対応など、JSON Schemaだけで表現できない条件もあるため、設定・問題を変更したらCLIで確認します。

依存ライブラリを導入したうえで、リポジトリのルートから実行します。

```bash
npm --prefix frontend ci
npm --prefix frontend run schema:check
node --experimental-strip-types scripts/check-template.mjs
```

設定値や問題の内容を差し替えるだけならJSON Schemaの再生成は不要です。Zodの検証ルール自体を変更した場合は生成物も更新します。

```bash
npm --prefix frontend run schema:generate
npm --prefix frontend run schema:check
```

DBモデルを変更した場合は`npm --prefix frontend run db:generate`でPrisma Clientを更新し、`npm --prefix frontend run db:validate`でスキーマを確認します。Prismaの生成物はGitへ保存しません。ブラウザテストの実行スクリプトもビルド前にPrisma Clientを生成します。

生成物と正本のずれはCIでも検知します。単体・APIテスト、型検査、本番ビルドの手順は[README](../README.md#検証と構成)を参照してください。

## ルーティング・フォームの回帰検証

APIテストはNitroの公式ファイルスキャナーとH3ルーターで実際のメソッド別ルートを登録します。URLの優先順位、HEAD、OPTIONS、未知URL・未対応メソッドのJSONエラー、Origin/JSON検査、管理権限を検証します。

フォームは共有Zodスキーマの境界値と、APIエラーの項目への対応を単体テストで確認します。PlaywrightではPC・スマートフォンで不正入力時の送信抑止、修正後の送信、退会時のパスワードエラー、通信障害と管理問題の項目別エラーを確認します。管理フォームの表示検証では合成のAPI応答を使い、実際の管理者権限の検査はPostgreSQL/APIテストで行います。

お気に入り一覧は、同じ会員のセッション更新でも再取得します。`authSessionSync.test.ts`では実際のページsetupとVueの監視処理を実行し、古い成功/エラー応答が最新の一覧を上書きしないこと、ログアウト・別会員への切替、重複通知を確認します。再ログイン後の一覧表示はPC・スマートフォンのE2Eでも検査します。

## 静的ページの共有サイドバー

`frontend/tests/sidebarStaticAccess.test.ts` は実際の `ExamSidebar.vue` のsetupと `useFavorites` をVueの反応性で実行します。静的ページをページファイルから列挙し、匿名・無料・購入済み・管理者・検証資格の状態、新規静的ページ、資格待機中の離脱と遅延応答、演習への復帰・再確認を検査します。共有サイドバーが問題APIを使わず、静的ページに資格待機/エラーを表示しないことを保証します。

`frontend` で `node --experimental-strip-types --test --test-concurrency=1 tests/sidebarStaticAccess.test.ts` を実行できます。グローバル認証や各ページ自身の認証・購入APIの停止を検査するものではありません。[仕様と確認範囲](static-page-api.md)も参照してください。

## Playwrightの準備

READMEに記載した対応Node.js、PostgreSQL 16、Chromiumを使用します。E2E用のPostgreSQLはローカルの検証専用環境を用意し、接続ユーザーに一時DBを作成・削除する権限を付与します。起点となるDB名は`_test`で終わる名前にします。既存サービスや本番DBのURLは指定しません。

リポジトリ直下にGit管理対象外の`.env.e2e`を作成し、検証用の接続先を設定します。次は専用のローカルDocker環境を使う例です。`REPLACE_WITH_TEST_PASSWORD`の2箇所を、検証専用の同じパスワードへ置き換えます。URLへ記載するため、英数字だけの十分長いランダムな値を使用します。

```dotenv
POSTGRES_USER=exam_e2e
POSTGRES_DB=exam_e2e_test
POSTGRES_PASSWORD=REPLACE_WITH_TEST_PASSWORD
E2E_DATABASE_URL=postgresql://exam_e2e:REPLACE_WITH_TEST_PASSWORD@127.0.0.1:55439/exam_e2e_test
```

リポジトリのルートから専用PostgreSQLを起動します。既存のテンプレート用Composeとは別のコンテナです。`pg_isready`が接続可能と返してからテストを実行します。

```bash
docker run --detach --name exam-template-e2e-db \
  --env-file .env.e2e --publish 127.0.0.1:55439:5432 postgres:16-alpine
docker exec exam-template-e2e-db pg_isready -U exam_e2e -d exam_e2e_test
```

すでに検証専用のPostgreSQLがある場合は、そこに作成した`_test`で終わるDBのURLを`E2E_DATABASE_URL`へ指定すれば、このコンテナは不要です。

`frontend`で初回のブラウザをインストールし、テストを実行します。Linuxでは`npx playwright install --with-deps chromium`で必要なOSライブラリも導入します。

```bash
cd frontend
npx playwright install chromium
node --env-file=../.env.e2e --run test:e2e
```

すでに`E2E_DATABASE_URL`を環境変数で設定している場合は、`npm run test:e2e`でも実行できます。テストコマンドは先に本番ビルドを作成するため、古いビルドを対象にしません。

上の例で作った専用コンテナを使い終えたら、次で検証用データごと削除できます。

```bash
docker rm --force --volumes exam-template-e2e-db
```

## 分離と確認範囲

テストはPCとスマートフォンの表示幅で、会員登録・ログイン・問題演習・履歴・お気に入り・ログアウトなどをブラウザから操作します。テスト用の合成会員を使用し、Stripeや外部通知を使いません。

操作シナリオは`frontend/test-support/question-fixture.ts`で設定に合わせた合成データを生成し、専用DBに明示して投入します。公開用`content/questions.json`は参照せず、問題0件の構成でも検証できます。無料会員の解答履歴・再ログイン・別タブのログアウトを検査し、全問無料の構成ではお気に入りの保存・再ログインも検査します。静的導線は匿名・無料・有料の合成応答で、問1〜60、ロック、資格変更、問題API非取得、PC/SPを確認します。Stripeの実決済は行いません。既存の課金APIの回帰テストは引き続き実行します。

起点の接続先を確認した後、実行ごとにランダムな名前の新しいDBを作成し、マイグレーションと同梱問題の取込を実行します。既存の問題・会員データは読み込みません。テスト用の認証秘密値も毎回生成します。ビルドも`frontend/.e2e-build/`内の実行ごとの専用ディレクトリを使用し、通常の開発用・配信用の出力を上書きしません。サーバーはループバックアドレスの専用ポート（標準3318）で起動し、通常の`3100`のアプリを再利用しません。必要な場合は`E2E_PORT`で空いているポートへ変更できます。

通常終了、テスト失敗、終了シグナルの処理でテスト用サーバーを停止し、一時DBと専用のビルド出力を削除します。マシンの強制終了などで後処理できなかった場合は、検証環境に残った`exam_e2e_…_test`と`.e2e-build/`内の該当する出力だけを確認して削除してください。

Playwrightのレポートや失敗時の画像などは`frontend/playwright-report/`・`frontend/test-results/`に保存され、Git管理しません。GitHub Actionsでは独立したPostgreSQLを使用し、失敗時の診断ファイルは7日間保存します。

## ハーネスの軽量回帰検査

進捗・完了条件・資料保護だけの変更は、リポジトリのルートで次を実行できます。Node.js標準機能と合成の一時Git環境を使い、アプリの依存関係、DB、Docker、ブラウザを必要としません。

```bash
node --test --test-concurrency=1 scripts/context.test.mjs scripts/workflow-policy.test.mjs scripts/workspace-policy.test.mjs scripts/check-private-sources.test.mjs
node scripts/context.mjs check
node scripts/check-private-sources.mjs
```

検査は原資料を読み込まず、設定・パス・状態・履歴のメタデータを扱います。初期状態の`check --strict`は基準記録がないため終了コード2で、実施済みのアプリ検証を示しません。アプリやDBも変更した場合は、該当する既存の検査を別途実行してください。

GitHub Actionsの`harness`ジョブで先に資料保護とこの回帰検査を行い、成功後に既存のアプリ・ブラウザ検査へ進みます。

## Netlifyの静的生成

CIの`netlify-static`ジョブは既存の検査完了後、Ubuntu 24.04の新しいチェックアウトで実行します。Node版・base・command・publish・環境変数は`netlify.toml`（production上書きを含む）を読み、`NETLIFY=true`・`CI=true`で`npm ci`と生成コマンドを実行します。CI側に`NITRO_PRESET=static`を重複定義しないため、配信設定からpresetを除いて出力先が変わる回帰も検知できます。

設定された公開先に非空の`index.html`・`200.html`・JS/CSSがあること、ソースにある`_headers`・`_redirects`が保持されることを検査します。古い公開先が存在する場合は削除せず検査を中止します。通常のサーバービルドの成果物による見かけ上の成功を防ぐため、実生成の検証はクリーンなコピーで行ってください。Python 3.11以上が必要です。

```sh
python3 -B -m unittest discover -s scripts -p 'test_netlify_build.py'
python3 scripts/check-netlify-build.py --node-version
# 上記のNode版を用意した、生成物のないコピーで実行
python3 scripts/check-netlify-build.py
```

このCIは生成先の整合を検査し、Netlifyへの公開操作は行いません。Netlify上のシークレット検査や外部環境変数を丸ごと再現するものではありません。

実際に静的サイトとして配信する派生サービスでは、API接続先と転送・画面fallbackの設定を別途用意してください。テンプレートには既存サービスの配信先を含めません。
