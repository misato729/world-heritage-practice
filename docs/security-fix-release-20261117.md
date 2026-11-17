# 脆弱性修正・本番反映（2026年11月17日）

ユーザーの「修正とデプロイを行ってください」に基づき、[診断報告](security-assessment-20261116.md)の3指摘と関連する防御強化を実施する。

## 修正

- 退会時のパスワード照合前に、IP単位20回/15分・会員単位10回/15分の制限を適用。既存のPostgreSQLストア・HMACキー・固定時間区間を使用する。
- Stripe Webhookは署名ヘッダーの欠落を早期拒否し、raw bytesを保持して1MiBの受信上限を適用。Content-Lengthとchunked双方を制限し、途中切断時のバッファとlistenerを解放する。
- APIに相当するエンコード済みパスを署名検証前に拒否。healthとWebhookの既存公開例外を保持する。
- Portal作成にIP単位20回/5分・会員単位10回/5分の制限を追加。
- 静的HTMLに埋込み拒否、nosniff、Referrer/Permissions Policy、CSPを追加。Nuxt生成物のinline script/styleを維持するためunsafe-inlineを許可し、objectと外部埋込みを拒否する。nonce/hashベースの厳格化は今後の改善余地として残る。
- Nuxt4.6.4、Sentry11.13.0、Forge1.4.3へ更新。Forge独自バックポートを廃止し、既存の検証入口を上流版・ソースハッシュの読取専用検査へ移行。archiver配下のreaddir-glob4.0.0限定overrideを採用。

## 検証と配信版

基準は最新本番と一致するd13bb24a6818225ee42ad8302ec6ceb6b3d22e02。今回の15ファイルの変更だけを重ねた隔離ソースを固定し、manifest SHA-256は41d3db5a772972371742aa56cf76229e74d74568b7cd643f85ff8c643213abeb。DBスキーマ・教材・秘密設定の変更はない。既存AGENTS/stateと無関係な記録を配信ソースへ重ねない。

- Node24.15.0・新設のPostgreSQL16専用test DBでAPI回帰117件成功、失敗/skip0。
- フロント単体検査172件成功、失敗/skip0。最初のHTTPS検査はsandboxのポート制約で失敗し、許可した実行環境で再実行した結果を採用。
- 退会/Portal制限とWebhookの生バイト・容量境界・複数chunk・中断処理を含む追加17件成功。APIとの重複を含むため総件数に重複加算しない。
- 固定した隔離配信版の静的生成・型検査が成功。公開127ファイル、有料問題の本文断片1020件との一致0件。
- npm監査は全重大度0件。資料保護・差分検査成功。別担当fix_reviewが最終差分を独立確認し、修正必須の指摘0件。
- 証拠・ソース指紋・ログはlocal-only/security-fix-20261117/へ保存。test DBは検証後に停止確認・削除した。

配信用依存コピー中のディスク不足は今回作成した部分コピーだけを削除し、APFSの独立copy-on-write複製へ切り替えた。既存資料・既存ビルド・他作業のファイルを削除していない。

## 配信結果

- Flyの既存マシンへ`security-20261117-41d3db5a7729@sha256:03952c443af73a276b12bd0cd8aab5174c9ac7a786588bad0ea0fa322dce7dc0`を反映。env/init/guest/services/restartの設定指紋は更新前後一致。
- Netlifyは`6afbcf1158239e51a50960cf`、ready・productionを確認。配信した静的成果物のSHA-256は8d5c98a16a0cf3bfa4fbba3a4bf75698cca3e32ee1a3c03c48d79602fcedca9b。
- 公開後API8件成功。healthと通常のNetlify経由APIは200、匿名meは401、直接Flyの通常/エンコード済みAPIは403。
- 初回Fly更新はregistryのMANIFEST_UNKNOWNで停止し旧版保持を確認。転送済みdigestを明示した更新で成功した。失敗と成功を区別して記録した。
- Playwright/ChromeでPC1280px・スマートフォン390pxの全3級ホーム、ログイン、再設定、購入案内の12表示と匿名API4件が成功。CSP/frame拒否/nosniff、横はみ出しなし、pageerror0を確認し、PC/SP画像も目視確認した。認証付き本番操作・実決済・本番への大容量送信は行っていない。

今回の配信にGit commit/pushは使用していない。固定manifestに一致する隔離ソース・生成物から既存サービスへ直接配信した。2026年11月17日の追加依頼により、修正ソース・診断・配信記録と今回の進捗だけをコミットし、mainへpushする。既存AGENTSや他作業の進捗・記録は対象に含めない。
