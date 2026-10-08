# Tauri build guide

Battle Viewer の Tauri 配布ビルド手順をまとめます。

この手順は以下を対象にします。

- Ubuntu / WSL で Linux `.deb` を生成
- Ubuntu / WSL から Windows x64 用 NSIS `.exe` をクロスコンパイル
- 実際に発生したビルドエラーの対処

## 共通準備

リポジトリルートで依存関係を入れます。

```bash
npm ci
```

Next.js の開発時キャッシュに古い Route Handler の型情報が残っていると、
Tauri 用 static export で `app/api` を一時退避した際に型チェックが失敗することがあります。

ビルド前に `.next` を削除してください。

```bash
rm -rf .next
```

## Linux .deb build

### 必要パッケージ

Ubuntu / WSL:

```bash
sudo apt update
sudo apt install -y \
  pkg-config \
  libdbus-1-dev \
  libglib2.0-dev \
  libgdk-pixbuf-2.0-dev \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf
```

### Build

```bash
rm -rf .next
npm run tauri build -- --bundles deb
```

生成物:

```text
src-tauri/target/release/bundle/deb/
```

Linux 実行ファイル本体:

```text
src-tauri/target/release/app
```

## Windows x64 NSIS build from Ubuntu / WSL

WSL / Ubuntu 上から Windows x64 向けにクロスコンパイルします。

### 1. Cross build tools

```bash
sudo apt update
sudo apt install -y nsis lld llvm clang-18
```

### 2. Rust Windows target

```bash
rustup target add x86_64-pc-windows-msvc
```

### 3. cargo-xwin

```bash
cargo install --locked cargo-xwin
```

### 4. clang-cl

`cargo-xwin` で Windows/MSVC 向け依存 crate をビルドする際、
`ring` などが `clang-cl` を要求します。

まず確認します。

```bash
which clang-cl
```

パスが表示されれば追加作業は不要です。

Ubuntu 24.04 で `clang-18` は存在するが `clang-cl` コマンドが存在しない場合は、
`clang-18` を `clang-cl` 名で呼べるようにします。

```bash
sudo rm -f /usr/local/bin/clang-cl
sudo ln -s /usr/bin/clang-18 /usr/local/bin/clang-cl
```

確認:

```bash
which clang-cl
clang-cl --version
```

期待例:

```text
/usr/local/bin/clang-cl
Ubuntu clang version 18.x.x ...
```

### 5. Windows NSIS build

```bash
rm -rf .next

npm run tauri build -- \
  --runner cargo-xwin \
  --target x86_64-pc-windows-msvc \
  --bundles nsis
```

`--bundles nsis` のため、生成するインストーラー形式は NSIS のみです。
Linux `.deb` や Windows `.msi` を同時生成する指定ではありません。

生成物:

```text
src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/
```

Windows 実行ファイル本体は以下の target 配下に生成されます。

```text
src-tauri/target/x86_64-pc-windows-msvc/release/
```

## 初回クロスコンパイルが遅い理由

初回は `cargo-xwin` が Windows CRT / SDK を取得し、
Rust / Tauri / WebView2 / TLS 関連などの依存 crate を
`x86_64-pc-windows-msvc` 向けにコンパイルします。

そのため初回は時間がかかります。

2回目以降は主に以下のキャッシュが再利用されます。

```text
~/.cache/cargo-xwin/
src-tauri/target/x86_64-pc-windows-msvc/
```

通常は初回より大幅に短縮されます。

## Troubleshooting

### `.next/dev/types/validator.ts` から app/api が見つからない

例:

```text
Cannot find module '../../../app/api/auth/login/route.js'
```

対処:

```bash
rm -rf .next
npm run tauri build -- --bundles deb
```

Windowsクロスビルドの場合も、ビルド前に `.next` を削除します。

### dbus-1 が見つからない

例:

```text
The system library `dbus-1` required by crate `libdbus-sys` was not found.
```

対処:

```bash
sudo apt install -y libdbus-1-dev pkg-config
```

### glib / gobject / gio / gdk-pixbuf が見つからない

対処:

```bash
sudo apt install -y \
  libglib2.0-dev \
  libgdk-pixbuf-2.0-dev \
  libgtk-3-dev \
  pkg-config
```

### clang-cl が見つからない

例:

```text
failed to find tool "clang-cl": No such file or directory
```

`clang-18` を確認します。

```bash
clang-18 --version
```

存在する場合:

```bash
sudo rm -f /usr/local/bin/clang-cl
sudo ln -s /usr/bin/clang-18 /usr/local/bin/clang-cl
clang-cl --version
```

その後Windowsクロスビルドを再実行します。

## npm audit output

`npm ci` 後に high severity vulnerabilities が表示されても、
それ自体は Tauri ビルド失敗を意味しません。

依存関係の更新はビルド手順とは分けて検討してください。


### WSL / Linux で日本語が豆腐・文字化けして見える

Tauri の Linux 開発実行は WebKitGTK を使用します。WSL / WSLg 環境では
CJK フォントがホスト側に十分入っておらず、日本語 glyph が欠落して見える場合があります。

現在の Battle Viewer は Next.js の `Noto Sans JP` を Web Font として読み込み、
アプリ側の第一フォントに指定しているため、通常は OS の日本語フォントへ依存しません。

それでも開発環境で fallback font を確認したい場合は次を追加できます。

```bash
sudo apt update
sudo apt install -y fonts-noto-cjk
fc-cache -f
```

確認:

```bash
fc-match "Noto Sans JP"
fc-match sans-serif:lang=ja
```

重要: 日本語ソース自体は UTF-8 のため、Web版では正常で Tauri/Linux のみ崩れる場合は、
文字コード変換ではなく WebKitGTK / Fontconfig の glyph fallback を先に疑います。
