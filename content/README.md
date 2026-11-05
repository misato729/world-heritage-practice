# 世界遺産ラボの教材データ

`questions.json` は `schema_version: 1` と空の `questions` 配列です。問題の作成・投入はまだ依頼されていません。空の配列は正常な初期状態として検証し、developmentのseedも0件を維持します。

試験設定は `config/exam.json`、形式の正本は `frontend/shared/schemas/` です。公開セットは問1〜60をそろえ、選択肢①〜④、正答1件、解説・出典を含めます。登録前には [カスタマイズ手順](../docs/customization.md) を確認します。

動作検証用の合成データは `frontend/test-support/` で生成し、test専用DBへ明示して投入します。ここに保存せず、通常起動のseedや公開コンテンツには使用しません。

`past-exam/` とその抽出本文・原本画像はローカル専用です。Git、Docker、外部ストレージ、CI成果物へ含めません。今後の教材作成では、問題と解答解説をMarkdownで保存し、原典照合と独立レビューを行います。
