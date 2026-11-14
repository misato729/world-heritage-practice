# 準1級模試2〜10の作成・開発DB登録・表示確認（2026-11-14）

準1級模試2〜10の9回・540問・2160肢を作成し、専用開発DBへ追加した。[模試2を開く](http://localhost:3110/practice/2/1?grade=pre1)。既存の準1級模試1と2級600問は、本文・選択肢・ID・作成/更新時刻を保持した。現在は準1級600問2400肢、2級600問2400肢、合計1200問4800肢である。

原稿・解答解説・解答用紙・出典・旧版・検証結果は `local-only/pre1-mocks-02-10-20261114/` に保持する。以下は確認結果の要約で、問題本文・原資料を転載しない。

## 作問と受入

提供された2025・2026年の実試験4回240問と新課程例題60問の分析を、[模試1の分析記録](../local-only/pre1-mock-01-20261114/analysis.md)から継承した。主出典は指定準1級テキスト『ふみこんで学ぶ世界遺産700』第2版第2刷（2026年4月15日）。「その他」は書籍外の識別知識を要する公式一次資料に基づき、対象年・確認日を保持する。情報基準日は2026年11月14日。旧課程の時事分類は引き継がず、現行課程での分野を用いる。

各回は四肢択一・正答1件・60問。次の配点を保ち、分野を混ぜた固定問番号を原稿・保存データ・画面で一致させた。自然と文化の内部の問数は各回の主題に合わせ、海外全体の配点を50点とした。

| 分野 | 各回の問数 | 作問上の配点 |
| --- | ---: | ---: |
| 基礎知識 | 9 | 15 |
| 日本の遺産 | 15 | 25 |
| 世界の自然遺産＋世界の文化遺産 | 31 | 50 |
| その他 | 5 | 10 |
| 合計 | 60 | 100 |

各回1点20問・2点40問。全問に正答の決め手・全肢の判定理由・確認用の出典を付けた。問題文は必要条件を自立させ、作問用の書籍を別途参照する表現を使わない。書籍の印刷頁と撮影PDF内の位置（印刷頁+2）は区別して記録した。

作者以外の担当が先に盲解を固定し、その後にキー・原典へ照合した。改稿提示は旧キー未見の担当で再確認し、最終13問52肢は必須指摘0件・助言4件。初回の不明や不一致は原記録を保持し、作者のキーへ合わせて書き換えていない。変更していない材料は対象版・レコードの一致を確認して継承し、`final-review-coverage.json` の540行で現行材料と原典/盲解の連鎖を固定した。

原稿の構造・型別文量・配点・最短解法・誤答肢・答え漏出を評価した。回をまたぐ個別事実の重複を改稿し、妥当な基礎制度の反復は理由を記録して保持した。文字列の候補検査を意味的な重複の網羅保証とはせず、実受験者の正答率・時間・識別力も未測定である。初稿や途中稿の不合格評価は各回の評価履歴へ残した。

## 登録・画面の確認結果

| 対象 | 結果・根拠 |
| --- | --- |
| 全件変換 | 新540問2160肢と既存模試1の60問240肢を独立照合し差分0。総括・全肢解説・根拠番号・出典URL・分野・固定問番号が一致。`integration/conversion-result.json`、`integration/reviews/final-conversion-comparison-d.json` |
| 追加前の保存 | 既存660問2640肢をbackupし、全行と保護対象13モデルの指紋を取得。`integration/baseline-metadata.json` |
| 復元とwriter | 新規の使い捨てtest DBへbackup復元。23問追加後の取消、540問追加、反復no-op、再接続と既存ID/時刻/材料保持の5検査が合格。`integration/writer-test-result.json` |
| 検証用画面 | 別のfresh test DBへ共有CLIで600問をimport。合成会員でPC1280×900・スマートフォン幅390×844の各540問を表示・回答。匿名サンプル各4問を含む計1088表示/回答が合格。`integration/browser-result.json` |
| 表示の全件比較 | 回答前の正答/解説非漏出、四肢・全肢解説・出典リンク、正解/不正解、連続した次問移動、級切替・問60への移動を確認。横はみ出し0・JavaScriptエラー0 |
| 検証環境の終了 | 所有する検証用DB残数0・検証用サーバー停止を確認。`integration/cleanup-result.json` |
| 開発DBへの追加 | 共通writerの単一トランザクションで新540問2160肢だけ追加。既存660問2640肢・ID/時刻・保護モデルを保持し、再接続後と反復no-opでも一致。`integration/applied-result.json` |
| 開発画面への反映 | 識別した既存開発プロセスを検証済みbuildへ切り替え、3110の待受・健康状態・実行ファイル/出力指紋を確認。`integration/development-process-binding.json` |
| 実開発での表示 | 無料の模試2・3全120問をPC/SP各で表示・回答、計240回が合格。模試4〜10の会員制案内・API拒否、他級からの遮断も確認。`integration/browser-result-development.json` |
| 表示後の保持 | 実開発の全1200問と選択肢、13保護モデルが確認前後で不変。会員・履歴・お気に入りを作成しない匿名確認。`integration/development-postcheck.json` |
| 目視と独立確認 | 担当者22画像・別担当44画像（重複除外58画像）で問題/解説・番号対応・改行・出典・ロック表示を確認。`integration/visual-review-root.json`、`integration/reviews/independent-runtime-review-final.json` |

最終原稿・共通検査・レビュー・backup・archive・source/config・build出力の指紋を結合し、隔離実行の前後・開発DB追加前・起動前・実画面確認時に照合した。独立静的レビューは33コードと固定根拠を含む166指紋を確認した。登録archiveのSHA-256は `f3a095cd0316b4b4ccf9d05f72ca6d52c8210ded217bde43a6bcd7040f91a9f7`。

## 問題・解答解説・解答用紙

| 模試 | 問題 | 解答解説 | 解答用紙 |
| --- | --- | --- | --- |
| 2 | [問題](../local-only/pre1-mocks-02-10-20261114/mock-02/pre1-mock-02.questions.md) | [解答解説](../local-only/pre1-mocks-02-10-20261114/mock-02/pre1-mock-02.answers.md) | [解答用紙](../local-only/pre1-mocks-02-10-20261114/mock-02/pre1-mock-02.answer-sheet.md) |
| 3 | [問題](../local-only/pre1-mocks-02-10-20261114/mock-03/pre1-mock-03.questions.md) | [解答解説](../local-only/pre1-mocks-02-10-20261114/mock-03/pre1-mock-03.answers.md) | [解答用紙](../local-only/pre1-mocks-02-10-20261114/mock-03/pre1-mock-03.answer-sheet.md) |
| 4 | [問題](../local-only/pre1-mocks-02-10-20261114/mock-04/pre1-mock-04.questions.md) | [解答解説](../local-only/pre1-mocks-02-10-20261114/mock-04/pre1-mock-04.answers.md) | [解答用紙](../local-only/pre1-mocks-02-10-20261114/mock-04/pre1-mock-04.answer-sheet.md) |
| 5 | [問題](../local-only/pre1-mocks-02-10-20261114/mock-05/pre1-mock-05.questions.md) | [解答解説](../local-only/pre1-mocks-02-10-20261114/mock-05/pre1-mock-05.answers.md) | [解答用紙](../local-only/pre1-mocks-02-10-20261114/mock-05/pre1-mock-05.answer-sheet.md) |
| 6 | [問題](../local-only/pre1-mocks-02-10-20261114/mock-06/pre1-mock-06.questions.md) | [解答解説](../local-only/pre1-mocks-02-10-20261114/mock-06/pre1-mock-06.answers.md) | [解答用紙](../local-only/pre1-mocks-02-10-20261114/mock-06/pre1-mock-06.answer-sheet.md) |
| 7 | [問題](../local-only/pre1-mocks-02-10-20261114/mock-07/pre1-mock-07.questions.md) | [解答解説](../local-only/pre1-mocks-02-10-20261114/mock-07/pre1-mock-07.answers.md) | [解答用紙](../local-only/pre1-mocks-02-10-20261114/mock-07/pre1-mock-07.answer-sheet.md) |
| 8 | [問題](../local-only/pre1-mocks-02-10-20261114/mock-08/pre1-mock-08.questions.md) | [解答解説](../local-only/pre1-mocks-02-10-20261114/mock-08/pre1-mock-08.answers.md) | [解答用紙](../local-only/pre1-mocks-02-10-20261114/mock-08/pre1-mock-08.answer-sheet.md) |
| 9 | [問題](../local-only/pre1-mocks-02-10-20261114/mock-09/pre1-mock-09.questions.md) | [解答解説](../local-only/pre1-mocks-02-10-20261114/mock-09/pre1-mock-09.answers.md) | [解答用紙](../local-only/pre1-mocks-02-10-20261114/mock-09/pre1-mock-09.answer-sheet.md) |
| 10 | [問題](../local-only/pre1-mocks-02-10-20261114/mock-10/pre1-mock-10.questions.md) | [解答解説](../local-only/pre1-mocks-02-10-20261114/mock-10/pre1-mock-10.answers.md) | [解答用紙](../local-only/pre1-mocks-02-10-20261114/mock-10/pre1-mock-10.answer-sheet.md) |

[全9回の原稿一覧と検証入口](../local-only/pre1-mocks-02-10-20261114/README.md)。作問の正本は各回の `authoring.json`、全体受入は `content-final-acceptance.json`。初期seedの2級 `content/questions.json` は変更していない。

写真・地図の問題、配点を使う得点集計、60分の受験セッションは今回追加していない。スマートフォン確認はChromeの表示幅によるもので実機ではない。会員制（1〜3無料、4以降有料）は維持した。非空の既存個人履歴の保持を新たに実測したものではなく、開発DBの所有行は確認前後とも0件。稼働時の `rate_limiter_flexible` カウンターは保護13モデルの比較に含めない。販売開始・本番公開・commit/pushは行っていない。

別担当の独立最終レビューも合格、必須指摘0件。固定166指紋と実行結果の結合、全件表示・保持・後片付けを確認した。
