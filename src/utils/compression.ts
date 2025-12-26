/**
 * SVG圧縮/解凍ユーティリティ
 * gzip + base64 エンコーディングでNostrイベントサイズを削減
 */

import pako from 'pako';

/**
 * SVGを最適化する
 * - 小数点を2桁に丸める
 * - 不要な空白を削除
 */
export function optimizeSvg(svg: string): string {
  let optimized = svg;
  
  // 小数点を2桁に丸める
  optimized = optimized.replace(/(\d+\.\d{2})\d+/g, '$1');
  
  // 不要な空白を削除（タグ間の空白のみ）
  optimized = optimized.replace(/>\s+</g, '><');
  
  // 連続する空白を1つに
  optimized = optimized.replace(/\s+/g, ' ');
  
  // 0.00 -> 0 に簡略化
  optimized = optimized.replace(/([^0-9])0\.00([^0-9])/g, '$10$2');
  
  // 冗長な属性値を短縮
  optimized = optimized.replace(/stroke-width="(\d+)\.00"/g, 'stroke-width="$1"');
  
  return optimized.trim();
}

/**
 * Uint8Arrayをbase64文字列に変換（ブラウザ環境用）
 */
function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
  return btoa(binaryString);
}

/**
 * base64文字列をUint8Arrayに変換（ブラウザ環境用）
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const uint8Array = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    uint8Array[i] = binaryString.charCodeAt(i);
  }
  return uint8Array;
}

/**
 * 文字列をgzip圧縮してbase64エンコード
 */
export function compressToBase64(data: string): string {
  try {
    const uint8Array = new TextEncoder().encode(data);
    const compressed = pako.deflate(uint8Array, { level: 9 });
    return uint8ArrayToBase64(compressed);
  } catch (error) {
    console.error('Compression failed:', error);
    throw error;
  }
}

/**
 * base64デコードしてgzip解凍
 */
export function decompressFromBase64(base64: string): string {
  try {
    const compressed = base64ToUint8Array(base64);
    const decompressed = pako.inflate(compressed);
    return new TextDecoder().decode(decompressed);
  } catch (error) {
    console.error('Decompression failed:', error);
    throw error;
  }
}

/**
 * SVGを最適化して圧縮
 */
export function compressSvg(svg: string): string {
  const optimized = optimizeSvg(svg);
  return compressToBase64(optimized);
}

/**
 * 圧縮されたSVGを解凍
 */
export function decompressSvg(compressedSvg: string): string {
  return decompressFromBase64(compressedSvg);
}

/**
 * コンテンツが圧縮されているかどうかを判定
 */
export function isCompressedContent(content: { svgCompressed?: string; svg?: string }): boolean {
  return !!content.svgCompressed;
}

