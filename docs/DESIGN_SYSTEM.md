# NostrDraw デザインシステム

このドキュメントは、NostrDrawアプリケーションのデザインシステムについて説明します。

## 1. 基本単位

```css
html { font-size: 16px; }
/* 全サイズは rem を使用 (1rem = 16px) */
```

---

## 2. カラーシステム

### ダークテーマ (デフォルト)

| トークン | 値 | 用途 |
|---------|-----|------|
| `--color-bg-base` | `#0d1117` | ベース背景 |
| `--color-bg-raised` | `#161b22` | 浮き上がった背景 |
| `--color-bg-overlay` | `#21262d` | オーバーレイ背景 |
| `--color-bg-subtle` | `#30363d` | 控えめな背景 |
| `--color-text-primary` | `#e6edf3` | メインテキスト |
| `--color-text-secondary` | `#8b949e` | セカンダリテキスト |
| `--color-text-tertiary` | `#6e7681` | 控えめなテキスト |
| `--color-accent` | `#58a6ff` | アクセントカラー |
| `--color-success` | `#3fb950` | 成功 |
| `--color-warning` | `#d29922` | 警告 |
| `--color-error` | `#f85149` | エラー |

### ライトテーマ

| トークン | 値 | 用途 |
|---------|-----|------|
| `--color-bg-base` | `#ffffff` | ベース背景 |
| `--color-bg-raised` | `#f6f8fa` | 浮き上がった背景 |
| `--color-text-primary` | `#1f2328` | メインテキスト |
| `--color-accent` | `#0969da` | アクセントカラー |

---

## 3. タイポグラフィ

### フォントファミリー

```css
--font-family-base: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 
                    'Segoe UI', Roboto, sans-serif;
--font-family-mono: 'SF Mono', 'Monaco', 'Consolas', monospace;
```

### フォントサイズ

| トークン | サイズ | 用途 |
|---------|-------|------|
| `--text-xs` | 11px | バッジ/キャプション |
| `--text-sm` | 12px | 補助テキスト |
| `--text-base` | 14px | 本文 |
| `--text-md` | 16px | 強調本文 |
| `--text-lg` | 18px | 小見出し (h4) |
| `--text-xl` | 20px | セクション見出し (h3) |
| `--text-2xl` | 24px | ページ見出し (h2) |
| `--text-3xl` | 30px | メイン見出し (h1) |

### フォントウェイト

| トークン | 値 | 用途 |
|---------|-----|------|
| `--font-normal` | 400 | 本文 |
| `--font-medium` | 500 | ボタン/ラベル |
| `--font-semibold` | 600 | 小見出し |
| `--font-bold` | 700 | 見出し |

---

## 4. スペーシング (8px グリッド)

| トークン | サイズ | 用途 |
|---------|-------|------|
| `--space-1` | 4px | 最小間隔 |
| `--space-2` | 8px | アイコン間隔 |
| `--space-3` | 12px | 要素内パディング |
| `--space-4` | 16px | 標準間隔 |
| `--space-6` | 24px | カード内パディング |
| `--space-8` | 32px | セクション間 |
| `--space-12` | 48px | ページセクション |

---

## 5. コンポーネントサイズ

### アイコン

| トークン | サイズ |
|---------|-------|
| `--size-icon-sm` | 16px |
| `--size-icon-md` | 20px |
| `--size-icon-lg` | 24px |

### アバター

| トークン | サイズ |
|---------|-------|
| `--size-avatar-sm` | 24px |
| `--size-avatar-md` | 32px |
| `--size-avatar-lg` | 40px |

### ボタン

| サイズ | 高さ |
|-------|------|
| Small | 32px |
| Medium | 40px |
| Large | 48px |

---

## 6. ボーダー

### 半径

| トークン | 値 | 用途 |
|---------|-----|------|
| `--radius-sm` | 4px | 小要素 |
| `--radius-md` | 8px | ボタン/入力 |
| `--radius-lg` | 12px | カード |
| `--radius-xl` | 16px | モーダル |
| `--radius-full` | 9999px | 丸/ピル |

---

## 7. シャドウ

### ダークテーマ

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
--shadow-md: 0 4px 8px rgba(0, 0, 0, 0.4);
--shadow-lg: 0 8px 16px rgba(0, 0, 0, 0.5);
```

### ライトテーマ

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
--shadow-md: 0 4px 8px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 8px 16px rgba(0, 0, 0, 0.12);
```

---

## 8. トランジション

```css
--duration-fast: 100ms;
--duration-normal: 200ms;
--duration-slow: 300ms;
--easing-default: cubic-bezier(0.4, 0, 0.2, 1);
```

---

## 9. マイクロインタラクション

| 要素 | インタラクション | アニメーション |
|------|----------------|---------------|
| ボタン | ホバー | `scale(1.02)` + シャドウ強調 |
| ボタン | クリック | `scale(0.98)` |
| カード | ホバー | `translateY(-4px)` + シャドウ強調 |
| アイコンボタン | クリック | `scale(0.9)` |
| スケルトン | ローディング | シマーアニメーション |

---

## 10. Z-Index

| トークン | 値 | 用途 |
|---------|-----|------|
| `--z-dropdown` | 100 | ドロップダウン |
| `--z-sticky` | 200 | スティッキー |
| `--z-overlay` | 300 | オーバーレイ |
| `--z-modal` | 400 | モーダル |
| `--z-tooltip` | 500 | ツールチップ |
| `--z-toast` | 600 | トースト |

---

## 11. Material Symbols アイコン

### 使用方法

```tsx
import { Icon } from '@/components/common/Icon';

<Icon name="home" size="md" />
<Icon name="favorite" size="lg" filled />
```

### 主要アイコン

| 用途 | アイコン名 |
|------|----------|
| ホーム | `home` |
| ギャラリー | `gallery_thumbnail` |
| 通知 | `notifications` |
| プロフィール | `person` |
| 設定 | `settings` |
| ヘルプ | `help` |
| いいね | `favorite` |
| 共有 | `share` |
| 描画 | `palette` |
| 追加 | `add` |
| 閉じる | `close` |

---

## 12. 共通コンポーネント

### Icon

```tsx
import { Icon } from '@/components/common/Icon';

<Icon name="home" />
<Icon name="favorite" size="lg" filled />
```

### Button

```tsx
import { Button } from '@/components/common/Button';

<Button variant="primary">Primary</Button>
<Button variant="secondary" leftIcon="add">Add</Button>
<Button variant="ghost" size="sm">Ghost</Button>
<Button isLoading>Loading...</Button>
```

### IconButton

```tsx
import { IconButton } from '@/components/common/Button';

<IconButton icon="close" aria-label="閉じる" />
<IconButton icon="favorite" variant="ghost" aria-label="いいね" />
```

### Spinner

```tsx
import { Spinner } from '@/components/common/Spinner';

<Spinner />
<Spinner size="lg" />
```

### Skeleton

```tsx
import { Skeleton } from '@/components/common/Skeleton';

<Skeleton variant="text" />
<Skeleton variant="circular" width={40} height={40} />
<Skeleton variant="rectangular" width="100%" height={200} />
```

---

## 13. ファイル構成

```
src/
  styles/
    design-tokens.css    # 全CSS変数
  components/
    common/
      Icon/              # アイコンコンポーネント
      Button/            # ボタンコンポーネント
      Spinner/           # スピナーコンポーネント
      Skeleton/          # スケルトンコンポーネント
    Help/                # ヘルプページ
    Onboarding/          # オンボーディング（Welcomeモーダル）
```

---

## 14. UX ガイドライン

### ファーストビュー

- 初回訪問時にWelcomeモーダルを表示
- アプリの主要機能を4ステップで紹介
- 「詳しく見る」でヘルプページへ誘導

### ローディング

- データ取得中はSpinnerを表示
- リスト読み込み中はSkeletonを表示
- ボタンのローディング中は内部スピナー + disabled

### フィードバック

- ボタンホバー時に視覚的フィードバック (scale, color)
- クリック時にscale down効果
- いいねボタンはpopアニメーション
- 成功/エラーメッセージは明確な色分け

### レスポンシブ

- モバイル: サイドナビをハンバーガーメニュー化
- モバイル: 下部タブナビゲーション
- タッチターゲットは最小44px

---

## 15. テーマ切り替え

テーマはローカルストレージに保存され、`body`要素にクラスが適用されます。

```tsx
// App.tsx
const [theme, setTheme] = useState<'dark' | 'light'>('dark');

useEffect(() => {
  document.body.classList.remove('light-theme', 'dark-theme');
  document.body.classList.add(`${theme}-theme`);
}, [theme]);
```

CSS変数はテーマによって自動的に切り替わります。

---

## 変更履歴

- 2026-01-04: 初版作成

