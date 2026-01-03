# 🎨 NostrDraw

Nostrで絵を描いて共有するWebアプリ。

**[→ 今すぐ使う](https://kojira.github.io/NostrDraw/)**

## 特徴

- **ブラウザで完結** — インストール不要、NIP-07拡張機能で署名
- **描き足し機能** — 他ユーザーの作品に描き足してコラボレーション
- **NIP-96対応** — 投稿時に画像を自動アップロード、kind 1で共有
- **カスタム絵文字** — NIP-30対応、お気に入りの絵文字をスタンプとして使用

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
