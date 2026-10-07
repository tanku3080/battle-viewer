# Battle Viewer

JSONでユニット・部隊階層・カメラの時間変化を定義し、Canvas上で可視化するビューアーです。

## JSONの正規仕様

新しく作成するJSONは、**定義**と**時間変化**を分けます。
同じtimelineを複数箇所へ重複記述しないでください。

```json
{
  "title": "サンプル",
  "map": {
    "image": "/maps/sample.svg",
    "width": 2400,
    "height": 1350,
    "coordinateOrigin": "center"
  },
  "units": [
    {
      "id": "red1",
      "force": "red",
      "name": "赤1",
      "color": "#ef4444",
      "icon": null
    }
  ],
  "timeline": {
    "camera": [
      { "t": 0, "x": 0, "y": 0, "zoom": 1 }
    ],
    "units": {
      "red1": [
        { "t": 0, "x": -300, "y": 0 },
        { "t": 5, "x": 100, "y": 50 }
      ]
    }
  }
}
```

### 自動算出・省略可能

- `duration`: units / characters / camera / events の最大 `t` から自動算出
- `appearAt`: Unit / Characterはtimelineの先頭から自動算出
- `destroyAt`: 破壊フラグを使用した場合のみJSONへ保存
- `lod`: 未指定時は既定値を使用
- `hierarchy.roots`: `parentId == null` から自動算出
- `HierarchyNode.status`: 未指定時は `active`
- `HierarchyNode.history`: ランタイムで生成

### 正規event

| event | 意味 |
| --- | --- |
| `reparent` | 親部隊の変更。親を `null` にすると離脱 |
| `merge` | 同階層のsourceをtargetへ吸収。sourceは消える |
| `reform` | parentやchildren/unit構成をまとめて再編 |

破壊はeventではなく、対象要素の `destroyAt` へ統一します。

```json
{
  "id": "unit_a",
  "destroyAt": 12
}
```

旧 `status / destroyed` eventは既存JSON読込互換のためReader側では引き続き受理しますが、新規Creatorからは生成しません。

例:

```json
{ "t": 10, "event": "reparent", "target": "reg_a", "parent": "div_b" }
```

```json
{ "t": 15, "event": "merge", "source": "reg_a", "target": "reg_b" }
```

旧JSONの `destroyed / detach / transfer` は読み込み時に正規eventへ変換されるため、既存JSONとの互換性は維持します。
旧 `meta.title / meta.duration`、unit/character内timeline、トップレベルcameraも読み込み互換用として残していますが、新規JSONでは使用しません。

## 開発

```bash
npm ci
npm run lint
npm test
npm run build
```


## Battle Hub連携

Battle HubのSpring Boot APIを先に起動します。

```bash
# battle-hub
mvn spring-boot:run
```

Battle Viewerはデフォルトで `http://localhost:8080` のBattle Hubへ接続します。

ローカル開発では `.env.example` をコピーして `.env` を使います。

```bash
cp .env.example .env
```

```dotenv
BATTLE_HUB_API_BASE_URL=http://localhost:8080
```

Next.jsはルートの `.env` を自動で読み込みます。`.env` はGit管理対象外です。

Battle Viewer側はブラウザからSpring Bootへ直接アクセスせず、Next.jsのRoute Handlerを経由します。

```text
Browser
  -> /api/battle-hub/*
  -> Next.js Route Handler
  -> Battle Hub Spring Boot /api/*
```

Battle画面でJSONを読み込むと「Battle Hubへ投稿」ボタンが有効になります。
投稿者名と説明を入力して、読み込んだ元JSONをBattle Hubへ送信できます。
画面上の `Hub接続中 / Hub未接続` で `GET /api/health` の疎通状態を確認できます。


## Login

The initial route `/` is the login screen. Battle Hub owns the session state.

Before starting Battle Hub, configure its repository-root `.env`:

```dotenv
BATTLE_HUB_USERNAME=admin
BATTLE_HUB_PASSWORD=your-local-password
BATTLE_HUB_SESSION_TIMEOUT=PT1H
```

Battle Viewer stores the backend session token only in an HttpOnly cookie through
the Next.js auth proxy.

Protected routes:

- `/home`
- `/battle`
- `/create`

User activity is shared through `localStorage`. If no operation occurs for one
hour, the next pointer / keyboard / wheel / touch operation logs the user out and
returns to `/`. While the user is active, the FE touches the backend session at
most once per minute so the backend idle timeout and browser idle timeout stay
aligned.

## Battle JSON Creator

The authenticated title screen now has:

- `閲覧`: opens the existing Battle Viewer
- `作成`: opens `/create`
- `Battle Hubにアクセス`: Battle HubのHealth Check成功時のみ有効。投稿済みBattle一覧を表示する `/hub` を開く

The creator provides:

- collapsible side panel
- `要素パネル` / `階層` の2タブ
- Unit / Character / Legion / Corps / Division / Regiment / Camera marks
- tooltip guidance for every palette item
- grid and center axes visible from the initial state
- drag-and-drop placement
- right-side property editor
- bottom timeline seek bar
- 再生 / ストップ
- time-keyed position recording for Unit / Character / Camera
- シーク時刻に応じたkeyframe位置の復元・補間
- fixed `pos` editing for hierarchy nodes
- generated JSON preview
- JSON file export


## Creator coordinate system

新規作成画面は `coordinateOrigin: "center"` 固定です。ユーザーが原点方式を選択するUIはありません。

```text
          +Y
           ↑
           |
-X  ←---- (0,0) ----→ +X
           |
           ↓
          -Y
```

Canvas内部は左上原点・下方向が+Yですが、Battle JSONのcenter座標は上方向を+Yとして扱います。
Viewer読み込み時に内部Canvas座標へ変換するため、作成画面と閲覧画面で上下方向が一致します。

Unit / Character / Cameraは、配置または移動した時点のシーク時刻へkeyframeを記録します。

例:

```text
0秒でA地点へ配置
↓
3秒へシーク
↓
B地点へ移動
↓
0秒へシーク
↓
A地点へ戻る
```

0〜3秒の間はA地点からB地点へ線形補間して表示されます。


## Creator required properties

作成画面では、配置済み要素の一部プロパティを必須入力として扱います。

- Unit / Character / Legion / Corps / Division / Regiment: `id`
- Camera: `zoom`

必須値が未入力の配置要素がある場合:

### JSON確認

警告ダイアログを表示します。

```text
現在画面上に配置された要素の内、赤いアウトラインが表示されている要素に入力必須のプロパティが空です。空の場合JSON確認の際、当該要素はJSONに表示されません。
```

- OK: 未完成要素を除外したJSONを表示
- NO: JSON確認をキャンセル
- 未完成要素は赤いアウトラインで表示

### JSON保存

警告ダイアログを表示します。

```text
画面上に配置されている要素のプロパティに入力必須な入力欄が空の要素があります。要素を削除するか、入力必須欄に記入してください
```

- OKのみ表示
- JSONファイルは保存しない
- OK押下後、未完成要素を赤いアウトラインで表示

右側プロパティの必須欄には `*` を表示し、未入力時は
`必須入力フォームです` と表示します。

配置済み要素は右側プロパティの `要素を削除` から削除できます。


## Creator appearance / destruction

作成画面で要素をD&D配置した時刻が、その要素の出現時刻になります。

例:

```text
3秒へシーク
↓
Unitを配置
↓
0秒へ戻す
↓
Unitは存在しない
↓
3秒になると出現
```

Unit / Characterはtimelineの最初のkeyframeを出現時刻として扱います。
Hierarchy要素はCreatorが `appearAt` をJSONへ保存します。

Cameraは戦場上の実体ではなくカメラキーフレームのため、破壊フラグ対象外です。

Unit / Character / Legion / Corps / Division / Regimentのプロパティには
`破壊フラグ`があります。

破壊フラグをONにすると `破壊秒数` を設定できます。

```text
destroyAt到達時      -> 通常表示
destroyAt + 0.0〜0.5s -> alpha 1→0 / scale 1→0.2
destroyAt + 0.5s以降  -> 非表示
```

生成JSON例:

```json
{
  "id": "blue2",
  "name": "青軍2",
  "destroyAt": 18
}
```

`public/sample-battle.json` の `blue2` は `destroyAt: 18` のサンプルとして、
18秒から0.5秒かけてフェードアウトし、その後表示されなくなります。

以前Creatorに存在した `Status` パレットは削除し、破壊表現は破壊フラグへ統一しています。


## Creator side panel / hierarchy

左サイドパネルは以下の2タブです。

- `要素パネル`
- `階層`

`要素パネル`には配置対象だけを表示します。

- Unit
- Character
- Legion
- Corps
- Division
- Regiment
- Camera

Creator上では `Merge / Reparent / Reform` を直接操作させません。

`階層`タブでは、Cameraを除く配置済み要素を戦闘名の配下にツリー表示します。
戦闘名の初期値は `バトル` です。

許可される軍事階層は以下だけです。

```text
戦闘名
├─ Legion
│  └─ Corps
│     └─ Division
│        └─ Regiment
│           └─ Unit
└─ Character
```

Characterは戦闘名直下固定です。
Unit配下へUnitを置くなど、階層順序に反するD&Dは受け付けません。

階層タブでD&Dすると、子要素の `parentId` を親要素のIDへ自動更新します。
戦闘名へ戻すと `parentId` を空にします。
右側プロパティで `parentId` を手入力した場合も階層表示へ反映します。

破壊フラグが設定された要素も、Canvas上でフェードアウトした後も階層タブには残ります。

## Creator camera preview

Cameraを作成画面へ配置すると、Camera中心を基準とした赤い四角の描画範囲を表示します。

- Camera移動 → 赤枠も移動
- zoom増加 → 赤枠縮小
- zoom減少 → 赤枠拡大
- シーク時刻ごとのCamera位置・zoomをtimelineへ保存
- 再生・シーク中もCamera timelineを補間して赤枠へ反映

Cameraは戦場上の実体ではないため階層タブには表示せず、破壊フラグも持ちません。
