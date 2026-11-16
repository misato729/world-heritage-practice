# サイドバー静的表示・PC開閉の独立レビュー（2026-11-16）

- 対象タスク: `sidebar_static_desktop_20261116`
- 実装担当: `sidebar-static-root`
- 独立レビュー担当: `sidebar-auth-reviewer`（`/root/sidebar_auth_review`）
- 確認日時: 2026-11-16 03:30 UTC
- 判定: **PASS。未解決の必須指摘0件。**
- 終了点: 後続のユーザー指示によりローカルコミットまで。push・本番反映は行わない。

依頼範囲と検証の正本は[実装・検証記録](sidebar-static-desktop-20261116.md)を参照する。本記録は認証境界、初回表示、級付きリンク、PC/SP操作を別担当が確認した結果である。

## 確認した境界

- `session.global.ts`の非待機は初回client hydrationに限定され、通常の内部遷移とSSRは認証確認を待つ。保護ページのauth/adminガードは独自に認証を待ち、SSRの利用者別表示には`private, no-store`が維持される。Better Auth、API側の現在の権限・資格検査を変更していない。
- サイドバーは設定由来の20案内枠を表示し、独自の資格確認や問題API取得を行わない。資格不明では有料枠をロックし、親・子リンクを会員案内へそろえる。確認後の資格変更・ログアウトは、開いた問番号メニューにも反映される。
- native認証の購読は起動時から維持し、hydration中はSSR状態を変えず、ready後に最新snapshotを反映する。同じ認証世代の照合合流、認証操作中の待機、古い応答の破棄、別タブの更新を維持している。
- 級付きリンクはSSRの初期値を共有し、mount後と級変更時に実URLへ追従する。明示した遷移先の級、他のquery・hash、外部リンクを保持する。
- PCは260px/64pxを切り替え、閉じた内容を`display: none`にして本文へ幅を返す。再開ボタンとキーボード操作、SPの一覧・模試ごとの開閉、PC→SP→PCの切替が整合する。

## 指摘と修正後の独立再検証

| 指摘 | 修正と再検証 |
| --- | --- |
| hydration中の他タブログアウト・アカウント変更をready後も初回snapshotとして扱い、旧SSR利用者・資格・お気に入りが`/me`待機中に残る。 | 既存利用者とnative状態が異なる場合は、ready後に旧状態を先に破棄する。独立の合成harnessで、nativeがnull・別利用者の両方について、`/me`未応答の時点で利用者消去1回・照合1回を確認した。匿名shellは消去せず初回ガードの照合へ合流する。回帰2件も成功ログを確認した。 |
| 有効な`?grade`のnull値を文字列`grade=null`としてリンクへ付け、次画面が級指定エラーになる。 | 未指定のundefinedのみをSSR未指定値として扱い、明示nullは従来どおり級2へ正規化する。独立harnessで`/privacy-policy?grade=2`を確認し、SSR・静的mount後の回帰検査を照合した。 |

両指摘は修正済みであり、現行版に残る必須指摘はない。

## 検証根拠の照合

実装担当が実行した以下のログ・検査内容・画像を独立に照合した。大きな検査をレビュー担当が重複実行した記録ではない。上記2件の合成harnessによる再現・修正後再検証と、対象差分検査はレビュー担当が実行した。

| 検査 | 照合した結果 |
| --- | --- |
| 関連unit | 41 passed / 0 failed / 0 skipped。初回・通常・SSRのガード、native認証同期、級付きリンク、静的カタログと資格変更を確認。 |
| Nuxt型検査 | 正常終了。 |
| 使い捨てtest DBのPlaywright | PC18/SP18の計36件成功。実サーバーを起動し、終了時の使い捨てDB削除ログまで確認。各級のPC/SP代表画像6点と、開閉・級別60/60/90問・ロック・通信のassertionを照合。 |
| 静的生成 | 32 prerender routesで正常終了。検査用コピーの変更対象アプリ5ファイルが、現行版とバイト一致することを独立確認。 |
| 真の静的HTML＋認証保留/503 | 共通のraw HTMLに20枠があり、待機表示がない。3級×PC/SPの6ケースで、nativeと`/me`の応答を保留したまま操作し、503後も一覧保持。各ケースで問題API0件・page error 0件。PCのTab/Enterと幅変更、SPの2列・問番号・Escape、親子ロックhrefのassertionと代表画像を照合。級別問数・hrefの確認はhydration後の結果である。 |
| 即応premiumの静的表示 | 準1級PC/SPの2ケースで、認証直後に親・子hrefが演習へ更新されることを確認。この2件は資格反映の確認範囲とする。 |
| 差分 | `git diff --check`成功。既存の別作業であるAGENTS.mdの1級資料方針は本レビュー対象外。 |

ログはローカルの`/private/tmp/heritage-sidebar-complete-20261116/`配下の`unit-final.log`・`typecheck.log`・`e2e.log`・`static-build.log`・`static-browser.log`。安全な集計・検査スクリプト・画像は`local-only/sidebar-static-desktop-20261116/`配下の`static-results.json`・`static-check.mjs`・`pending-*.png`・`e2e-results/`。これらのローカル成果物はGit送信対象に含めない。

## 対象版

開始HEADは`25ab5f32513b882a2a9d0b14a62866646dc6ba14`。レビュー時点の変更対象アプリのSHA-256は次のとおり。

| ファイル | SHA-256 |
| --- | --- |
| `frontend/app/components/ExamSidebar.vue` | `7cffa37e4f63762b1423daebe6a0a6d7020a2c3e23e8440b99d7ec2348a05310` |
| `frontend/app/components/GradeLink.vue` | `5ee874ff7cbc5204011c915c7426c05b780d8344d7d7f511008ce50e62c56f90` |
| `frontend/app/layouts/default.vue` | `7c23c62dcb2c2a7a2a3f27d40407906ea805a9e817baa07b3f69587b584c11ed` |
| `frontend/app/middleware/session.global.ts` | `97209bfd2c57bc3a5c15e98ff8a2691a68cb2a5b8a434738a9842ab1341d4364` |
| `frontend/app/plugins/auth-session.client.ts` | `5ff1560f2b4f1e37ce4ffb43d40a71156dd8cd91f7179f1f5801ccbc08c727de` |

検査対象の静的`index.html`のSHA-256は`b846c8b7488ab2c8d7473ac95e27724c433be8ef7de565750cf65b6de3e98d3b`。

実本番・実決済は未検証であり、今回の変更・操作に含めていない。教材、DBの業務データ、Stripe・メール・障害通知設定にも変更はない。本判定はローカル実装と上記検証範囲に対するもので、push・本番公開の完了を示さない。
