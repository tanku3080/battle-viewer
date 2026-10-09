# P2P分散共有 現行実装仕様・Phase 6残件 (2026-10-09)

> この文書は `tanku3080/battle-viewer` / `tanku3080/battle-hub` の
> 2026-10-09時点の `develop` を基準とする。FE `920dac87774f0322412dc70eebf8aa772affe912`、
> BE `b90deff5ae6ddb6fb540dec9f31e60171b23838f`。
> このPRのアップロード制限変更はまだ `develop` には反映されていない。
> 設計上の理想よりも**現行コードが正**。従来の `docs/P2P_ARCHITECTURE.md` は Phase 0時点の計画記録。

## 現行アーキテクチャ

```text
Web Next.js ──BFF/認証──┐
                       │
                       ▼
Tauri Next.js ─Rust HTTP── Battle Hub (Spring Boot)
     │                       ├─ session/refresh・作品メタデータ
     │                       ├─ DB: H2ファイル/選択式 PostgreSQL
     │                       ├─ provider lease・発見・一回限りtransfer grant
     │                       └─ 配信停止/短命認可チェック
     ▼
Rust app private cache ── libp2p TCP + Noise + Yamux ── 他の同意済みTauri
                            request-response CBOR
```

Hubは新しい `/api/v2/works` の **JSON本文を保持しない**。
ただし互換性維持のため旧 `/api/battles` APIは現行コードに残り、旧形式のJSON本文は引き続きインメモリで扱う。
Webは作品メタデータを表示可能だがP2P転送を実行しない。

## Phase別実装

| Phase | FE/BEの主な実装 | 現在の状態 |
| --- | --- | --- |
| 0 | JSON原文バイト列・gzip/SHA-256契約、8 MiB gzip/32 MiB raw上限 | FE #44 merged |
| 1 | 認証付きメタデータ一覧・登録・検索・停止、Flyway/H2/PostgreSQL | BE #7 merged |
| 2a | 独立Rust core crate、検証・atomic hash cache・quota/破損検知 | FE #45 merged |
| 2b | 永続seed/設定、同意別制御、公開PeerId、WebとDesktop分離 | FE #46 merged |
| 3a | TCP/Noise/Yamux、CBOR、loopback A→B→C、失敗ルートretry | FE #48 merged |
| 3b | PeerIdと作品に拘束した短命grant、Hub検証、leaseとreceipt | FE #49 / BE #8 merged |
| 4 | opt-in best-effort 3複製、lease renewal、停止時の再配布抑止 | FE #49 / BE #8 merged |
| 5 | Desktop投稿・取得→Viewer/Creator原文取込、catalog、i18n | FE #49 merged |
| 6 | 敵対的入力検証、画像decode検証、grant/receipt上限と時間制御 | FE #50 / BE #9 merged |
| 6後追い | 送信CBORペイロードのaggregate pacing | このPR (#51)、CI/実機検証がゲート |

## 新しい作品のデータフロー

1. ローカル編集状態 `creatorState.version=2` を含む完全な元UTF-8 JSONを保持し、Gzipと両SHA-256を作る。
2. Manifestの形式・サイズ、JSON構造とバトル内容、ラスタ画像decode・寸法を検証し、アプリ所有private cacheに保存する。
3. 認証済み作者がHubへ**メタデータだけ**を登録し、PeerId・接続先の短命leaseを提出。
4. 別の同意済みDesktopがHubで配信元を発見、仕事/Requester/Providerの認可grantを取得。
5. ProviderはNoise実接続のRequester PeerIdと短命grant、配信停止・lease・作品ハッシュをHubに照合してから配信。Hub到達不能時は拒否。
6. Receiverが原文/圧縮ハッシュ・サイズ・gzip/JSON/画像を再検証した上でcacheに確定し、元JSONをViewerまたはCreatorへ渡す。
7. 再配布に明示同意したReceiverのみ複製leaseを登録し、新しいProviderになれる。

## 容量・認可・プライバシー

- compressed 8 MiB / raw 32 MiB。cache既定256 MiB、disk超過でfail、勝手なevictionは行わない。
- 参加・ダウンロード・再配布は別同意で、すべて既定OFF。公開listenerは明示起動時だけ。
- Transfer grantは20秒・一回限り、replica receiptは15分。Hubのgrant発行はアカウントごと60回/分、インメモリgrant/receiptは各4096上限。
- STOPPED作品、失効lease、間違ったPeerId/ハッシュ、認可エラーは新規転送を拒否。
- peer IPは他の接続参加者に見える可能性があるが、公開作品リストには出さない。事前のIP広告は到達性や所有証明ではない。
- 端末に保存済みのデータは遠隔消去できない。単一設定アカウントであり、汎用ライセンス管理/複数ユーザー登録は実装していない。

## このPRのアップロード速度制御

- `PacedCodec`が従来の上限付きCBOR codecを包み、**レスポンスだけ**を `PacedWriter`で小分けに書く。独立したバイト列再シリアライズや再gzipはしない。
- 同一Tauri Swarm内の全送信ストリームが一つの `UploadLimiter`で予約時刻を共有。送信単位は最大4 KiB。部分書き込み/保留中は予約を保持。
- `settings.upload_limit_bytes_per_second` を読み、既定256 KiB/s、設定最小16 KiB/s。複数同時転送も総量の予約を共有する。
- 最大8個の8 MiB payloadを16 KiB/sで送る最悪条件を想定し、request-responseのタイムアウトを75分へ変更。
- **保証するもの**: 通常のCBORアプリケーションデータが制限以上の速度でcodecから書かれることを抑えること。
- **保証しないもの**: Noise/Yamux/TCPのヘッダ・再送を含むNIC物理転送レートの厳密上限、アップロード時間の短さ、実機でのネットワーク成功率。

## 検証と未達成

- 自動: Rust loopback A→B→C、原文維持、hash/gzip/画像異常、認可/期限/配信停止、H2・PostgreSQL、Windows native、Linux Debian、Web build。詳細は `P2P_PHASE6_ACCEPTANCE.md`。
- 新規: 同時ストリームの共有帯域と設定変更をRustテスト、codec接続をJS回帰テストで検証。
- **未実施**: 独立した実機3台、異なるNAT間の疎通、実NIC単位の暗号化通信帯域測定、Relay/DCUtR/DHTの実装と実機検証。
- P2Pのdirect TCPは、公開到達可能IPまたは同一LANなど到達可能な経路が必要。一般的なNAT越えや3複製を保証しない。追加の有料Relay/外部DB契約は行っていない。
- **リリース完了条件**: GitHub CI合格に加え、独立端末で投稿→取得→再配布→元端末offline後の取得、複数ネットワーク、悪意あるパケット、速度・容量実測を確認すること。

## 実装参照

- FE: `src-tauri/src/p2p/{network.rs,network_auth.rs,commands.rs,settings.rs,image_guard.rs}`
- FE: `crates/battle-p2p-core/src/{cache.rs,content.rs,validation.rs}`
- FE: `components/p2p/`, `app/hub/`, `app/battle/`, `app/create/`
- BE: `src/main/java/com/tankuorganic/battlehub/work/`
- 受け入れ手順: `docs/P2P_PHASE6_ACCEPTANCE.md`

これらは**すべての実機条件を満たした証明ではない**。