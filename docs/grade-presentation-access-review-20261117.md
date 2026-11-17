# 級別表示・無料範囲の独立コードレビュー（2026-11-17）

レビュー担当: 実装担当とは別の `grade_access_review`。本記録はコードと検査設計の独立レビューであり、この担当によるテスト実行・画面実操作の成功記録ではない。

## 対象と判定

依頼範囲は2級3回・準1級2回・1級1回の無料範囲、級別配色、級選択、最後の解答級の記憶。`config/exam.json`、共有級設定・スキーマ、APIの級スコープと無料上限、履歴・復習・実績・購入設定、Cookieとミドルウェア、関連画面・検査差分を確認した。

現在の対象版に、修正を要するコード上の問題は見つからなかった。自動検査と全級PC/SPの最終結果は実装担当の検証記録で別途確定する。

## 確認内容

- `gradeConfig` は渡された設定の級定義から無料上限・配色を取得する。級別値を省略した構成では従来の共通値へフォールバックし、共有Zodスキーマは級別上限が模試枠数を超える設定を拒否する。
- APIの無料上限は `currentGrade()` に応じて評価する。問題の直接取得・回答・次問自動選択・カタログの権限表示・履歴一覧の本文抜粋ロック・履歴詳細の解説取得が同じ上限を使う。復習と実績のSQLも級と上限を別引数で絞る。公開前の問題や他級の問題を無料枠変更で開放する差分はない。
- 既存の有料資格判定は維持される。旧membershipの2級限定扱い、共通subscription、管理者、課金無効時の扱いを変更していない。お気に入りを無料会員へ開放する差分はない。
- 公開購入設定の `free_exam_max` も級別値を返す。会員案内・規約・特商法表記は3/2/1の境界にそろう。購入後の演習導線とアカウント表示は既存の `useGrade` による設定を使う。
- 解答級Cookieは回答API成功後、既存の世代・セッション・URL・問題IDの現行応答ガードを通った場合だけ更新する。級を閲覧しただけでは更新しない。ホームの級未指定URLだけで復元し、明示した級を優先する。不正なCookie値を級として採用しない。
- 全級用のE2Eデータは合成fixtureから生成し、既存の専用test接続を起点とした使い捨てDBへ級ごとに投入する。教材原稿や稼働中DBを流用する差分はない。

## 初回指摘と再確認

1. 解答Cookie更新が遅延応答ガードより前にあったため、現行応答の確認後へ移動するよう指摘した。現在は `isCurrent()` の直後であり、修正済み。
2. 復習・実績テストの設定で、先に指定した `grades` が後続の `...original` に上書きされていた。順序の修正を確認した。
3. 次問自動選択のテストに、模試未指定で許可されない `after_question_number` が渡されていた。現在は `nextQuestion({})` であり、修正済み。
4. 小さい模試枠数を使う既存fixtureと旧3/4境界のsubscriptionテストについて、新設定との整合が必要と伝えた。級別値の省略による既存fixtureの維持と、各級設定から境界を取得する変更を確認した。

## 検査の確認範囲と未確定事項

新しいサーバーテストは、全級の無料最終回・有料最初回、匿名/無料会員/有料会員/管理者、subscription失効後の履歴・復習・実績、購入設定、課金無効時を検査する構造になっている。E2Eは全級で実API解答、Cookie、別級閲覧、ホーム復元と明示URL優先、無料境界、テーマを検査する。

実装担当から単体171/171、サーバー変更範囲22/22、型検査成功の報告を受領した。これらは担当者報告であり、本レビュー担当の再実行結果ではない。全体サーバー検査の確定集計、最終ビルド、全級PC/SP E2Eと画面確認は実装担当の最終記録を参照する。送信・本番変更はレビュー対象外であり、この担当は実施していない。

## 主要なレビュー対象版（SHA-256）

| ファイル | SHA-256 |
| --- | --- |
| `frontend/shared/grades.ts` | `5c8b4bda0cc07be5d41fa8da3f6e82c5a67c72efcdba3b0615d99d8bb3ef6085` |
| `frontend/shared/schemas/exam.ts` | `fced49d5cdf0765e30385dc8abad64921923b8e2b0a61b5343bd05b2ef86c8a3` |
| `frontend/server/core/config.ts` | `06c0e811337d52994fce26126821990bc66153a6af28cd4fa872fd623707a730` |
| `frontend/server/services/learning.ts` | `336bc44a7eb2d75272b5a95401f1011011af3cd798fe68b276e99e30ee0fc0ce` |
| `frontend/server/services/incorrect-review.ts` | `9b7348baf0062cabc2e6112c35454f2c105bb5e19f202a1141223ab0cf9c5447` |
| `frontend/server/services/achievement.ts` | `41af77d6a8f470853509d06e1191b17e90cc548ab2c44626fa6e28a5bda5208d` |
| `frontend/server/services/payment-settings.ts` | `baf9046d46e9b8c03586863fffab0785e1cf8df9e60bdbf50aa3c05d7efd8c06` |
| `frontend/app/middleware/grade.global.ts` | `5eb10b965bb938c4d1e29b06ff23d0b33b9585b873c228217f6b426c8890e322` |
| `frontend/app/pages/practice/[examNumber]/[questionNumber].vue` | `ca61d346dd6cd8272924d09b5801ef1999021b1e5a103c50e1cf76aaddeb8be4` |

## 静的HTMLの級復元修正の再レビュー

全級PC/SP E2Eの途中で、静的生成する特商法表記ページの準1級・1級にhydration mismatchが見つかったとの報告を受け、`app.vue` と `useGrade.ts` の追加変更を独立確認した。

`display-grade` はSSR payloadの級を初期表示に使い、hydration時の構造を一致させる。appの `onMounted` で実URLの級に同期し、`NuxtLayout` のkey変更で級依存の子コンポーネントを再生成するため、`useGrade()` が返すsnapshotの設定も再取得される。APIヘッダーとサーバーの級判定は実URLから取得する構造を維持する。今回の追加差分に、修正を要する問題は見つからなかった。

この構造は、現行の級選択と級変更ミドルウェアがフルリロードを行うことを前提に成立する。将来、級変更をSPA内の遷移へ変更する場合は、appのmount時だけでなく級変更時のdisplay状態同期も必要になる。現時点の未対応事項ではない。

最終E2Eでは静的ページの全級PC/SPのhydration、配色・級選択・無料境界と、静的ページからホーム/演習への内部導線で実級を維持することを確認する。最終結果は実装担当の検証記録で確定する。

| 追加ファイル | SHA-256 |
| --- | --- |
| `frontend/app/app.vue` | `86352199b0ce7ede584ed509f3be138b523ea9ebfd221ebfe66d953009e39c58` |
| `frontend/app/composables/useGrade.ts` | `3696db2dcad3affed306bf19ed9f356ea5610803a008182f31ce9caebe2dea55` |

## 最終結果の証跡確認

2026-11-17、最終記録と保存ログを読み取りで確認した。`/tmp/heritage-e2e-final4.log` と保存済み `browser.log` は46/46成功、使い捨てDB削除完了を示す。静的ページ→ホーム→演習の内部導線とhydration検査を含む最終結果として確認済み。`unit.log` は171/171、`server-changed.log` は22/22・失敗0・skip0、`typecheck.log` は型検査の診断エラーなしを確認した。サーバー全体の初回155/157と、修正後の関係範囲22/22の区別は維持する。

`source-fingerprints.json` の集約指紋 `a15175bd69c461953e51e6a708b2edee3077d6d8820b31cf1d8f150d9b54e18c` を記載方式で再計算して一致を確認した。`app.vue` と `useGrade.ts` の実ファイルは、保存指紋と上記再レビュー時の指紋の両方に一致した。これにより本記録で未確定としていた最終検査結果を証跡確認済みとする。この担当は検査の再実行・スクリーンショットの独立目視・アプリ/state変更を行っていない。
