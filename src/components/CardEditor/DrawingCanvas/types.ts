// DrawingCanvas用の型定義

import type { Template, Stamp } from '../../../data/templates';
import type { FontOption } from '../../../data/fonts';
import type { CustomEmoji } from '../../../services/emoji';
import type { EtoImage } from '../../../types';

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  points: Point[];
  color: string;
  lineWidth: number;
}

export interface PlacedStamp {
  id: string;
  stampId: string;
  x: number;
  y: number;
  scale: number;
  isCustomEmoji?: boolean;
  customEmojiUrl?: string;
}

export interface TextBox {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
  fontFamily: string;
  fontId: string;
}

// 後方互換性のためのエイリアス
export type MessageBox = TextBox;

// レイヤー型定義
export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0-1
  strokes: Stroke[];
  placedStamps: PlacedStamp[];
  textBoxes: TextBox[];
}

// レイヤー関連の定数
export const MAX_LAYERS = 5;
export const DEFAULT_LAYER_OPACITY = 1;

// 履歴関連の定数
export const MAX_HISTORY_SIZE = 50;

// デフォルトレイヤーを作成するヘルパー関数
export function createDefaultLayer(id: string, name: string): Layer {
  return {
    id,
    name,
    visible: true,
    locked: false,
    opacity: DEFAULT_LAYER_OPACITY,
    strokes: [],
    placedStamps: [],
    textBoxes: [],
  };
}

export type ToolType = 'pen' | 'eraser' | 'stamp' | 'text' | 'pixel' | 'pixelEraser' | 'pixelFill';
export type DragMode = 'none' | 'move' | 'resize-se' | 'resize-sw' | 'resize-ne' | 'resize-nw';
export type StampTab = 'builtin' | 'custom';

// ドット絵用の型定義
export type GridSize = 16 | 24 | 32 | 48 | 64;

export interface PixelLayer {
  id: string;
  name: string;
  gridSize: GridSize;
  palette: string[];      // hex colors, max 64
  pixels: Uint8Array;     // gridSize × gridSize, 0 = transparent
  visible: boolean;
}

// ピクセルレイヤーのデフォルト値
export const DEFAULT_GRID_SIZE: GridSize = 32;
export const MAX_PIXEL_PALETTE_SIZE = 64;

// デフォルトピクセルレイヤーを作成するヘルパー関数
export function createDefaultPixelLayer(id: string, name: string, gridSize: GridSize = DEFAULT_GRID_SIZE): PixelLayer {
  return {
    id,
    name,
    gridSize,
    palette: [],
    pixels: new Uint8Array(gridSize * gridSize), // 0で初期化（透明）
    visible: true,
  };
}

// ピクセルパーフェクト表示用のスケール計算
export function getPixelScale(gridSize: GridSize, canvasWidth: number = 800, canvasHeight: number = 600): number {
  const maxScaleX = Math.floor(canvasWidth / gridSize);
  const maxScaleY = Math.floor(canvasHeight / gridSize);
  return Math.min(maxScaleX, maxScaleY);
}

// 投稿データの型
export interface PostData {
  svg: string;           // 完全なSVG（プレビュー・画像アップロード用）
  diffSvg: string;       // 差分SVG（描き足し時の保存用）
  message: string;
  layers: Layer[];
  pixelLayers?: PixelLayer[];  // ドット絵レイヤー
  canvasSize: { width: number; height: number };
  templateId: string | null;
  isExtend: boolean;     // 描き足しかどうか
}

// パレット型
export interface ColorPalette {
  id: string;
  name: string;
  colors: string[];
}

export interface DrawingCanvasProps {
  onSave: (svg: string, message: string) => void;
  onPost?: (data: PostData) => Promise<void>; // 投稿処理
  isPosting?: boolean; // 投稿中フラグ
  postSuccess?: boolean; // 投稿成功フラグ
  onNewPost?: () => void; // 新規投稿開始時のコールバック
  onGoHome?: () => void; // ホームに戻る時のコールバック
  width?: number;
  height?: number;
  initialMessage?: string;
  customEmojis?: CustomEmoji[];
  isLoadingEmojis?: boolean;
  etoImages?: EtoImage[];
  baseImageSvg?: string; // 描き足し元のSVG（背景として表示）
  // パレットNostr保存用
  signEvent?: (event: import('nostr-tools').EventTemplate) => Promise<import('nostr-tools').Event>;
  userPubkey?: string | null;
}

// 定数
export const COLORS = ['#e94560', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#9b5de5', '#000000', '#ffffff'];

// カスタムカラーパレット用のローカルストレージキー
export const CUSTOM_COLORS_STORAGE_KEY = 'nostrdraw-custom-colors';

// カスタムカラーパレットの最大保存数
export const MAX_CUSTOM_COLORS = 64;

// Re-export types for convenience
export type { Template, Stamp, FontOption, CustomEmoji, EtoImage };

