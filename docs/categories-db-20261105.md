# 大分類のDB登録

2026年11月5日の追加依頼。設定には指定の5大分類が登録済みだったが、テンプレートのDBには分類マスター表がなかった。設定を正本として、DBへ5大分類のコード・表示名・表示順を保存した。教材は0件を維持した。

## 実装

- Prismaの`MajorCategory`モデルと、追加移行`20261105061500_major_categories`を用意。既存baseline・既存表は変更していない。
- `categories:sync`はトランザクションと専用advisory lockで実行し、設定と同じ行は更新せず、設定外の既存行も削除しない。
- developmentの`db:seed`でも分類を同期する。production/testでの自動seed停止は維持し、明示の`categories:sync`は利用できる。
- UIと問題の分類検証は引き続き`config/exam.json`を参照する。今回のDB表は大分類の保存先であり、小分類は既存設定のまま。

## 実際の登録先と結果

プロジェクト専用Composeのローカル開発DB `world_heritage_development`（127.0.0.1:55440）。新規の永続volume `world-heritage-practice_postgres_data`を使用し、適用前のpublic表は0件だった。他サービス・本番DBへ接続していない。

| 表示順 | コード | 大分類 |
| --- | --- | --- |
| 1 | `fundamentals` | 基礎知識 |
| 2 | `japan` | 日本の遺産 |
| 3 | `world_nature` | 世界の自然遺産 |
| 4 | `world_culture` | 世界の文化遺産 |
| 5 | `other` | その他 |

初回は5件作成・更新0件。2回目は追加0件・更新0件・変更不要5件。既存行とタイムスタンプが完全一致した。developmentのseedも分類は変更不要5件・教材投入なしで終了した。接続を閉じて再接続した後も5件の内容・表示順が一致した。問題0件・選択肢0件を維持している。

## 今回の検証

- 専用`world_heritage_categories_test`で追加移行を検証。
- DB/API全回帰128件成功、失敗・スキップ0。既存スキーマへの追加適用・ID/履歴保持・反復適用を含む。
- 分類テスト4件成功。追加、反復時の行/時刻不変、名称・順序更新、設定外行の保持、失敗時のrollback、CHECK3件の負境界を確認。4件目を追加後はこの分類テストだけを再実施した。
- Prisma Client再生成、Prisma schema検査、型検査が成功。
- UIのソース・設定値に変更はないため、PC/SPの表示確認は今回再実施していない。初期構築時の確認と今回のDB検証は区別する。
- 過去問・ローカル資料・秘密設定のGit追跡/全履歴検査が成功。

検証ログと実行結果はGit管理対象外の`local-only/categories-db-20261105/`へ保存した。検証専用DBと一時接続設定を削除し、開発DBは永続保存している。

## 独立レビュー

`heritage_final_review`が設定正本・非破壊性・追加migration・同値時の非更新・ロック・分類4件/API128件の結果を確認しPASS。開発DBの実行結果JSON・登録先・5件の表示順・反復時の時刻不変・再接続結果・教材0件と最終記録も同担当が確認しPASS。未解決の実装上の指摘なし。

## リモート

今回追加したスキーマ・登録処理・検証記録は、コミット`fe489ae5188079ce7e01db1eddbff2504b14d8ea`として`origin/main`へ保存し、GitHubのmain参照と一致を確認した。DBの保存領域・秘密設定・ローカル資料は送信していない。

同コミットの[CI実行41980620017](https://github.com/misato729/world-heritage-practice/actions/runs/41980620017)は、`harness`・`verify`・`browser`・`netlify-static`の4ジョブすべて成功した。DB/API・フロント・本番用ビルド・PC/SP操作・静的出力をCIで検査した結果であり、本番サービスの配信は行っていない。
