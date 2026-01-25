# NostrDraw パッケージ分割計画

## 目標

NostrDrawを他の開発者やNostrクライアントが利用できるように、以下のパッケージに分割する。

## パッケージ構成

```
@nostrdraw/
├── core/          # コアライブラリ（UIなし）
├── react/         # Reactコンポーネント
└── widget/        # 埋め込みウィジェット（iframe / Web Component）
```

---

## @nostrdraw/core

**依存**: nostr-tools, pako

**提供する機能**:

### 型定義

```typescript
// イベントスキーマ
export interface NostrDrawDocV1 {
  version: string;           // "20260116"
  width: number;             // キャンバス幅
  height: number;            // キャンバス高さ
  background?: string;       // 背景色
  layers: Layer[];           // レイヤー配列
}

export interface Layer {
  id: string;
  type: 'vector' | 'pixel' | 'text' | 'image';
  visible: boolean;
  opacity: number;
  data: unknown;             // レイヤー種別ごとのデータ
}

export interface NostrDrawPost {
  id: string;
  pubkey: string;
  svg: string;
  message?: string;
  layoutId: LayoutType;
  createdAt: number;
  allowExtend: boolean;
  parentEventId?: string;
  isDiff: boolean;
  tags: string[];
}

export type LayoutType = 'vertical' | 'horizontal' | 'fullscreen' | 'classic';
```

### エンコード/デコード

```typescript
// SVG圧縮
export function compressSvg(svg: string): string;
export function decompressSvg(compressed: string): string;

// イベントコンテンツのパース
export function parseNostrDrawContent(content: string): NostrDrawPost;
export function buildNostrDrawContent(doc: NostrDrawDocV1, options: BuildOptions): string;
```

### イベント生成

```typescript
// イベントテンプレート生成（署名はホスト側で行う）
export function buildNostrDrawEvent(params: {
  svg: string;
  message?: string;
  layoutId?: LayoutType;
  allowExtend?: boolean;
  categoryTags?: string[];
  parentEventId?: string;
  isDiff?: boolean;
}): EventTemplate;

// 描き足しイベント生成
export function buildExtendEvent(params: {
  parentEvent: Event;
  diffSvg: string;
  ...
}): EventTemplate;
```

### 検証

```typescript
// イベント検証
export function validateNostrDrawEvent(event: Event): ValidationResult;

// SVGサイズ制限チェック
export function checkSvgSize(svg: string, maxBytes?: number): boolean;
```

### 差分マージ

```typescript
// 親チェーンを辿ってSVGをマージ
export async function mergeDiffChain(
  event: Event,
  fetchEvent: (id: string) => Promise<Event | null>
): Promise<string>;
```

### 定数

```typescript
export const NOSTRDRAW_KIND = 31898;
export const PALETTE_KIND = 31899;
export const POST_TAGS_KIND = 30898;
export const TAG_FOLLOW_KIND = 30899;
export const NOSTRDRAW_VERSION = '20260116';
```

---

## @nostrdraw/react

**依存**: @nostrdraw/core, react (peerDependency)

**提供するコンポーネント**:

### NostrDrawEditor

フル機能のエディタコンポーネント

```tsx
import { NostrDrawEditor } from '@nostrdraw/react';

<NostrDrawEditor
  // 初期データ
  initialSvg={svg}
  initialDoc={doc}
  
  // キャンバス設定
  width={800}
  height={600}
  gridMode={false}
  
  // パレット
  palette={colors}
  presetPalettes={PRESET_PALETTES}
  
  // コールバック
  onChange={(doc) => saveDraft(doc)}
  onPublishRequest={async (doc, svg) => {
    // ホスト側で署名・送信を処理
    const event = buildNostrDrawEvent({ svg, ... });
    const signed = await signEvent(event);
    await publish(signed);
  }}
  
  // カスタマイズ
  tools={['pen', 'eraser', 'text', 'stamp']}
  showLayerPanel={true}
  theme="dark"
/>
```

### NostrDrawViewer

表示専用コンポーネント

```tsx
import { NostrDrawViewer } from '@nostrdraw/react';

<NostrDrawViewer
  event={event}
  // または
  svg={svg}
  
  // オプション
  showAnimation={true}  // ストロークアニメーション再生
  onClick={() => openDetail()}
/>
```

### NostrDrawCard

タイムライン表示用カード

```tsx
import { NostrDrawCard } from '@nostrdraw/react';

<NostrDrawCard
  post={post}
  profile={authorProfile}
  onReaction={handleReaction}
  onExtend={handleExtend}
  onAuthorClick={handleAuthorClick}
/>
```

### PaletteSelector

パレット選択コンポーネント

```tsx
import { PaletteSelector } from '@nostrdraw/react';

<PaletteSelector
  palettes={palettes}
  selectedId={currentPaletteId}
  onSelect={handleSelect}
/>
```

---

## @nostrdraw/widget

**用途**: 非React環境への埋め込み

### iframe埋め込み

```html
<iframe 
  src="https://nostrdraw.app/embed/viewer?eventId=xxx"
  width="400" 
  height="300"
  frameborder="0"
></iframe>

<iframe 
  src="https://nostrdraw.app/embed/editor"
  width="800" 
  height="600"
  frameborder="0"
></iframe>
```

### postMessage API

```typescript
// ホスト → iframe
iframe.contentWindow.postMessage({
  type: 'NOSTRDRAW_LOAD',
  payload: { svg: '...' }
}, 'https://nostrdraw.app');

// iframe → ホスト
window.addEventListener('message', (e) => {
  if (e.origin !== 'https://nostrdraw.app') return;
  
  if (e.data.type === 'NOSTRDRAW_PUBLISH_REQUEST') {
    const { svg, message } = e.data.payload;
    // ホスト側で署名・送信
  }
  
  if (e.data.type === 'NOSTRDRAW_RESIZE') {
    iframe.style.height = e.data.payload.height + 'px';
  }
});
```

### Web Component

```html
<script src="https://nostrdraw.app/widget.js"></script>

<nostr-draw 
  mode="viewer"
  event-id="xxx"
  theme="dark"
></nostr-draw>

<nostr-draw
  mode="editor"
  width="800"
  height="600"
  on-publish="handlePublish"
></nostr-draw>
```

---

## 開発ロードマップ

### Phase 1: core切り出し（1-2週間）

1. 現在のコードからcore機能を抽出
2. テスト作成
3. npm公開準備（package.json, README, LICENSE）
4. `@nostrdraw/core` 公開

### Phase 2: Reactコンポーネント（2-3週間）

1. Editorコンポーネントの切り出し
2. Viewerコンポーネント作成
3. Cardコンポーネント作成
4. Storybook でドキュメント化
5. `@nostrdraw/react` 公開

### Phase 3: ウィジェット（1-2週間）

1. iframe埋め込みエンドポイント作成
2. postMessage API実装
3. Web Component ラッパー作成
4. `@nostrdraw/widget` 公開

### Phase 4: NIP提案（並行）

1. 仕様ドキュメント完成
2. サンプルイベント集作成
3. NIPs リポジトリにPR

---

## ディレクトリ構成案

```
nostrdraw/
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── types.ts
│   │   │   ├── compress.ts
│   │   │   ├── parse.ts
│   │   │   ├── build.ts
│   │   │   ├── validate.ts
│   │   │   ├── merge.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── react/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── Editor/
│   │   │   │   ├── Viewer/
│   │   │   │   ├── Card/
│   │   │   │   └── Palette/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── widget/
│       ├── src/
│       │   ├── iframe/
│       │   ├── web-component/
│       │   └── index.ts
│       └── package.json
│
├── apps/
│   └── web/                 # 現在のNostrDrawアプリ
│
├── docs/
│   ├── NIP-NOSTRDRAW.md
│   └── PACKAGE-PLAN.md
│
└── pnpm-workspace.yaml
```

---

## 注意事項

### セキュリティ

- **秘密鍵を扱わない**: 署名はホスト側に委譲
- **XSS対策**: SVGのサニタイズ
- **サイズ制限**: 解凍爆弾対策

### 互換性

- **バージョニング**: `version`フィールドで互換性管理
- **後方互換**: 古いバージョンのイベントも読めるように
- **前方互換**: 未知のフィールドは無視

### パフォーマンス

- **Tree-shaking対応**: ESM出力
- **軽量**: 不要な依存を入れない
- **遅延読み込み**: 大きなコンポーネントは動的インポート
