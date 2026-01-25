/**
 * NostrDraw Constants
 */

// Event kinds
export const NOSTRDRAW_KIND = 31898;
export const PALETTE_KIND = 31899;
export const POST_TAGS_KIND = 30898;
export const TAG_FOLLOW_KIND = 30899;

// Client identifier
export const NOSTRDRAW_CLIENT_TAG = 'nostrdraw';

// Current version (YYYYMMDD format)
// 20260116: Layer support, binary format
export const NOSTRDRAW_VERSION = '20260116';

// Tag follow d-tag
export const TAG_FOLLOW_D_TAG = 'nostrdraw-tag-follows';

// Limits
export const MAX_SVG_SIZE_BYTES = 500000; // 500KB uncompressed
export const MAX_COMPRESSED_SIZE_BYTES = 100000; // 100KB compressed
export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 50;
export const MAX_MESSAGE_LENGTH = 500;
