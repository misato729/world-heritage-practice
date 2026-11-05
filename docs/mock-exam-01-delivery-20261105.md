# 模試1までの変更のGit保存

2026年11月5日、「ここまでの変更をコミットして、リモートに上げる」という追加依頼に基づく。送信先は既存の非公開リポジトリ `misato729/world-heritage-practice` の `main`。

## 送信範囲

- 模試1の60問と問題Markdown・全肢解答解説。2025/2026年の時事4問と分野混在順を含む。
- `site.notice`の準備中表示解除、READMEと作問ルール、教材/分類/検証記録とworkflow状態・引き継ぎ。
- `textbook/`をGit・Docker・履歴の資料保護対象へ追加。
- 空教材のseed検査が実教材を参照しないよう、既存のoperationsテストを専用空fixtureへ変更。

原本PDF・OCR・原画像・内部レビュー・DBスナップショット・実行ログ・秘密設定は送信しない。本番配信は対象外で、送信コミットには`[skip netlify]`を付ける。

## 確認した範囲

教材JSONのSHA256は`27c0312907079f62c43ba0cc535d864c22ea62a41ec2510dcd199a3ae3c95d83`。既存の独立原典/全件対応レビューと、PC/SP120表示・時事全4問回答の成功記録と一致し、教材・アプリコード・依存関係に変更がないため、その結果を確認日のまま継承する。

今回、共有スキーマで60問・240肢を再確認し、資料の追跡/履歴・ignore・ステージ対象と差分を検査した。専用test DBでoperationsテスト13件が成功（失敗/スキップ0）し、DBと一時fixtureの削除も確認した。`revision_review`が送信候補・資料保護・記録の整合性と追加テスト差分を独立確認しPASS。送信直前に問題/解説Markdownの文末の余分な空行のみ整え、本文と教材hashを維持した。

## 送信結果

実装コミット`9e6e6df6549feac66ba2f3ea7e8ea657d4b7ef8e`を`origin/main`へ送信し、GitHubのmain参照と一致、ローカルとの差分0/0を確認した。同SHAの[CI実行42044982735](https://github.com/misato729/world-heritage-practice/actions/runs/42044982735)は、`harness`・`verify`・`browser`・`netlify-static`の4ジョブすべて成功した。完了記録だけを後続のdocsコミット（`[skip ci] [skip netlify]`）へ保存し、確認済み実装に対するCIと区別する。サイト本番配信・クラウドDBへの反映は行っていない。
