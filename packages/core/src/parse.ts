/**
 * Event parsing utilities
 */

import type { NostrEvent, NostrDrawPost, NostrDrawContent, ColorPalette, PaletteContent } from './types';
import { decompressSvg, isCompressed } from './compress';
import { NOSTRDRAW_KIND, PALETTE_KIND, POST_TAGS_KIND } from './constants';

/**
 * Parse NostrDraw event content
 */
export function parseNostrDrawContent(content: string): NostrDrawContent {
  try {
    return JSON.parse(content) as NostrDrawContent;
  } catch {
    return {};
  }
}

/**
 * Extract SVG from event content (handles both compressed and raw)
 * Note: Binary layer format (layerData + binary+gzip+base64) is not supported in core.
 *       Use app-level decodeBinaryToLayers for that format.
 */
export function extractSvg(content: NostrDrawContent): string | null {
  // Binary layer format is not supported in core library
  // This requires app-level decodeBinaryToLayers and layersToSvg
  if (content.layerData && content.compression === 'binary+gzip+base64') {
    console.warn('Binary layer format detected - requires app-level decoding');
    return null;
  }
  
  if (content.svgCompressed && (content.compression === 'gzip+base64' || !content.compression)) {
    try {
      return decompressSvg(content.svgCompressed);
    } catch (error) {
      console.error('Failed to decompress SVG:', error);
      return null;
    }
  }
  
  if (content.svg) {
    // Check if svg field is actually compressed
    if (isCompressed(content.svg)) {
      try {
        return decompressSvg(content.svg);
      } catch {
        return content.svg;
      }
    }
    return content.svg;
  }
  
  return null;
}

/**
 * Check if content uses binary layer format
 */
export function isBinaryFormat(content: NostrDrawContent): boolean {
  return !!(content.layerData && content.compression === 'binary+gzip+base64');
}

/**
 * Parse NostrDraw event to post object
 */
export function parseNostrDrawEvent(event: NostrEvent): NostrDrawPost | null {
  if (event.kind !== NOSTRDRAW_KIND) {
    return null;
  }
  
  const content = parseNostrDrawContent(event.content);
  const svg = extractSvg(content);
  
  if (!svg) {
    return null;
  }
  
  // Extract tags
  const tags: string[] = [];
  let recipientPubkey: string | null = null;
  let parentEventId: string | null = null;
  let rootEventId: string | null = null;
  let parentPubkey: string | null = null;
  
  for (const tag of event.tags) {
    if (tag[0] === 't' && tag[1]) {
      tags.push(tag[1]);
    } else if (tag[0] === 'p' && tag[1]) {
      recipientPubkey = tag[1];
    } else if (tag[0] === 'e' && tag[1]) {
      const marker = tag[3];
      if (marker === 'root') {
        rootEventId = tag[1];
      } else if (marker === 'reply') {
        parentEventId = tag[1];
      } else if (!parentEventId) {
        // Fallback for events without markers
        parentEventId = tag[1];
      }
    } else if (tag[0] === 'parent_p' && tag[1]) {
      parentPubkey = tag[1];
    }
  }
  
  // If content has parentEventId, use it
  if (content.parentEventId) {
    parentEventId = content.parentEventId;
  }
  
  // Extract fallback values from tags (backward compatibility with old format)
  let message = content.message || '';
  let layoutId = content.layoutId || 'vertical';
  let allowExtend = content.allowExtend === true; // Default to false (must be explicitly true)
  
  // Tag fallback for very old events (pre-JSON content format)
  for (const tag of event.tags) {
    if (tag[0] === 'message' && tag[1] && !message) {
      message = tag[1];
    } else if (tag[0] === 'layout' && tag[1] && !content.layoutId) {
      layoutId = tag[1] as typeof layoutId;
    } else if (tag[0] === 'allow_extend' && tag[1] === 'true' && content.allowExtend === undefined) {
      allowExtend = true;
    }
  }
  
  return {
    id: event.id,
    pubkey: event.pubkey,
    recipientPubkey,
    svg,
    message,
    layoutId,
    createdAt: event.created_at,
    allowExtend,
    parentEventId,
    parentPubkey,
    rootEventId: rootEventId || parentEventId,
    isDiff: content.isDiff ?? false,
    tags,
  };
}

/**
 * Parse palette event to ColorPalette object
 */
export function parsePaletteEvent(event: NostrEvent): ColorPalette | null {
  if (event.kind !== PALETTE_KIND) {
    return null;
  }
  
  try {
    const content = JSON.parse(event.content) as PaletteContent;
    
    // Extract d tag for ID
    const dTag = event.tags.find(t => t[0] === 'd');
    const id = dTag ? dTag[1] : event.id;
    
    return {
      id,
      name: content.name || 'Unnamed Palette',
      colors: content.colors || [],
      authorPubkey: event.pubkey,
      eventId: event.id,
      createdAt: event.created_at,
    };
  } catch {
    return null;
  }
}

/**
 * Extract tags from POST_TAGS_KIND event
 */
export function parsePostTagsEvent(event: NostrEvent): { postId: string; tags: string[] } | null {
  if (event.kind !== POST_TAGS_KIND) {
    return null;
  }
  
  const tags: string[] = [];
  let postId: string | null = null;
  
  for (const tag of event.tags) {
    if (tag[0] === 'e' && tag[1]) {
      postId = tag[1];
    } else if (tag[0] === 't' && tag[1]) {
      tags.push(tag[1]);
    }
  }
  
  if (!postId) {
    return null;
  }
  
  return { postId, tags };
}

/**
 * Get d tag value from event
 */
export function getDTagValue(event: NostrEvent): string | null {
  const dTag = event.tags.find(t => t[0] === 'd');
  return dTag ? dTag[1] : null;
}

/**
 * Get event reference (NIP-33 'a' tag format)
 */
export function getEventReference(event: NostrEvent): string {
  const dTag = getDTagValue(event);
  return `${event.kind}:${event.pubkey}:${dTag || ''}`;
}
