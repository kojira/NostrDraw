/**
 * NostrDraw Core Types
 */

// Layout types
export type LayoutType = 'vertical' | 'horizontal' | 'fullscreen' | 'classic';

// NostrDraw post data structure
export interface NostrDrawPost {
  id: string;
  pubkey: string;
  recipientPubkey: string | null;
  svg: string;
  message: string;
  layoutId: LayoutType;
  createdAt: number;
  allowExtend?: boolean;
  parentEventId?: string | null;
  parentPubkey?: string | null;
  rootEventId?: string | null;
  isDiff?: boolean;
  tags?: string[];
}

// Content stored in Nostr event
export interface NostrDrawContent {
  svg?: string;
  svgCompressed?: string;
  compression?: 'gzip+base64' | 'binary+gzip+base64';
  message?: string;
  layoutId?: LayoutType;
  version?: string;
  isPublic?: boolean;
  allowExtend?: boolean;
  parentEventId?: string | null;
  isDiff?: boolean;
  // Binary layer format (version 20260116+)
  layerData?: string;
}

// Parameters for building an event
export interface BuildEventParams {
  svg: string;
  message?: string;
  layoutId?: LayoutType;
  allowExtend?: boolean;
  categoryTags?: string[];
  recipientPubkey?: string;
  parentEventId?: string;
  parentPubkey?: string;
  rootEventId?: string;
  isDiff?: boolean;
  diffSvg?: string;
}

// Event template (unsigned event)
export interface EventTemplate {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

// Signed Nostr event
export interface NostrEvent extends EventTemplate {
  id: string;
  pubkey: string;
  sig: string;
}

// Validation result
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Color palette
export interface ColorPalette {
  id: string;
  name: string;
  colors: string[];
  authorPubkey?: string;
  eventId?: string;
  createdAt?: number;
}

// Palette content stored in Nostr event
export interface PaletteContent {
  name: string;
  colors: string[];
  version?: string;
}
