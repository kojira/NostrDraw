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

export type ToolType = 'pen' | 'eraser' | 'stamp' | 'text';
export type DragMode = 'none' | 'move' | 'resize-se' | 'resize-sw' | 'resize-ne' | 'resize-nw';
export type StampTab = 'builtin' | 'custom';

export interface DrawingCanvasProps {
  onSave: (svg: string, message: string) => void;
  onPost?: (svg: string, message: string) => Promise<void>; // 投稿処理
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
}

// 定数
export const COLORS = ['#e94560', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#9b5de5', '#000000', '#ffffff'];

// Re-export types for convenience
export type { Template, Stamp, FontOption, CustomEmoji, EtoImage };

