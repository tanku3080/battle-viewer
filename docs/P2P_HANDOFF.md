# P2P共有システムの引き継ぎプロンプト（Phase 0完了）
Battle Viewer / Battle HubのP2P分散共有を段階的に実装せよ。中央Hubは認証、作品メタデータ、配信元情報、ピア発見と転送認可を管理し、JSON本体は同意したTauri端末間でGzip転送・複製する。中央容量と配信費の削減を目的とし、月額0円を優先する。有料契約、決済、広告実装、自動マージは禁止。

FE: tanku3080/battle-viewer、BE: tanku3080/battle-hub。両方developが基準。作業開始時にGitHubの最新develop、PR、CIを確認せよ。現行コードを設計書より優先する。

完了: Phase 0。FE PR #44 https://github.com/tanku3080/battle-viewer/pull/44 は作成済み、未マージ。実装コミット fe17ef7b0ec6b7fb73e3a2e3e75819dcc7b679f2、ブランチ docs/p2p-phase0-contract、基点58f475895bab2884f0218ccd757b13dd1a8b0fe7。
CI https://github.com/tanku3080/battle-viewer/actions/runs/37738444273 成功。自動PR本文も成功。
実装: docs/P2P_ARCHITECTURE.md、p2p/protocol-v1.json、utils/p2p/manifest.ts、scripts/p2p-content-spike.mjs、tests/p2p-content.test.mjs。
Gzipの元バイト列と圧縮バイト列のSHA-256を別々に管理し、圧縮8MiB/解凍32MiB、メタデータ16KiBを上限とする。Creator v2、階層、グループ切替、移動/カメラ補間を捨てずに共有する。Nodeの圧縮実験は本番P2P通信ではない。

FE検証: npm ci、93テスト、lint（エラー0・既存警告6）、Web本番ビルド、Tauri静的FEビルド成功。GitHub Linux TauriパッケージCI成功。audit criticalは成功したが、既存のhigh警告12件がある。Windows実行と実ネットワークNATは未検証。

BE基点 c37093f180cb5ec2d29b158d49efe77cdc01ceac、作業ブランチ feat/p2p-metadata-catalog は作成済み。Phase 1は実装・検証中でPR未作成、実装コードはまだPushしていない。
Phase 1の仕様: /api/v2/works のPOST登録、GET一覧・検索・詳細、POST/{id}/stop。認証済みユーザーから作者/所有者を確定する。タイトル/説明、元/圧縮ハッシュ、サイズ、投稿日、配信停止をFlyway/JDBCで永続化する。既定は同じHub端末のH2ファイルDB、PostgreSQLは設定で切替。全APIは既存Bearer認証を維持する。metadata-onlyなので登録時のJSON検証は未確認であり、downloadable=false、NO_ONLINE_PEERS、複製数0、目標3を返す。旧/api/battlesは移行のため維持する。

BEの編集対象: pom.xml、src/main/resources/application.yml、application-postgres.yml、db/migration/V1__p2p_work_metadata.sql、src/main/java/com/tankuorganic/battlehub/work/ のWorkController/WorkService/WorkRepository/WorkRequestReader/DTO/例外処理、src/test/java/com/tankuorganic/battlehub/work/、.github/workflows/ci.yml、docs/P2P_METADATA_API.md。
BEの実装がremoteに無ければこの仕様から再構築せよ。認証前の入力読込を避け、未知のbody/author/IPフィールド、重複JSONキー、型変換、ハッシュ/サイズ異常を拒否する。未登録ピアをオンラインと見なすな。所有者または明示的なmoderatorだけが配信停止できるようにする。H2でHubの完全再起動、実PostgreSQLでmigration/API、全認証/force/legacyテストを実行し、別PRを作成してCIを確認せよ。

残り: Phase 1の完了、Phase 2 Rust保存/容量/参加設定、Phase 3 libp2p転送/発見/認可/再試行、Phase 4同意付き3複製/再複製/障害対応、Phase 5 Hub一覧詳細とViewer/Creator連携、Phase 6結合/セキュリティ/設計書更新。
次のRust編集候補: src-tauri/src/p2p/content.rs、cache.rs、network.rs、src-tauri/src/lib.rs、Cargo.toml/Cargo.lock。FE連携候補: utils/tauri/bridge.ts、utils/battleHub/client.ts、app/hub/page.tsx、app/battle/page.tsx、app/create/page.tsx、i18n/locales/ja.json/en.json。

注意: 分散保存は初期OFFで明示同意が必要。IP公開、ディスク、帯域、再配信の説明を行う。キャッシュ256MiB/アップロード256KiB毎秒を既定候補にする。Hub HTTPS認可と実PeerIdに紐づく短命grantを各転送開始時に確認し、停止作品やHub停止時は認可をfail closedにする。匿名のハッシュ指定DLを作るな。NATはlibp2p Circuit Relay v2/DCUtRを候補とし、直接LAN接続と実NAT/Relay検証を区別する。公開Relayなしに完全NAT越えや常時可用性を保証するな。Hub/DB/Relayの費用を分け、有料サービスを勝手に契約するな。

互換仕様: creatorState.version=2、階層、個別/グループ移動、Timeline/Camera、Force、認証/refresh、ja/en i18n、アクセシビリティ、Windows/Linux Tauri、Web、ローカルJSON保存/読込を保持せよ。現在のBEは単一設定アカウントで、認証/force/旧本文はメモリ保存。P2P追加で権限や将来のライセンス認可を迂回するな。Webはまずメタデータ閲覧とインストール版案内を用意し、P2Pが使えるように見せるな。

各機能で最新developからブランチを作り、未マージPR依存を明記し、実装・テスト・Push・PR・CI確認を行え。大きな単一PRは禁止。各PR完了時にこの完全な引き継ぎ文を更新・出力せよ。全体完了条件はA投稿→Hub一覧→B取得/再生→AオフラインでもBからC取得、複製、全ピアオフライン表示、SHA検証、Creator再編集保持。未実装/未検証を完了と報告するな。

以上を引き継ぎ、GitHubのFE・BE最新状態を確認したうえで、未完了の作業を続行せよ。実装・テスト・PR作成まで実施すること。現行コードを絶対的な正とし、既存機能を破壊しないこと。
