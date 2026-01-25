/**
 * SVG Compression/Decompression utilities
 * Uses deflate + base64 encoding (compatible with existing NostrDraw app)
 */

import pako from 'pako';

/**
 * Optimize SVG for smaller size
 * - Round decimals to 2 digits
 * - Remove unnecessary whitespace
 */
export function optimizeSvg(svg: string): string {
  let optimized = svg;
  
  // Round decimals to 2 digits
  optimized = optimized.replace(/(\d+\.\d{2})\d+/g, '$1');
  
  // Remove whitespace between tags
  optimized = optimized.replace(/>\s+</g, '><');
  
  // Collapse multiple spaces to one
  optimized = optimized.replace(/\s+/g, ' ');
  
  // Simplify 0.00 -> 0
  optimized = optimized.replace(/([^0-9])0\.00([^0-9])/g, '$10$2');
  
  // Shorten redundant attribute values
  optimized = optimized.replace(/stroke-width="(\d+)\.00"/g, 'stroke-width="$1"');
  
  return optimized.trim();
}

/**
 * Compress SVG string to deflate+base64 format
 * (Compatible with existing NostrDraw app)
 */
export function compressSvg(svg: string): string {
  const optimized = optimizeSvg(svg);
  const encoder = new TextEncoder();
  const data = encoder.encode(optimized);
  const compressed = pako.deflate(data, { level: 9 });
  
  // Convert to base64
  let binary = '';
  for (let i = 0; i < compressed.length; i++) {
    binary += String.fromCharCode(compressed[i]);
  }
  return btoa(binary);
}

/**
 * Decompress base64 encoded compressed SVG
 * Supports both deflate and gzip formats for backward compatibility
 */
export function decompressSvg(compressed: string): string {
  // Base64 decode
  const binary = atob(compressed);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  
  // pako.inflate handles both deflate and gzip formats
  const decompressed = pako.inflate(bytes);
  const decoder = new TextDecoder();
  return decoder.decode(decompressed);
}

/**
 * Check if content appears to be compressed
 * Note: deflate format doesn't have a reliable magic header like gzip
 */
export function isCompressed(content: string): boolean {
  // Try to detect by checking if it's valid base64 and not valid SVG
  if (content.startsWith('<svg') || content.startsWith('<?xml')) {
    return false;
  }
  // Check if it looks like base64
  return /^[A-Za-z0-9+/]+=*$/.test(content.replace(/\s/g, ''));
}

/**
 * Get compressed size in bytes
 */
export function getCompressedSize(compressed: string): number {
  // Base64 overhead: 4/3 ratio
  return Math.ceil(compressed.length * 3 / 4);
}
