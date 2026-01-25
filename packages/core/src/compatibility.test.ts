/**
 * 既存アプリとの互換性テスト
 * アプリ側はpako.deflate、core側はpako.gzipを使用している
 * 両方のフォーマットを読めるようにする必要がある
 */

import { describe, it, expect } from 'vitest';
import pako from 'pako';
import { decompressSvg, compressSvg, optimizeSvg } from './compress';

// アプリ側と同じ実装（deflate形式）
function appCompressSvg(svg: string): string {
  const uint8Array = new TextEncoder().encode(svg);
  const compressed = pako.deflate(uint8Array, { level: 9 });
  let binary = '';
  for (let i = 0; i < compressed.length; i++) {
    binary += String.fromCharCode(compressed[i]);
  }
  return btoa(binary);
}

function appDecompressSvg(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const decompressed = pako.inflate(bytes);
  return new TextDecoder().decode(decompressed);
}

describe('compatibility with existing app', () => {
  const testSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="100" height="100" fill="red"/></svg>';

  it('app compress -> core decompress: check if it works', () => {
    const appCompressed = appCompressSvg(testSvg);
    
    // Try to decompress with core's ungzip
    let result: string;
    try {
      result = decompressSvg(appCompressed);
      console.log('Core successfully decompressed app data!');
      console.log('Original:', testSvg);
      console.log('Decompressed:', result);
      expect(result).toBe(testSvg);
    } catch (error) {
      console.log('Core failed to decompress app data:', error);
      throw error;
    }
  });

  it('core compress -> app decompress: check if it works', () => {
    const coreCompressed = compressSvg(testSvg);
    
    // Try to decompress with app's inflate
    let result: string;
    try {
      result = appDecompressSvg(coreCompressed);
      console.log('App successfully decompressed core data!');
      console.log('Original:', testSvg);
      console.log('Decompressed:', result);
      expect(result).toBe(testSvg);
    } catch (error) {
      console.log('App failed to decompress core data:', error);
      throw error;
    }
  });

  it('core produces same output as app (after fix)', () => {
    const appCompressed = appCompressSvg(testSvg);
    const coreCompressed = compressSvg(testSvg);
    
    // After fixing core to use deflate (same as app), they should produce identical results
    expect(coreCompressed).toBe(appCompressed);
    
    console.log('App compressed:', appCompressed.substring(0, 20) + '...');
    console.log('Core compressed:', coreCompressed.substring(0, 20) + '...');
    console.log('Both length:', appCompressed.length);
    
    // Neither should start with H4sI (gzip header) since we use deflate
    expect(appCompressed.startsWith('H4sI')).toBe(false);
    expect(coreCompressed.startsWith('H4sI')).toBe(false);
  });
});
