# 🎨 NostrDraw

Nostrプロトコルを使ったお絵描き＆共有サービスです。絵を描いてフォロイーに送ったり、届いた絵を見たりできます。

## 🎍 New Year 2026 キャンペーン開催中！

現在、年賀状キャンペーンを開催中です。干支テンプレートや新年向けスタンプを使って、オリジナルの年賀状を作成・送信できます！

## 機能

### 🖌️ お絵描き機能
- **フリーハンド描画**: ペンと消しゴムで自由に描く
- **テンプレート選択**: 干支テンプレートなど多彩な背景
- **スタンプ**: 内蔵スタンプ + NIP-30カスタム絵文字対応
- **複数テキストボックス**: 自由な位置・サイズでメッセージを配置
- **フォント選択**: 30種類以上の日本語Google Fonts
- **Undo/Redo**: Ctrl+Z / Ctrl+Shift+Z でやり直し

### 📤 送信機能
- **宛先選択**: フォロイーからインクリメンタル検索
- **NIP-07署名**: nos2x、Alby等で安全に送信
- **kind 1 エクスポート**: 他クライアントで投稿用テキストをコピー

### 📬 受信ボックス
- 届いた絵の一覧表示
- 送った絵の一覧表示
- カードフリップアニメーション

### 📱 レスポンシブ対応
- スマホでもタッチ操作で快適に編集
- リサイズハンドルのモバイル最適化

## 技術仕様

### イベント形式

kind: 31989（Parameterized Replaceable Event）

```json
{
  "kind": 31989,
  "tags": [
    ["d", "2026-<recipient_pubkey>"],
    ["p", "<recipient_pubkey>"],
    ["year", "2026"]
  ],
  "content": "<構造化データJSON（SVG、メッセージなど）>"
}
```

### デフォルトリレー

- wss://yabu.me
- wss://r.kojira.io
- wss://x.kojira.io

## 開発

### 必要環境

- Node.js 20以上
- pnpm（推奨）または npm

### セットアップ

```bash
# 依存関係のインストール
pnpm install

# 開発サーバーの起動
pnpm dev

# ビルド
pnpm build

# プレビュー
pnpm preview
```

### 技術スタック

- React 19
- TypeScript
- Vite
- nostr-tools
- CSS Modules

## ライセンス

MIT

## 関連リンク

- [Nostr Protocol](https://nostr.com/)
- [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md)
- [NIP-30 Custom Emoji](https://github.com/nostr-protocol/nips/blob/master/30.md)
