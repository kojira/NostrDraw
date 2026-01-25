/**
 * 既存アプリとの互換性テスト
 */

import { describe, it, expect } from 'vitest';
import pako from 'pako';
import { decompressSvg, compressSvg, optimizeSvg } from './compress';
import { parseNostrDrawEvent, extractSvg, parseNostrDrawContent, isBinaryFormat } from './parse';
import { isNostrDrawEvent, hasNostrDrawKind } from './validate';
import { NOSTRDRAW_KIND, NOSTRDRAW_CLIENT_TAG } from './constants';
import type { NostrEvent, NostrDrawContent } from './types';

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

// テスト用のNostrEventを作成
function createTestEvent(content: NostrDrawContent, options?: {
  hasClientTag?: boolean;
  extraTags?: string[][];
}): NostrEvent {
  const { hasClientTag = true, extraTags = [] } = options || {};
  const tags: string[][] = [
    ['d', 'test-event-001'],
    ...(hasClientTag ? [['client', NOSTRDRAW_CLIENT_TAG]] : []),
    ...extraTags,
  ];
  
  return {
    id: 'test-event-id',
    pubkey: 'test-pubkey',
    kind: NOSTRDRAW_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: JSON.stringify(content),
    sig: 'test-signature',
  };
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

describe('allowExtend default value', () => {
  const testSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
  
  it('allowExtend defaults to false when not specified', () => {
    const event = createTestEvent({
      svgCompressed: compressSvg(testSvg),
      compression: 'gzip+base64',
      message: 'test',
      // allowExtend not specified
    });
    
    const post = parseNostrDrawEvent(event);
    expect(post).not.toBeNull();
    expect(post!.allowExtend).toBe(false); // Should default to false
  });
  
  it('allowExtend is true when explicitly set', () => {
    const event = createTestEvent({
      svgCompressed: compressSvg(testSvg),
      compression: 'gzip+base64',
      message: 'test',
      allowExtend: true,
    });
    
    const post = parseNostrDrawEvent(event);
    expect(post).not.toBeNull();
    expect(post!.allowExtend).toBe(true);
  });
  
  it('allowExtend is false when explicitly set to false', () => {
    const event = createTestEvent({
      svgCompressed: compressSvg(testSvg),
      compression: 'gzip+base64',
      message: 'test',
      allowExtend: false,
    });
    
    const post = parseNostrDrawEvent(event);
    expect(post).not.toBeNull();
    expect(post!.allowExtend).toBe(false);
  });
  
  it('allowExtend from tag fallback (backward compatibility)', () => {
    const event = createTestEvent(
      {
        svgCompressed: compressSvg(testSvg),
        compression: 'gzip+base64',
        // allowExtend not in content
      },
      {
        extraTags: [['allow_extend', 'true']],
      }
    );
    
    const post = parseNostrDrawEvent(event);
    expect(post).not.toBeNull();
    expect(post!.allowExtend).toBe(true); // Should pick up from tag
  });
});

describe('isNostrDrawEvent validation', () => {
  const testSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
  
  it('rejects events without client tag', () => {
    const event = createTestEvent(
      {
        svgCompressed: compressSvg(testSvg),
        compression: 'gzip+base64',
      },
      { hasClientTag: false }
    );
    
    expect(isNostrDrawEvent(event)).toBe(false);
    expect(hasNostrDrawKind(event)).toBe(true); // Kind still matches
  });
  
  it('accepts events with client tag', () => {
    const event = createTestEvent({
      svgCompressed: compressSvg(testSvg),
      compression: 'gzip+base64',
    });
    
    expect(isNostrDrawEvent(event)).toBe(true);
  });
  
  it('accepts events with binary format (layerData)', () => {
    const event = createTestEvent({
      layerData: 'some-base64-data',
      compression: 'binary+gzip+base64',
    });
    
    expect(isNostrDrawEvent(event)).toBe(true);
  });
});

describe('binary format detection', () => {
  it('detects binary format correctly', () => {
    const binaryContent: NostrDrawContent = {
      layerData: 'some-base64-data',
      compression: 'binary+gzip+base64',
    };
    expect(isBinaryFormat(binaryContent)).toBe(true);
    
    const svgContent: NostrDrawContent = {
      svgCompressed: 'some-compressed-svg',
      compression: 'gzip+base64',
    };
    expect(isBinaryFormat(svgContent)).toBe(false);
  });
  
  it('extractSvg returns null for binary format (requires app-level decoding)', () => {
    const binaryContent: NostrDrawContent = {
      layerData: 'some-base64-data',
      compression: 'binary+gzip+base64',
    };
    expect(extractSvg(binaryContent)).toBeNull();
  });
});

describe('tag fallback for old events', () => {
  const testSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
  
  it('falls back to message tag', () => {
    const event = createTestEvent(
      {
        svgCompressed: compressSvg(testSvg),
        compression: 'gzip+base64',
        // No message in content
      },
      {
        extraTags: [['message', 'Hello from tag']],
      }
    );
    
    const post = parseNostrDrawEvent(event);
    expect(post).not.toBeNull();
    expect(post!.message).toBe('Hello from tag');
  });
  
  it('prefers content message over tag message', () => {
    const event = createTestEvent(
      {
        svgCompressed: compressSvg(testSvg),
        compression: 'gzip+base64',
        message: 'Hello from content',
      },
      {
        extraTags: [['message', 'Hello from tag']],
      }
    );
    
    const post = parseNostrDrawEvent(event);
    expect(post).not.toBeNull();
    expect(post!.message).toBe('Hello from content');
  });
});
