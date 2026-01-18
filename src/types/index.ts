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

export interface NostrDrawPost {
  id: string;
  pubkey: string; // 送信者
  recipientPubkey: string | null; // 宛先（nullの場合はパブリック）
  svg: string; // SVGデータ（差分の場合は差分のみ、表示時に合成が必要）
  message: string;
  layoutId: LayoutType;
  createdAt: number;
  year: number;
  allowExtend?: boolean; // 描き足し許可
  parentEventId?: string | null; // 描き足し元のイベントID（直接の親）
  parentPubkey?: string | null; // 描き足し元の投稿者
  rootEventId?: string | null; // スレッドのルートイベントID（最初の親）
  isDiff?: boolean; // 差分保存されているかどうか（trueの場合は親SVGとの合成が必要）
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

// NostrDraw用の独自kind（ユニークな番号を使用）
// 30000-39999はAddressable Events (NIP-33)
export const NOSTRDRAW_KIND = 31898;

// アプリ識別タグ（フィルタリング用）
export const NOSTRDRAW_CLIENT_TAG = 'nostrdraw';

// バージョン（日付ベース YYYYMMDD）
// 20260116: レイヤー機能追加、カスタムバイナリ圧縮フォーマット
export const NOSTRDRAW_VERSION = '20260116';

export interface AuthState {
  isLoggedIn: boolean;
  pubkey: string | null;
  npub: string | null;
  isNip07: boolean;
  isNsecLogin: boolean;  // nsecログインかどうか（パスワードログイン）
  isEntranceKey?: boolean; // 入口用アカウントかどうか（将来の移行用）
  needsReauth?: boolean; // 再認証が必要かどうか（nsecログインでページリロード後）
}

export interface ImageUploadConfig {
  type: 'nostr.build' | 'custom';
  customUrl?: string;
}

