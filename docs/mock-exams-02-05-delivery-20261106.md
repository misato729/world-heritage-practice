# 模試2〜5のリモート保存

2026年11月6日の明示依頼に基づき、2級模試2〜5（240問・12 Markdown）、収録案内、有料案内の匿名401反復修正、関連テストと完了記録を保存する。

教材正本はSHA-256 `86d1590c5dd0f37e46498ad0db4e845eb79c58d447fdd72e1e359e0b410dd6b4`。アプリ/設定198入力は検証済みdigest `3d64f6add8dc544d84a5e055c14e1718c015333aea8f681af8acfd97b06d8bc3` と一致することを確認する。[作成と開発検証](mock-exams-02-05-20261106.md)の原典・DB・PC/SP結果を同一版の証拠として継承し、今回のGit検査と区別する。

原本・OCR・画像・内部作問記録・DBバックアップ・秘密設定はGitへ含めない。送信先はorigin/main。本番配信を抑止するため実装commitに `[skip netlify]` を付け、GitHub CIは実行する。本番・Stripe設定は変更しない。送信結果は確認後に追記する。

## 完了結果

37ファイルを明示stageし、原本・秘密設定除外、index/worktree一致、cached diff検査と独立レビューPASS。12MDの末尾空行だけを整理し、6517の教材比較も再確認して成功した。教材/アプリの検証版は不変。今回workflow関連162検査が全て成功した。

実装commit `a981e07ddee7d5766231b849859a195f09d39e59` をorigin/mainへpushし、remoteとの一致0/0を確認した。[GitHub CI](https://github.com/misato729/world-heritage-practice/actions/runs/42123611806)は同SHAでharness・verify・browser・netlify-staticの4ジョブ全て成功。

この完了記録とworkflow状態だけを `[skip ci] [skip netlify]` 付きで追補する。教材・app・configは変更せず、本番・Stripe操作も行わない。
