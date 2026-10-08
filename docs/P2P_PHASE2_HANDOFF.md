# 2026-10-08 Phase 2b 更新

この節が本ファイル内の古い「未マージ」「Phase2b未実装」記述より優先される。現行コードを絶対的な正とし、作業開始時にはGitHubの最新develop/PR状態を再確認すること。

## 最新基準

- FE: `tanku3080/battle-viewer`
  - Phase2b分岐時develop: `fe61a69afacaf3df3deb755d16c9d08201dca6ac`
- BE: `tanku3080/battle-hub`
  - 確認develop: `5502070b44a213c54170b1df12d45ba4d0d3ecba`
- Phase0 FE #44: merged
- Phase1 BE #7: merged
- Phase2a FE #45: merged
- Phase2b FE #46: open
  - branch: `feat/p2p-phase2b-tauri-settings`
  - 詳細: `docs/P2P_PHASE2B.md`
  - mergeは禁止。レビュー/CI後にユーザーが判断する。

## Phase 2b 実装済み

- Phase2a `battle-p2p-core`をTauriへpath dependency接続。
- Tauriの`app_data_dir/p2p/cache`でprivate Cacheをopen。
- persistent settings:
  - P2P参加同意
  - download同意
  - redistribution同意
  - cache quota
  - upload bandwidth limit
- 3同意はすべて既定OFF。downloadとredistributionは独立。
- random installation ID + private 32-byte identity seedを永続化。
  - seedはIPC/UIへ出さない。
  - Phase3はこのseedからnetwork identityを導出し、勝手にidentityを作り直さない。
- Tauri IPC:
  - `p2p_get_status`
  - `p2p_update_settings`
  - `p2p_get_inventory`
- inventory/used-size検査はblocking workerで実行。
- Homeへja/en対応・keyboard accessibleなP2P設定UIを追加。
- IP開示可能性、disk使用、upload帯域を明示。
- WebではDesktop限定機能と表示し、P2P利用可能と偽装しない。
- Phase2bではlistener、peer connection、download/uploadを開始しない。networkActive=false。
- Tauri Cargo.lockの再生成整合check、Windows Tauri Rust test/clippy、Linux Rust testをCIへ追加。

## Phase 2b セキュリティ境界

- rendererからfilesystem pathを指定させない。
- cacheはPhase2aのhash/size/schema/resource検証を維持。
- identity secretをrendererへ返さない。
- 同一app-dataを別プロセスが開く場合、cache lockをidentity生成前に取得しraceをfail closedする。
- P2P初期化失敗はアプリ全体を落とさず、P2Pのみunavailableとして表示する。
- 現在の同意設定は将来のnetwork動作条件を保存するだけ。ONでもPhase2bでは通信しない。
- Hub token / peer address / transfer grantはこのsettings/cache層へ保存しない。

## 次Phase

Phase3は一つの巨大PRにせず分割すること。

### Phase3a: direct transport
- installation identity seedから安定したlibp2p identity/PeerIdを導出
- maintained libp2p
- encrypted direct transport
- 8MiB圧縮上限を超えてbufferしないbounded codec
- timeout/retry/backpressure
- original gzip bytesをそのまま転送
- A→B→C loopback/integration試験
- consent OFFではlisten/advertise/upload/downloadを行わない

### Phase3b: Hub discovery / authorization
- BE migrationでprovider leaseを永続化
- authenticated provider register/renew/remove/discovery
- lease expiry
- transfer grantは短命、requester/provider/作品へbind
- 転送ごとに最新STOPPED/権利を確認
- Hub不通・grant失効・権限なしはfail closed
- anonymous contentHash取得やgrant迂回を作らない
- IPは必要最小限の短命provider情報として扱い、作品本文と同様にDBへ恒久保存しない設計を検討

Phase4で目標3複製/再複製/bandwidth/quota/all-offline表示、Phase5でHub UI・投稿・取得・直接再生/再編集、Phase6で外部ネットワーク/NAT/resource security/設計書更新。

画像decode/pixel上限は、P2P取得した未信頼JSONをViewer/Creator描画へ接続するPhase5以前に必ず追加する。

---

# Battle Viewer / Battle Hub P2P実装 引き継ぎプロンプト（2026-10-08 JST）
Battle ViewerとBattle HubのP2P分散Battle JSON共有基盤を段階的に実装せよ。目的は中央サーバーの本文保存容量・配信量・費用の最小化。Hubは認証、作品メタデータ、一覧検索、配信元・発見・転送認可を管理し、JSON本体は明示同意したTauri端末がGzipで保存・転送する。投稿者Aがオフラインでも複製を持つBからCへ取得できることが最終目標。月額0円を優先するが常時可用性・無料NAT越えは保証しない。広告・決済は対象外。有料契約とPR自動マージは禁止。

## 1. リポジトリ・基準
FE: tanku3080/battle-viewer https://github.com/tanku3080/battle-viewer
BE: tanku3080/battle-hub https://github.com/tanku3080/battle-hub
両方developから機能別ブランチを作成する。現行コードを設計書より優先する。技術はNext.js/React/TypeScript/Tauri 2/Rust、Java21/Spring Boot。
今回取得したdevelop: FE 58f475895bab2884f0218ccd757b13dd1a8b0fe7、BE c37093f180cb5ec2d29b158d49efe77cdc01ceac。

## 2. 完了範囲・既存PR・ブランチ・SHA
Phase0: FE PR #44 https://github.com/tanku3080/battle-viewer/pull/44
branch docs/p2p-phase0-contract、head 1b3b3c29c7751f57a7554e07e3a107db824eda4f。
Phase1: BE PR #7 https://github.com/tanku3080/battle-hub/pull/7
branch feat/p2p-metadata-catalog、head 2be531a06c550992f8516c32e5538664b22408bd。
Phase2a: FE PR #45 https://github.com/tanku3080/battle-viewer/pull/45
現在の作業branch feat/p2p-phase2a-native-cache、機能実装commit 82463eb9ce857498a3da4f5a3f961bc2fc0a96b3。
この引き継ぎ記録のcommitでtipは変わるため、GitHubから最新head SHAを取得すること。
3件すべて記録時点でopen/未マージ。#45は最新developから作り、#44/#7のcommitを取り込んでいない。仕様上関連するが現時点のランタイム依存はない。後続で未マージ実装を必要とする場合は最新developから分岐し、必要commitだけを取り込み依存PRを明記する。勝手にmergeしない。

## 3. 実装詳細
Phase0 (#44): docs/P2P_ARCHITECTURE.md、p2p/protocol-v1.json、utils/p2p/manifest.ts、Node gzip/hash spikeと6件のテスト。version1/gzip、compressed8MiB/raw32MiB、metadata16KiB、目標3複製、既定cache256MiB/upload256KiB/sの設計。元JSONと実際のgzipで別々のSHA-256を持つ。Node実験であり本番通信ではない。
Phase1 (#7): 認証付き /api/v2/works POST/GET、一覧query/limit/offset、UUID詳細、所有者/明示moderatorのPOST /{id}/stop。作者をsessionから決定。JDBC/Flyway/H2ファイル永続化、PostgreSQL切替設定とCI。metadata入力16KiB、未知field/body/作者偽装/重複key/型変換/ハッシュ・サイズ不正拒否。同一所有者+contentHash重複409。本文/IP/tokenをDBへ保存しない。内容実証前なのでUNVERIFIED、downloadable=false、NO_ONLINE_PEERS、複製0/目標3固定。停止は永続・冪等。H2は永続volumeが必要、DB URL変更はデータ移行ではない。現認証は単一設定アカウントであり複数アカウント/ライセンス基盤は未実装。旧auth/refresh/forces/JSON本文は依然メモリ保存。
Phase2a (#45): 独立Rust crate crates/battle-p2p-core（edition2024/MSRV1.90、Cargo.lock付き）。TauriへのIPC接続はまだない。
- src/content.rs: encode/decode/Manifest。元UTF-8バイトを再JSON化せず保持しgzip化。両SHA256・実size検証。圧縮8MiB、解凍32MiBかつ宣言raw+1まで読む。single memberのみ、CRC/末尾/多重member/重複JSONキー/UTF8不正拒否。JSON値100万個/標準recursion制限。
- src/validation.rs: 現行Battle/Creator v1/v2、有限座標/map/time/zoom、ID/参照/階層・eventのcycle、Force、Creatorのnull任意数値を検証。未知拡張を消さない。entity合計10k、point250k、event10k、depth64、graph linksと子孫展開100k、累積event graph処理2mの上限。外部画像HTTP(S)/file/blob/SVG data/traversalをP2P専用で拒否し、組込maps/charasパスとPNG/JPEG/WebP base64+signatureを許可。従来ローカル読込は変更しない。
- src/cache.rs: Cache::open/store/read/read_raw/inventory/remove/set_quota。app所有private directoryのOS排他lock、lowercase contentHash名、単一.bvp container、検証後temp→sync→no-clobber公開。quotaにはmanifest/header/破損fileも算入。既定256MiB、0も設定可能、最大4096件。自動evictionなし、原本保護。破損は別表示し返却拒否・明示削除可能。中断.pending regular fileだけ再open時回復。symlink/不明file/path traversal拒否。別gzipで同じraw hashはConflict。
- examples/roundtrip.rsとscripts/test-p2p-native-roundtrip.mjs: 実Rust圧縮/保存/再open→既存TS Viewer/Creator importerの統合検証。
- docs/P2P_NATIVE_CORE.md: 契約、制限、将来gate。CIにWindows/Linux nativeとMSRV1.90を追加。
#45は既存UI/認証/ローカルJSON処理を変更せず、listener、広告、peer通信、外部serviceは一切起動しない。

## 4. テストと結果
今回ローカル:
- FE npm ci成功。Node20/Windowsのnpm testは既存glob展開の問題で起動失敗したため、PowerShellでtests/*.test.mjsを列挙しnode --testへ渡し87/87成功。
- npm run lint: エラー0、既存警告6。npm run buildとnpm run build:tauri成功。
- Rust cargo test --manifest-path crates/battle-p2p-core/Cargo.toml --locked: Windows45/45成功（cache9/content16/validation20）。Unixにはsymlink試験が1件追加される。
- cargo fmt --check、cargo clippy --locked --all-targets -- -D warnings成功。開発中Clippy警告は修正済。
- node scripts/test-p2p-native-roundtrip.mjs成功: 既存5sample+Creator v2の6文書で原本bytesとViewer/Creator読込結果が完全一致。階層/group切替履歴/移動とcamera位置・zoom補間を確認。
- BE develop31/31成功、PR#7 head46/46成功（H2/Flyway/context3回再起動を含む）、両package成功。今回Mockito追加agent不要。PostgreSQLは今回再実行せず、PR#7の既存CI成功を確認。
- npm ciの既存high脆弱性警告12件は残る。自動の破壊的audit fixはしていない。
既存head CI: #44 https://github.com/tanku3080/battle-viewer/actions/runs/37741851950 成功。#7 https://github.com/tanku3080/battle-hub/actions/runs/37741913767 成功。
#45 GitHub CIはPRチェックで最新commitに対する結果を取得すること。この記録作成時点では実行中。初回run https://github.com/tanku3080/battle-viewer/actions/runs/37743945295 。

## 5. 未完了・問題・未検証
Phase2b以降は未実装。実P2P A→B→C、同意・設定画面、metadata連携、発見/lease/grant、複製、rate limit、offline UI、直接再生/再編集導線、NAT/Relay試験は未完了。Windows Tauriアプリ起動・外部ネットワーク・NATは未検証。
画像は形式/base64/signatureまでで、完全decode/ピクセル数上限なし。untrustedダウンロードを描画に渡す前に画像resource制限が必要。
cacheのstoreは明示ローカル操作であり再配布許可ではない。Phase2bは既定OFFの同意を必須にする。inventoryは全件解凍検証なのでUI thread外で実行しprogress/cancelを設計。
同じraw hashで別gzipはConflict。BEは別所有者に同一rawの登録を許すため後続でrepresentation参照を設計すること。Winの突然の電源断に対するdirectory entry永続化は保証しない。同じOSユーザーの悪意ある別processによるfilesystem raceは対象外。

## 6. 次に編集するファイルと作業順序
1) GitHub最新developと#44/#7/#45のhead/merge/CIを取得し、最新handoffと現コードを読む。
2) Phase2b独立PR: src-tauri/Cargo.toml/Cargo.lock、src-tauri/src/lib.rs、新規src-tauri/src/p2p/mod.rs/settings.rs/identity.rs、utils/tauri/bridge.ts、設定component、i18n/locales/ja.json/en.json。coreをpath dependencyで利用し、app_data_dir/private cache、blocking worker、IPC、保存quota/settings/identity永続化、参加OFF/ONとIP・disk・uploadの明示説明を実装。downloadと再配布同意を分離、Web代替UI。local file経路とauthは維持。Windows/Linux native buildを検証。
3) Phase3a: src-tauri/src/p2p/network.rs等。保守されるlibp2pを検証して選択、TCP+Noise+Yamux等の暗号化direct転送、上限codec、timeout/backoff/別peer retry、loopback A→B→C。
4) Phase3b: BE src/main/java/com/tankuorganic/battlehub/work/、provider/authorization新package、DB migration。期限lease/認証付き発見/requester-provider PeerId bound短命one-use grant。転送開始ごとHubの最新権利とSTOPPEDをチェック、Hub不通時fail closed。既存単一account制約とlicense未実装を解決・明記。匿名hash DL禁止。Circuit Relay v2/DCUtRと外部NAT試験は別gate。
5) Phase4: 明示同意した別installationへ目標3複製、再複製、帯域/容量、lease失効、A offline/all offline。PeerId数を物理PC台数と断言しない。
6) Phase5: utils/battleHub/client.ts、app/hub/page.tsx、Web proxy、app/battle/page.tsx、app/create/page.tsx。投稿→一覧/詳細→P2P DL→Viewer/Creatorへ原本bytesを渡す。旧中央本文投稿は段階移行し互換維持。
7) Phase6: 最終9条件、画像resource制限・不正input・認可/停止・recovery・実ネットワーク、現コード準拠設計更新。
各Phaseは機能別実装・FE/BEテスト→成功失敗報告→push→別PR→番号URL/SHA/依存記録→引き継ぎ更新。大きければさらに分割。全機能を単一PRに詰め込まない。

## 7. 必須の互換性・運用注意
creatorState.version=2、hierarchy、group/個別移動、Timeline/Camera、Force、認証/refresh、ja/en、accessibility、Windows/Linux Tauri、Web、ローカルJSON保存/読込を破壊しない。Viewerの派生BattleDataを再JSON化して投稿するとCreator情報を失うので厳禁。
圧縮原本を複製し再圧縮しない。Hubへ新規P2P JSON本文を保存しない。作者はsession由来。STOPPED/失効/権限なしをfresh認可で拒否。P2Pによる権限迂回を作らない。IPは認可済み接続先へ見えるため明示同意し公開catalogへ出さない。token/IP loggingや任意URLのHub fetchを避ける。既にDL済みのローカルfileを遠隔消去できるとは約束しない。
DB/bootstrap/relay費用は別評価し、有料契約しない。0円と常時可用性を同一視しない。WebではP2P利用可能と偽装せず、metadata閲覧/インストール案内と既存local importを提供する。
作業を区切るたび、このプロンプトを最新PR/branch/SHA/検証結果へ更新して出力する。

以上を引き継ぎ、GitHubのFE・BE最新状態を確認したうえで、未完了の作業を続行せよ。実装・テスト・PR作成まで実施すること。現行コードを絶対的な正とし、既存機能を破壊しないこと。

