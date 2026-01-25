/**
 * Event validation utilities
 */

import type { NostrEvent, ValidationResult, NostrDrawContent } from './types';
import { parseNostrDrawContent, extractSvg } from './parse';
import { getCompressedSize } from './compress';
import {
  NOSTRDRAW_KIND,
  NOSTRDRAW_CLIENT_TAG,
  MAX_SVG_SIZE_BYTES,
  MAX_COMPRESSED_SIZE_BYTES,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  MAX_MESSAGE_LENGTH,
} from './constants';

/**
 * Validate NostrDraw event
 */
export function validateNostrDrawEvent(event: NostrEvent): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check kind
  if (event.kind !== NOSTRDRAW_KIND) {
    errors.push(`Invalid kind: expected ${NOSTRDRAW_KIND}, got ${event.kind}`);
    return { valid: false, errors, warnings };
  }
  
  // Check required fields
  if (!event.id) errors.push('Missing event id');
  if (!event.pubkey) errors.push('Missing pubkey');
  if (!event.sig) errors.push('Missing signature');
  if (!event.created_at) errors.push('Missing created_at');
  
  // Check d tag (NIP-33)
  const dTag = event.tags.find(t => t[0] === 'd');
  if (!dTag || !dTag[1]) {
    errors.push('Missing d tag (required for NIP-33)');
  }
  
  // Parse and validate content
  let content: NostrDrawContent;
  try {
    content = parseNostrDrawContent(event.content);
  } catch {
    errors.push('Invalid JSON content');
    return { valid: false, errors, warnings };
  }
  
  // Check SVG
  if (!content.svg && !content.svgCompressed) {
    errors.push('Missing SVG data');
  } else {
    // Check compressed size
    if (content.svgCompressed) {
      const compressedSize = getCompressedSize(content.svgCompressed);
      if (compressedSize > MAX_COMPRESSED_SIZE_BYTES) {
        errors.push(`Compressed SVG too large: ${compressedSize} bytes (max: ${MAX_COMPRESSED_SIZE_BYTES})`);
      }
    }
    
    // Try to extract and check SVG
    const svg = extractSvg(content);
    if (svg) {
      const svgSize = new TextEncoder().encode(svg).length;
      if (svgSize > MAX_SVG_SIZE_BYTES) {
        warnings.push(`Uncompressed SVG large: ${svgSize} bytes (recommended max: ${MAX_SVG_SIZE_BYTES})`);
      }
      
      // Basic SVG validation
      if (!svg.includes('<svg')) {
        errors.push('Invalid SVG: missing <svg> element');
      }
    } else {
      errors.push('Failed to extract SVG from content');
    }
  }
  
  // Validate message
  if (content.message && content.message.length > MAX_MESSAGE_LENGTH) {
    warnings.push(`Message too long: ${content.message.length} chars (recommended max: ${MAX_MESSAGE_LENGTH})`);
  }
  
  // Validate tags
  const categoryTags = event.tags.filter(t => t[0] === 't');
  if (categoryTags.length > MAX_TAGS) {
    warnings.push(`Too many tags: ${categoryTags.length} (recommended max: ${MAX_TAGS})`);
  }
  
  for (const tag of categoryTags) {
    if (tag[1] && tag[1].length > MAX_TAG_LENGTH) {
      warnings.push(`Tag too long: "${tag[1].slice(0, 20)}..." (max: ${MAX_TAG_LENGTH})`);
    }
  }
  
  // Check version
  if (!content.version) {
    warnings.push('Missing version field');
  }
  
  // Check isDiff consistency
  if (content.isDiff && !content.parentEventId) {
    errors.push('isDiff is true but parentEventId is missing');
  }
  
  // Check parent reference tags
  if (content.parentEventId) {
    const eTag = event.tags.find(t => t[0] === 'e' && t[1] === content.parentEventId);
    if (!eTag) {
      warnings.push('parentEventId in content but no matching e tag');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate SVG string (basic checks)
 */
export function validateSvg(svg: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!svg) {
    errors.push('SVG is empty');
    return { valid: false, errors, warnings };
  }
  
  if (!svg.includes('<svg')) {
    errors.push('Missing <svg> element');
  }
  
  if (!svg.includes('</svg>')) {
    errors.push('Missing closing </svg> tag');
  }
  
  // Check for potential XSS vectors
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+=/i, // onclick, onerror, etc.
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(svg)) {
      warnings.push(`Potentially dangerous content detected: ${pattern.source}`);
    }
  }
  
  // Check size
  const size = new TextEncoder().encode(svg).length;
  if (size > MAX_SVG_SIZE_BYTES) {
    warnings.push(`SVG large: ${size} bytes (recommended max: ${MAX_SVG_SIZE_BYTES})`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if event is a valid NostrDraw event (quick check)
 * Checks kind, client tag, and content
 */
export function isNostrDrawEvent(event: NostrEvent): boolean {
  if (event.kind !== NOSTRDRAW_KIND) return false;
  
  // Check for client tag (identifies NostrDraw events)
  const clientTag = event.tags.find(tag => tag[0] === 'client' && tag[1] === NOSTRDRAW_CLIENT_TAG);
  if (!clientTag) return false;
  
  try {
    const content = parseNostrDrawContent(event.content);
    // Accept SVG or layerData (binary format)
    return !!(content.svg || content.svgCompressed || content.layerData);
  } catch {
    return false;
  }
}

/**
 * Check if event has NostrDraw kind (less strict check, for filtering)
 */
export function hasNostrDrawKind(event: NostrEvent): boolean {
  return event.kind === NOSTRDRAW_KIND;
}
