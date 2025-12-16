# 🎍 Nostr年賀状

Nostrプロトコルを使った年賀状サービスです。フォロイーに年賀状を送ったり、届いた年賀状を見たりできます。

## 機能

- **認証**: NIP-07拡張機能（nos2x、Albyなど）でログイン、またはnpubを入力して閲覧
- **リレー設定**: デフォルトリレー + NIP-07からリレー設定を取得
- **宛先選択**: フォロイーからインクリメンタル検索で選択
- **年賀状作成**:
  - お絵描きキャンバスで自由に描く
  - 干支ギャラリーから選ぶ
  - 画像URLを直接入力
  - ひと言メッセージを追加
  - 4種類のレイアウトから選択
- **年賀状閲覧**:
  - 届いた年賀状の件数表示
  - 送った年賀状の一覧
  - カードフリップアニメーションで表示

## 技術仕様

### 独自kind

年賀状は `kind: 31989`（Parameterized Replaceable Event）として送信されます。

```json
{
  "kind": 31989,
  "tags": [
    ["d", "2025-<recipient_pubkey>"],
    ["p", "<recipient_pubkey>"],
    ["image", "<image_url>"],
    ["message", "<メッセージ>"],
    ["layout", "<レイアウトID>"],
    ["year", "2025"]
  ],
  "content": "<構造化データJSON>"
}
```

### デフォルトリレー

- wss://yabu.me
- wss://r.kojira.io
- wss://x.kojira.io

## 開発

### 必要環境

- Node.js 20以上
- npm

### セットアップ

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev

# ビルド
npm run build

# プレビュー
npm run preview
```

### 技術スタック

- React 19
- TypeScript
- Vite
- nostr-tools
- CSS Modules

## デプロイ

GitHub Pagesに自動デプロイされます（mainブランチへのpush時）。

手動でデプロイする場合：

```bash
npm run build
# distフォルダの内容をデプロイ
```

## ライセンス

MIT

## 関連リンク

- [Nostr Protocol](https://nostr.com/)
- [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md)
