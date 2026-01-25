/**
 * SVG diff merging utilities
 */

import type { NostrEvent, NostrDrawPost } from './types';
import { parseNostrDrawEvent, extractSvg, parseNostrDrawContent } from './parse';

/**
 * Merge two SVGs (parent + child diff)
 * Child SVG layers are placed on top of parent SVG layers
 */
export function mergeSvgs(parentSvg: string, childSvg: string): string {
  // Extract viewBox from parent
  const viewBoxMatch = parentSvg.match(/viewBox="([^"]+)"/);
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 800 600';
  
  // Extract content from parent (everything between <svg> and </svg>)
  const parentContentMatch = parentSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  const parentContent = parentContentMatch ? parentContentMatch[1] : '';
  
  // Extract content from child
  const childContentMatch = childSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  const childContent = childContentMatch ? childContentMatch[1] : '';
  
  // Extract SVG attributes from parent (preserving xmlns, etc.)
  const svgAttrsMatch = parentSvg.match(/<svg([^>]*)>/i);
  const svgAttrs = svgAttrsMatch ? svgAttrsMatch[1] : ` xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"`;
  
  // Merge: parent content first, then child content on top
  return `<svg${svgAttrs}>${parentContent}${childContent}</svg>`;
}

/**
 * Fetch event by ID (abstract interface for different implementations)
 */
export type FetchEventFn = (eventId: string) => Promise<NostrEvent | null>;

/**
 * Merge diff chain recursively
 * Fetches all parent events and merges SVGs from root to leaf
 */
export async function mergeDiffChain(
  event: NostrEvent,
  fetchEvent: FetchEventFn
): Promise<string> {
  const content = parseNostrDrawContent(event.content);
  const svg = extractSvg(content);
  
  if (!svg) {
    throw new Error('Failed to extract SVG from event');
  }
  
  // If not a diff, return as-is
  if (!content.isDiff || !content.parentEventId) {
    return svg;
  }
  
  // Fetch parent event
  const parentEvent = await fetchEvent(content.parentEventId);
  if (!parentEvent) {
    throw new Error(`Parent event not found: ${content.parentEventId}`);
  }
  
  // Recursively get parent SVG (which may also be a diff)
  const parentSvg = await mergeDiffChain(parentEvent, fetchEvent);
  
  // Merge parent + this diff
  return mergeSvgs(parentSvg, svg);
}

/**
 * Get full SVG from post (handles diff merging)
 */
export async function getFullSvg(
  post: NostrDrawPost,
  fetchEvent: FetchEventFn
): Promise<string> {
  if (!post.isDiff || !post.parentEventId) {
    return post.svg;
  }
  
  // Build chain of events to merge
  const chain: string[] = [post.svg];
  let currentParentId: string | null = post.parentEventId;
  
  while (currentParentId) {
    const parentEvent = await fetchEvent(currentParentId);
    if (!parentEvent) {
      throw new Error(`Parent event not found: ${currentParentId}`);
    }
    
    const parentContent = parseNostrDrawContent(parentEvent.content);
    const parentSvg = extractSvg(parentContent);
    
    if (!parentSvg) {
      throw new Error(`Failed to extract SVG from parent: ${currentParentId}`);
    }
    
    chain.unshift(parentSvg);
    
    if (parentContent.isDiff && parentContent.parentEventId) {
      currentParentId = parentContent.parentEventId;
    } else {
      currentParentId = null;
    }
  }
  
  // Merge from root to leaf
  let result = chain[0];
  for (let i = 1; i < chain.length; i++) {
    result = mergeSvgs(result, chain[i]);
  }
  
  return result;
}

/**
 * Get the root event ID of a chain
 */
export async function getRootEventId(
  eventId: string,
  fetchEvent: FetchEventFn
): Promise<string> {
  const event = await fetchEvent(eventId);
  if (!event) {
    return eventId;
  }
  
  const content = parseNostrDrawContent(event.content);
  
  if (content.isDiff && content.parentEventId) {
    return getRootEventId(content.parentEventId, fetchEvent);
  }
  
  return eventId;
}

/**
 * Get all events in a chain (from root to leaf)
 */
export async function getEventChain(
  eventId: string,
  fetchEvent: FetchEventFn
): Promise<NostrEvent[]> {
  const chain: NostrEvent[] = [];
  let currentId: string | null = eventId;
  
  // First, go up to find the root
  const upChain: NostrEvent[] = [];
  while (currentId) {
    const event = await fetchEvent(currentId);
    if (!event) break;
    
    upChain.unshift(event);
    
    const content = parseNostrDrawContent(event.content);
    if (content.isDiff && content.parentEventId) {
      currentId = content.parentEventId;
    } else {
      currentId = null;
    }
  }
  
  return upChain;
}
