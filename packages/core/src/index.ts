/**
 * @nostrdraw/core
 * Core library for NostrDraw - encode, decode, validate, and build Nostr drawing events
 */

// Types
export type {
  LayoutType,
  NostrDrawPost,
  NostrDrawContent,
  BuildEventParams,
  EventTemplate,
  NostrEvent,
  ValidationResult,
  ColorPalette,
  PaletteContent,
} from './types';

// Constants
export {
  NOSTRDRAW_KIND,
  PALETTE_KIND,
  POST_TAGS_KIND,
  TAG_FOLLOW_KIND,
  NOSTRDRAW_CLIENT_TAG,
  NOSTRDRAW_VERSION,
  TAG_FOLLOW_D_TAG,
  MAX_SVG_SIZE_BYTES,
  MAX_COMPRESSED_SIZE_BYTES,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  MAX_MESSAGE_LENGTH,
} from './constants';

// Compression
export {
  compressSvg,
  decompressSvg,
  optimizeSvg,
  isCompressed,
  getCompressedSize,
} from './compress';

// Parsing
export {
  parseNostrDrawContent,
  extractSvg,
  parseNostrDrawEvent,
  parsePaletteEvent,
  parsePostTagsEvent,
  getDTagValue,
  getEventReference,
} from './parse';

// Building
export {
  generateDTag,
  buildNostrDrawEvent,
  buildExtendEvent,
  buildPaletteEvent,
  buildPostTagsEvent,
  buildTagFollowEvent,
} from './build';

// Validation
export {
  validateNostrDrawEvent,
  validateSvg,
  isNostrDrawEvent,
} from './validate';

// Merging
export {
  mergeSvgs,
  mergeDiffChain,
  getFullSvg,
  getRootEventId,
  getEventChain,
} from './merge';
export type { FetchEventFn } from './merge';
