# Battle Viewer / Battle Hub P2P分散共有システム 引き継ぎプロンプト
Battle ViewerとBattle HubでP2P方式のBattle JSON共有プラットフォームを段階的に実装せよ。中央Hubの保存容量・配信量・運用費を最小化する。Hubは認証、作品メタデータ、一覧検索、配信元管理、発見と転送認可を担当し、JSON本体は同意したTauri端末間でGzip転送・分散保存する。AがオフラインでもB/Cの複製から取得できる構成が最終目標。可能な限り月額0円を優先するが、常時可用性や完全無料NAT越えは保証しない。有料契約、広告・決済実装、PR自動マージは禁止する。

1. リポジトリと基準
FE: tanku3080/battle-viewer https://github.com/tanku3080/battle-viewer
BE: tanku3080/battle-hub https://github.com/tanku3080/battle-hub
両方developから作業ブランチを作る。Next.js/React/TypeScript/Tauri 2/Rust/Java 21/Spring Boot。現行ソースコードを設計書より優先する。作業開始時に最新develop、既存PRのマージ状況、CI、ブランチSHAを確認せよ。
調査時の基点: FE 58f475895bab2884f0218ccd757b13dd1a8b0fe7（#43 Creator補間保持）、BE c37093f180cb5ec2d29b158d49efe77cdc01ceac（#6 デスクトップ認証/version）。それ以前のPR #27/#28/#29等もdevelopに統合済みだった。

2. 完了したPhaseとPR
Phase 0完了: FE PR #44 https://github.com/tanku3080/battle-viewer/pull/44
ブランチ docs/p2p-phase0-contract。
機能実装SHA fe17ef7b0ec6b7fb73e3a2e3e75819dcc7b679f2、検証済みチェックポイントSHA 68cc6ac18a642a425caa432b24a3d04de8404ec2。
Phase 1完了: BE PR #7 https://github.com/tanku3080/battle-hub/pull/7
ブランチ feat/p2p-metadata-catalog。
API実装SHA baa9ad4cd5c5354d5d0aa82d928b06e69db6c636、検証済みチェックポイントSHA 1b27d565f5326c826c172ccac3b72ec00bbd9aec。
両PRは未マージ。相互にランタイム依存しない。仕様の関係はPR本文に記録済み。引き継ぎ文の保存コミットで各ブランチtipは変わり得るため、最新head SHAはGitHubから確認せよ。未マージPRをdevelopに存在するものとして扱うな。

3. Phase 0の実装
docs/P2P_ARCHITECTURE.md: ソース調査、段階設計、通信/認可/NAT/費用/互換性/未完了マトリクス。
p2p/protocol-v1.json: protocolVersion=1、gzip、SHA-256、圧縮8MiB/解凍32MiB/metadata16KiB、目標3複製、lease90秒/grant30秒、cache256MiB/upload256KiB毎秒の初期仕様。
utils/p2p/manifest.ts: フォーマット・ハッシュ・整数サイズ・上限の検証。
scripts/p2p-content-spike.mjs: Nodeの実験用Gzip/ハッシュ/上限付き解凍。
tests/p2p-content.test.mjs: サンプル5件のバイト保存・Viewer互換、Creator v2/階層/グループ切替/補間保持、破損/偽装/過大解凍/不正UTF-8/JSONの拒否。
contentHashは元の完全なUTF-8 JSONバイト列、compressedHashは実際に保存するGzipバイト列。複製先は再圧縮せず同じGzipをコピーする。Viewerが作る派生BattleDataを再JSON化して共有してはならない。Creator情報が失われる。
このNode実験は本番Rust通信ではない。Battleスキーマの完全なセマンティック検証とネイティブ実装は未完了。

4. Phase 1の実装
/api/v2/works:
POST 登録、GET 一覧（query/limit/offset）・UUID詳細、POST /{id}/stop。
全ルートで既存Bearerセッション認証を要求する。作者と所有者は認証済みusernameから確定する。
metadata-onlyのDTO: title/description/protocolVersion/encoding/contentHash/compressedHash/compressedSize/uncompressedSize。
登録JSONの本文、authorName/ownerUsername、peerAddress等の未知フィールドを拒否する。入力読込前に認証し、Content-Lengthなしでも16KiBで上限をかける。重複キー・後続JSON・文字列/小数の数値変換、不正ハッシュ・サイズ・タイトルを拒否する。タイトル200文字、説明2000文字、一覧limit1..100/offset0..1000000/query200文字。SQL検索はパラメータ化し、%/_をワイルドカード化しない。
JDBC/Flywayのp2p_work_metadataテーブルへID、作者、説明、server UTC日時、ハッシュ、サイズ、protocol、目標複製3、ACTIVE/STOPPEDを保存する。JSON本体、IP、token列は持たない。同一所有者+contentHashの重複は409。
既定は同じHubプロセスのH2ファイル ./data/battle-hub。application-postgres.ymlとPostgreSQL driver/Flyway moduleで切替可能。永続ディスクが必要。DB URL変更だけではH2→PostgreSQLデータ移行にならない。
所有者または明示設定BATTLE_HUB_MODERATOR_USERNAME（既定空）のみが配信停止できる。停止は冪等・永続。他者は403。
ピア登録・実ファイルの検証はまだ無いので全作品contentValidation=UNVERIFIED、replicaCount=0、onlineReplicaCount=0、downloadable=false、downloadStatus=NO_ONLINE_PEERS（停止時STOPPED）。登録成功をダウンロード可能と表示するな。
主なファイル: pom.xml、src/main/resources/application.yml/application-postgres.yml/db/migration/V1__p2p_work_metadata.sql、src/main/java/com/tankuorganic/battlehub/work/ のWorkController/WorkService/WorkRepository/WorkRequestReader/DTO/例外処理、src/test/java/com/tankuorganic/battlehub/work/、src/test/resources/application.yml、.github/workflows/ci.yml、docs/P2P_METADATA_API.md。
旧/api/battles、/api/forces、認証/refresh、client versionの契約は維持。旧JSON本文、auth/session/refresh、forceは従来どおりメモリ保存。現BEは単一設定アカウントであり、複数ユーザー登録・ライセンス権利DBは無い。この制約を完成済みと誤認するな。

5. 実行済みテスト
FE: npm ci、93テスト（既存87+追加6）成功。lintエラー0、既存警告6。Web本番/TypeScript/Tauri静的FEビルド成功。GitHub verifyとLinux Tauri Debianビルド成功。audit critical成功だが既存high警告12件が残る。
FE CI: https://github.com/tanku3080/battle-viewer/actions/runs/37739749019 （68cc6ac時点）。
BE: ローカルJava 21で46テスト（既存31+追加15）・package成功。Hub全contextを3回起動/終了してH2ファイルのmetadataと停止状態が残ることを検証した。
BE GitHub: H2全46件、実PostgreSQL 16.15全46件、Flyway migration、package全成功。
さらに本番JARを実HTTPで3回起動し、既定H2ファイル、登録/検索/詳細、JVM再起動後の完全一致、停止状態の永続化、旧セッション失効を確認した。元sample2は24664bytes、gzip1917bytesでmetadataへハッシュ/サイズだけを送信した。実P2P転送ではない。
BE CI: https://github.com/tanku3080/battle-hub/actions/runs/37740633961 （1b27d565時点）。
初回ローカルはMockitoの動的アタッチ不可で28件が初期化エラー。ローカル起動時だけMockito-core-5.17.0.jarを-javaagentで指定して解消した。続いて旧一覧テストが他クラスのメモリ投稿を拾って1件失敗したため、BattleApiIntegrationTestを@BeforeClass相当のDirtiesContextで分離して解消した。製品側の制約や認証を緩めていない。
Java 21ローカル実行で必要だった環境証明書はシステムJava trustStoreを使用した。SSL検証を無効化していない。

6. 未完了と次の編集
Phase 2a: Rustで元バイト列保持、Gzip圧縮/解凍、両SHA-256、厳格UTF-8/JSON/Battleスキーマ、解凍上限、原子保存、ハッシュ名パス、quota/破損回復を実装せよ。
編集候補: src-tauri/src/p2p/content.rs、cache.rs（新規）、src-tauri/Cargo.toml/Cargo.lock、native tests。可能なら独立core crateにしてGUIなしでもcargo test可能にする。
Phase 2b: src-tauri/src/lib.rs、utils/tauri/bridge.ts、設定UI、i18n/locales/ja.json/en.jsonにIPC、保存設定、identity、参加ON/OFFを追加せよ。既定OFF、同意が無ければ共有listener/advertisement/re-replicationを動かすな。
Phase 3a: src-tauri/src/p2p/network.rs等で保守されるRust libp2pを選択し、暗号化direct接続、上限付きrequest-response、切断・タイムアウト・複数配信元retryを実装。最初にloopbackでA→B→Cの実転送を検証。
Phase 3b: BE work/provider/authorizationへ永続provider登録・期限付きlease、認証付き発見、requester/provider PeerIdに紐づく短命・一度限りgrantと転送開始時のHub検証を実装。WorkResponseの0固定を実状態へ置換。現単一アカウントから必要なユーザー/権利管理の移行もソース確認の上で設計せよ。
Phase 4: 3複製目標、同意した別installation、再複製、lease失効、帯域/容量、source offline/all offlineの状態表示。PeerIdが3個あるだけで物理PC3台と断言するな。
Phase 5: utils/battleHub/client.ts、app/hub/page.tsx、Web API proxy、Tauri commands、app/battle/page.tsx、app/create/page.tsxをつなぐ。登録→一覧→詳細→P2P DL→Viewer直接再生→Creator再編集。旧中央投稿から段階移行し、明示方針の下で本文保存経路を退役させる。
Phase 6: 実ネットワーク結合・不正入力/認可/停止/復旧の検証、最新ソースに基づく設計書更新。Windows/Linux nativeビルドとWeb互換を確認する。

7. セキュリティ・費用・既存仕様
Hubでlicense/accountの認可を維持し、providerは接続PeerIdとfresh grantを各転送開始時に検証する。STOPPED/失効/不許可/Hub到達不能はfail closed。匿名ハッシュ指定で本文を返す経路を作るな。既存公開ソースに無いlicense機能を実装済みと見なすな。停止済み作品のstale lease/grantを拒否し、複製広告を撤回する。既に保存されたローカルファイルを遠隔消去できるとは約束しない。
同意UIにIP/ネットワークアドレスが他参加者へ開示されること、disk/upload帯域、再配布の説明を含める。download同意とreplica参加を分ける。OFF時は共有とleaseを止める。IPを公開作品一覧へ出さない。住所等の任意URLをHubで取得してSSRFを作るな。
libp2p TCP+Noise+Yamux、Identify/Ping、上限付きcodecを初期候補とする。NAT用Circuit Relay v2/DCUtRは公開Relayが必要になる。無料Relayや一般NAT越えの成功を保証するな。LAN/directと外部NAT検証を分ける。必要有料relayはregion/load/bytesで費用を評価し、勝手に契約するな。Hub、metadata DB、常駐bootstrap、Relay費用を別評価する。今回は有料サービス/外部DB契約をしていない。
creatorState.version=2、階層、グループと個別移動、Timeline/Camera補間、Force、認証/refresh、ja/en i18n、アクセシビリティ、Windows/Linux Tauri、Web、ローカルJSON保存・読込を維持せよ。WebでP2Pが未対応ならmetadata閲覧とインストール版案内を提供する。UIで利用可能なように偽装しない。
最終操作 A投稿→Hub一覧→B取得/再生→AオフラインでBからC取得、複製、全ピアoffline表示、整合性、Creator編集情報の保持はまだ未達成。Phase 0/1で全体完成とは報告しない。Windows実行、実P2P転送、NAT/Relay、peer復旧は未検証。

8. 実行命令
最初に両リポジトリの最新developとPR #44/#7のhead・CI・merge状態を取得せよ。マージされていなければ必要な変更だけを取り込み、その依存をPRに明記する。ソースと既存テストを読み、Phase 2aの小さな動作単位から続行せよ。設計だけで終了せず、実装・テスト・GitHub Push・独立PR・CI確認まで実施する。全機能を単一PRへ入れず、自動マージしない。各PRのURL/番号/branch/SHA/成功失敗テスト/未検証範囲を記録し、各完了時と中断時にこの単独で理解できる引き継ぎ文を更新して出力せよ。

以上を引き継ぎ、GitHubのFE・BE最新状態を確認したうえで、未完了の作業を続行せよ。実装・テスト・PR作成まで実施すること。現行コードを絶対的な正とし、既存機能を破壊しないこと。
