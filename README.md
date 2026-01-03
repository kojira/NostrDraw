# 🎨 NostrDraw

Nostrで絵を描いて共有するWebアプリ。

**[→ 今すぐ使う](https://kojira.github.io/NostrDraw/)**

## 特徴

### 🖌️ SVGベースのお絵描き

ストロークデータをSVGとして保存。ラスタ画像と違い、拡大しても劣化しません。描画時のストロークアニメーションも再現可能。

### 🔗 描き足し（コラボレーション）

他ユーザーの作品に描き足して投稿できます。親子関係はNIP-10形式のeタグで管理され、ツリー表示で辿れます。

### 📦 SVG圧縮 & リレー投稿

SVGデータはgzip圧縮+Base64エンコードしてkind 31898イベントのcontentに格納。リレーへの負荷を最小限に。

### 🖼️ 画像自動アップロード

投稿時にSVGをPNGに変換し、NIP-96対応サーバー（share.yabu.me）に自動アップロード。kind 1イベントに画像URLを含めることで、他のNostrクライアントでもプレビュー表示されます。

### 😀 カスタム絵文字対応

NIP-30のカスタム絵文字をスタンプとして使用可能。ユーザーの絵文字リスト（kind 10030）から自動取得。

## スクリーンショット

<!-- TODO: スクリーンショットを追加 -->

## 技術仕様

### イベント

| Kind | 用途 |
|------|------|
| 31898 | NostrDraw投稿（SVGデータを含む） |
| 1 | タイムライン共有（画像URL付き） |
| 7 | リアクション |

### 対応NIP

- **NIP-07** — ブラウザ拡張機能による署名
- **NIP-30** — カスタム絵文字
- **NIP-96** — 画像アップロード（share.yabu.me）
- **NIP-98** — HTTP認証

### リレー

```
wss://yabu.me
wss://r.kojira.io
wss://x.kojira.io
```

## 開発

```bash
pnpm install
pnpm dev      # 開発サーバー起動
pnpm build    # プロダクションビルド
```

### 技術スタック

React 19 / TypeScript / Vite / nostr-tools / CSS Modules

## ライセンス

MIT

---

Made with ❤️ for the Nostr community
