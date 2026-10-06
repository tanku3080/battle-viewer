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
- `appearAt` / `disappearAt`: 各timelineの先頭・末尾から自動算出
- `lod`: 未指定時は既定値を使用
- `hierarchy.roots`: `parentId == null` から自動算出
- `HierarchyNode.status`: 未指定時は `active`
- `HierarchyNode.history`: ランタイムで生成

### 正規event

| event | 意味 |
| --- | --- |
| `status` | `active / destroyed` の状態変更 |
| `reparent` | 親部隊の変更。親を `null` にすると離脱 |
| `merge` | 同階層のsourceをtargetへ吸収。sourceは消える |
| `reform` | parentやchildren/unit構成をまとめて再編 |

例:

```json
{ "t": 5, "event": "status", "target": "reg_a", "status": "destroyed" }
```

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
接続先を変更する場合は `.env.local` に設定します。

```bash
BATTLE_HUB_API_BASE_URL=http://localhost:8080
```

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

Before starting Battle Hub, configure credentials:

```bash
export BATTLE_HUB_USERNAME=admin
export BATTLE_HUB_PASSWORD='change-me'
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

The creator provides:

- collapsible element palette
- Unit / Character / Legion / Corps / Division / Regiment / Camera marks
- Status / Reparent / Merge / Reform event panels
- tooltip guidance for every palette item
- grid and center axes visible from the initial state
- drag-and-drop placement
- right-side property editor
- bottom timeline seek bar
- time-keyed position recording for Unit / Character / Camera
- fixed `pos` editing for hierarchy nodes
- generated JSON preview
- JSON file export
