/**
 * SVG Compression/Decompression utilities
 * Uses gzip + base64 encoding
 */

import pako from 'pako';

/**
 * Compress SVG string to gzip+base64 format
 */
export function compressSvg(svg: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(svg);
  const compressed = pako.gzip(data);
  
  // Convert to base64
  let binary = '';
  for (let i = 0; i < compressed.length; i++) {
    binary += String.fromCharCode(compressed[i]);
  }
  return btoa(binary);
}

/**
 * Decompress gzip+base64 encoded SVG
 */
export function decompressSvg(compressed: string): string {
  // Base64 decode
  const binary = atob(compressed);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  
  // Gzip decompress
  const decompressed = pako.ungzip(bytes);
  const decoder = new TextDecoder();
  return decoder.decode(decompressed);
}

/**
 * Check if content is compressed (gzip+base64)
 */
export function isCompressed(content: string): boolean {
  // gzip magic bytes in base64: H4sI
  return content.startsWith('H4sI');
}

/**
 * Get compressed size in bytes
 */
export function getCompressedSize(compressed: string): number {
  // Base64 overhead: 4/3 ratio
  return Math.ceil(compressed.length * 3 / 4);
}
