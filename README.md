# 世界遺産ラボ

世界遺産検定2級の学習サービスです。日本と世界の遺産を、歴史・文化・自然のつながりから学べる演習基盤を用意しています。

公式2級テキスト第5版第2刷と2025/2026年の公式時事情報に基づく、分野混在順の模試1（60問・四肢択一）を収録しています。模試2〜10は未作成です。[問題原稿](content/mock-exam-01.questions.md)と[解答解説](content/mock-exam-01.answers.md)を参照してください。開発DBへの投入・画面確認の記録は[模試1の改訂・検証記録](docs/mock-exam-01-revision-20261105.md)を参照してください。

## 構成と機能

Nuxt 4 / NitroのTypeScript API / PostgreSQL 16を使用します。認証はBetter Auth、業務DBはPrisma、マイグレーションはPrisma Migrateです。

- 単一選択・正答1件の問題演習、回答後の正誤・解説・出典表示
- 会員登録・ログイン、回答履歴、間違えた問題の復習
- 管理者による問題の編集・公開、利用資格に応じたお気に入り
- 基礎知識、日本の遺産、世界の自然遺産、世界の文化遺産、その他の5大分類

制限時間付きの受験、試験全体の1点/2点配点による採点、写真・地図を含む表示ブロックは未実装です。既存の表示ブロックは文章・引用・穴埋め・表などに対応しています。

## ローカル起動

```bash
cp .env.example .env
# .envのDBパスワードと認証用シークレットを開発用の値に設定
docker compose up --build -d
```

ホームは `http://localhost:3110` です。独立したComposeプロジェクト `world-heritage-practice` とDB `world_heritage_development` を使用します。既存サービスの環境変数・利用者・DBをコピーしないでください。

初回起動でPrismaのマイグレーションを適用します。developmentでのseedは、設定から大分類をDBへ同期します。教材JSONは模試1の60問です。空の開発DBにだけ教材を投入し、既存の教材問題を上書きしません。

## 設定と教材

| 場所 | 役割 |
| --- | --- |
| `config/exam.json` | 名称、配色、試験構成、分類、公開状況の案内 |
| `content/questions.json` | 教材の正本。模試1の60問 |
| DBの `major_categories` | 設定から同期する5大分類のコード・表示名・表示順 |
| `frontend/test-support/` | テスト内だけで使う合成データ生成 |
| `past-exam/` / `textbook/` / `local-only/` | ローカル専用資料。GitとDockerから除外 |

教材は問題・解答解説をMarkdownで作成し、内容と利用条件の確認後に別途登録します。資料PDFや抽出本文をリモートへ送らないでください。問題を公開する際は `site.notice` の案内も更新します。

大分類は設定ファイルを正本とし、DBへ次のコマンドで同期します。再実行しても同じ行を重複登録・不要更新しません。既存の設定外分類は削除しません。

```bash
docker compose exec frontend npm run operations -- categories:sync
```

分類登録の実施結果は[大分類のDB登録](docs/categories-db-20261105.md)に記録しています。

課金の枠組みはテンプレートの設定（模試1〜5が無料、6以降が会員向け）を維持しています。販売は無効です。Stripe・販売者情報・問い合わせ先・規約を整え、別途確認してから販売を開始します。

## 検証と構成

対応Node.jsは `frontend/package.json` の `engines` に従ってください。

```bash
npm --prefix frontend ci
node --experimental-strip-types scripts/check-template.mjs
node scripts/check-private-sources.mjs
npm --prefix frontend run schema:check
npm --prefix frontend test
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

DB/APIとPlaywrightは、合成データだけを使う独立したtest用DBで実行します。[検証手順](docs/testing.md)、[構成](docs/architecture.md)、[カスタマイズ](docs/customization.md)、[初期構築の記録](docs/setup-20261105.md)を参照してください。

## 試験情報と派生元

試験形式・学習範囲・配点比率は[世界遺産検定2級の公式案内](https://www.sekaken.jp/each_grade/ex_class2/)と[受検の目安](https://www.sekaken.jp/each_grade/criterion/)を2026年11月5日に確認しています。本サイトは独自の学習サービスです。

派生元は [exam-practice-template](https://github.com/misato729/exam-practice-template)、取得時コミットは `9ce93c6c07f746cd5f084ff2b874c1773919eb4b` です。派生元の運用履歴・完了記録・認証情報・教材を引き継がず、新しい履歴から開始しています。
