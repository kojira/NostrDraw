/**
 * Event building utilities
 */

import type { EventTemplate, BuildEventParams } from './types';
import { compressSvg } from './compress';
import {
  NOSTRDRAW_KIND,
  PALETTE_KIND,
  POST_TAGS_KIND,
  TAG_FOLLOW_KIND,
  TAG_FOLLOW_D_TAG,
  NOSTRDRAW_CLIENT_TAG,
  NOSTRDRAW_VERSION,
} from './constants';

/**
 * Generate a d-tag value for NostrDraw posts
 */
export function generateDTag(recipientPubkey?: string): string {
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0');
  const timeStr = now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');
  
  if (recipientPubkey) {
    return `to-${recipientPubkey.slice(0, 8)}-${dateStr}`;
  }
  return `public-${dateStr}-${timeStr}`;
}

/**
 * Build NostrDraw event template (unsigned)
 */
export function buildNostrDrawEvent(params: BuildEventParams): EventTemplate {
  const timestamp = Math.floor(Date.now() / 1000);
  const dTag = generateDTag(params.recipientPubkey);
  
  // Build tags
  const tags: string[][] = [
    ['d', dTag],
    ['client', NOSTRDRAW_CLIENT_TAG],
  ];
  
  // Recipient
  if (params.recipientPubkey) {
    tags.push(['p', params.recipientPubkey]);
  }
  
  // Parent references (NIP-10 format)
  if (params.parentEventId) {
    if (params.rootEventId && params.rootEventId !== params.parentEventId) {
      tags.push(['e', params.rootEventId, '', 'root']);
      tags.push(['e', params.parentEventId, '', 'reply']);
    } else {
      tags.push(['e', params.parentEventId, '', 'root']);
      tags.push(['e', params.parentEventId, '', 'reply']);
    }
  }
  
  if (params.parentPubkey) {
    tags.push(['parent_p', params.parentPubkey]);
  }
  
  // Category tags (NIP-12)
  if (params.categoryTags && params.categoryTags.length > 0) {
    for (const tag of params.categoryTags) {
      tags.push(['t', tag]);
    }
  }
  
  // Determine which SVG to use
  const svgToSave = params.isDiff && params.diffSvg ? params.diffSvg : params.svg;
  
  // Compress SVG
  let svgCompressed: string;
  let useCompressed = true;
  try {
    svgCompressed = compressSvg(svgToSave);
  } catch {
    svgCompressed = '';
    useCompressed = false;
  }
  
  // Build content
  const content = {
    message: params.message || '',
    ...(useCompressed
      ? { svgCompressed, compression: 'gzip+base64' as const }
      : { svg: svgToSave }
    ),
    layoutId: params.layoutId || 'vertical',
    version: NOSTRDRAW_VERSION,
    isPublic: !params.recipientPubkey,
    allowExtend: params.allowExtend ?? true,
    parentEventId: params.parentEventId || null,
    isDiff: params.isDiff ?? false,
  };
  
  return {
    kind: NOSTRDRAW_KIND,
    created_at: timestamp,
    tags,
    content: JSON.stringify(content),
  };
}

/**
 * Build extend (collaboration) event
 */
export function buildExtendEvent(params: {
  parentEventId: string;
  parentPubkey: string;
  rootEventId?: string;
  diffSvg: string;
  message?: string;
  layoutId?: BuildEventParams['layoutId'];
  allowExtend?: boolean;
  categoryTags?: string[];
}): EventTemplate {
  return buildNostrDrawEvent({
    svg: params.diffSvg,
    diffSvg: params.diffSvg,
    isDiff: true,
    parentEventId: params.parentEventId,
    parentPubkey: params.parentPubkey,
    rootEventId: params.rootEventId || params.parentEventId,
    message: params.message,
    layoutId: params.layoutId,
    allowExtend: params.allowExtend,
    categoryTags: params.categoryTags,
  });
}

/**
 * Build palette event template
 */
export function buildPaletteEvent(params: {
  id: string;
  name: string;
  colors: string[];
}): EventTemplate {
  const timestamp = Math.floor(Date.now() / 1000);
  
  return {
    kind: PALETTE_KIND,
    created_at: timestamp,
    tags: [
      ['d', `palette-${params.id}`],
      ['client', NOSTRDRAW_CLIENT_TAG],
    ],
    content: JSON.stringify({
      name: params.name,
      colors: params.colors,
      version: '1',
    }),
  };
}

/**
 * Build post tags event (for updating tags without modifying original post)
 */
export function buildPostTagsEvent(params: {
  postEventId: string;
  tags: string[];
}): EventTemplate {
  const timestamp = Math.floor(Date.now() / 1000);
  
  const eventTags: string[][] = [
    ['d', `tags-${params.postEventId}`],
    ['e', params.postEventId],
    ['client', NOSTRDRAW_CLIENT_TAG],
  ];
  
  for (const tag of params.tags) {
    eventTags.push(['t', tag]);
  }
  
  return {
    kind: POST_TAGS_KIND,
    created_at: timestamp,
    tags: eventTags,
    content: '',
  };
}

/**
 * Build tag follow list event
 */
export function buildTagFollowEvent(followedTags: string[]): EventTemplate {
  const timestamp = Math.floor(Date.now() / 1000);
  
  const tags: string[][] = [
    ['d', TAG_FOLLOW_D_TAG],
  ];
  
  for (const tag of followedTags) {
    tags.push(['t', tag]);
  }
  
  return {
    kind: TAG_FOLLOW_KIND,
    created_at: timestamp,
    tags,
    content: '',
  };
}
