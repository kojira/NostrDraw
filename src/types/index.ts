// Nostr年賀状サービスの型定義

export interface NostrProfile {
  pubkey: string;
  npub: string;
  name?: string;
  display_name?: string;
  picture?: string;
  about?: string;
  nip05?: string;
}

export interface NewYearCard {
  id: string;
  pubkey: string; // 送信者
  recipientPubkey: string | null; // 宛先（nullの場合はパブリック）
  svg: string; // SVGデータ
  message: string;
  layoutId: LayoutType;
  createdAt: number;
  year: number;
}

export type LayoutType = 'vertical' | 'horizontal' | 'fullscreen' | 'classic';

export interface LayoutOption {
  id: LayoutType;
  name: string;
  description: string;
}

export const LAYOUT_OPTIONS: LayoutOption[] = [
  { id: 'vertical', name: '縦型', description: '絵が上、メッセージが下' },
  { id: 'horizontal', name: '横型', description: '絵が左、メッセージが右' },
  { id: 'fullscreen', name: '全面', description: '絵を背景にメッセージをオーバーレイ' },
  { id: 'classic', name: 'クラシック', description: 'はがき風の枠付き' },
];

export interface EtoImage {
  id: string;
  name: string;
  svg: string; // SVGデータ（文字列）
  year: number; // 対応する年（例: 2026 = 午年）
}

export interface RelayConfig {
  url: string;
  read: boolean;
  write: boolean;
}

export const DEFAULT_RELAYS: RelayConfig[] = [
  { url: 'wss://yabu.me', read: true, write: true },
  { url: 'wss://r.kojira.io', read: true, write: true },
  { url: 'wss://x.kojira.io', read: true, write: true },
];

// 年賀状用の独自kind
export const NEW_YEAR_CARD_KIND = 31989;

export interface AuthState {
  isLoggedIn: boolean;
  pubkey: string | null;
  npub: string | null;
  isNip07: boolean;
}

export interface ImageUploadConfig {
  type: 'nostr.build' | 'custom';
  customUrl?: string;
}

