# 3級種統合・月額プランのGit送信記録

2026年11月6日の「一旦ここでコミット・pushしてください」に対応。

## 送信範囲

[設計方針](multi-grade-subscription-design.md)、[実装と検証](multi-grade-subscription-implementation.md)、1級・準1級・2級の級別学習、全級共通月額500円（税込）、各級の模試1〜3無料／4以降有料、関連するテスト・追加マイグレーション・作業記録を送信した。

- リポジトリ：`misato729/world-heritage-practice`、送信先：`origin/main`。
- 実装コミット：[01643e29badd4b5a592c7b23c8aa319a68629647](https://github.com/misato729/world-heritage-practice/commit/01643e29badd4b5a592c7b23c8aa319a68629647)。
- 承認された79ファイルを明示的にステージし、ステージ済み一覧と確認済み一覧の一致を検査した。
- `.env`、過去問、公式テキスト、抽出本文、DBバックアップ、ローカル専用ログは除外。Git追跡・全履歴の資料保護検査と差分形式検査に合格。
- 実装レビュー時の主要6ファイルのSHA-256一致を確認。先行の単体・API/DB・型・PC/SP検証は実装記録の日付と範囲で継承し、Git送信前に再実行したものとは扱わない。
- 別担当の送信前レビューPASS。詳細は `local-only/multi-grade-delivery-20261106/` に保持。

## リモート検査

[GitHub Actions](https://github.com/misato729/world-heritage-practice/actions/runs/42090180273)を同じ実装コミットに対して確認し、`harness`・`verify`・`browser`・`netlify-static` の4ジョブすべて成功した。`netlify-static` は静的生成の検査であり、サイトの公開操作ではない。送信記録の追加コミットはコードを変更せず、`[skip ci] [skip netlify]` で保存する。

本番デプロイ・販売開始・Stripe実環境の操作は行っていない。Netlifyを起動しないためコミットへ `[skip netlify]` を付けた。
