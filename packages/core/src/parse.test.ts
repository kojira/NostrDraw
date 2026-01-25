import { describe, it, expect } from 'vitest';
import {
  parseNostrDrawContent,
  extractSvg,
  parseNostrDrawEvent,
  parsePaletteEvent,
  parsePostTagsEvent,
  getDTagValue,
} from './parse';
import { compressSvg } from './compress';
import { NOSTRDRAW_KIND, PALETTE_KIND, POST_TAGS_KIND } from './constants';
import type { NostrEvent } from './types';

describe('parse', () => {
  const testSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="100" height="100" fill="red"/></svg>';

  describe('parseNostrDrawContent', () => {
    it('parses valid JSON content', () => {
      const content = parseNostrDrawContent('{"message":"hello","layoutId":"vertical"}');
      expect(content.message).toBe('hello');
      expect(content.layoutId).toBe('vertical');
    });

    it('returns empty object for invalid JSON', () => {
      const content = parseNostrDrawContent('invalid json');
      expect(content).toEqual({});
    });
  });

  describe('extractSvg', () => {
    it('extracts raw SVG', () => {
      const content = { svg: testSvg };
      const svg = extractSvg(content);
      expect(svg).toBe(testSvg);
    });

    it('extracts and decompresses compressed SVG', () => {
      const compressed = compressSvg(testSvg);
      const content = { svgCompressed: compressed, compression: 'gzip+base64' as const };
      const svg = extractSvg(content);
      expect(svg).toBe(testSvg);
    });

    it('returns null for empty content', () => {
      const svg = extractSvg({});
      expect(svg).toBeNull();
    });
  });

  describe('parseNostrDrawEvent', () => {
    it('parses valid event', () => {
      const compressed = compressSvg(testSvg);
      const event: NostrEvent = {
        id: 'event123',
        pubkey: 'pubkey456',
        kind: NOSTRDRAW_KIND,
        created_at: 1700000000,
        tags: [
          ['d', 'public-20260125-120000'],
          ['client', 'nostrdraw'],
          ['t', 'pixel-art'],
          ['t', 'character'],
        ],
        content: JSON.stringify({
          svgCompressed: compressed,
          compression: 'gzip+base64',
          message: 'Test message',
          layoutId: 'vertical',
          allowExtend: true,
        }),
        sig: 'sig789',
      };

      const post = parseNostrDrawEvent(event);
      
      expect(post).not.toBeNull();
      expect(post!.id).toBe('event123');
      expect(post!.pubkey).toBe('pubkey456');
      expect(post!.svg).toBe(testSvg);
      expect(post!.message).toBe('Test message');
      expect(post!.tags).toEqual(['pixel-art', 'character']);
    });

    it('parses event with parent references', () => {
      const event: NostrEvent = {
        id: 'child123',
        pubkey: 'pubkey456',
        kind: NOSTRDRAW_KIND,
        created_at: 1700000000,
        tags: [
          ['d', 'public-20260125-120000'],
          ['e', 'root123', '', 'root'],
          ['e', 'parent456', '', 'reply'],
          ['parent_p', 'parentPubkey789'],
        ],
        content: JSON.stringify({
          svg: testSvg,
          isDiff: true,
          parentEventId: 'parent456',
        }),
        sig: 'sig',
      };

      const post = parseNostrDrawEvent(event);
      
      expect(post!.parentEventId).toBe('parent456');
      expect(post!.rootEventId).toBe('root123');
      expect(post!.isDiff).toBe(true);
    });

    it('returns null for wrong kind', () => {
      const event: NostrEvent = {
        id: 'event123',
        pubkey: 'pubkey456',
        kind: 1,
        created_at: 1700000000,
        tags: [],
        content: JSON.stringify({ svg: testSvg }),
        sig: 'sig',
      };

      const post = parseNostrDrawEvent(event);
      expect(post).toBeNull();
    });
  });

  describe('parsePaletteEvent', () => {
    it('parses valid palette event', () => {
      const event: NostrEvent = {
        id: 'palette123',
        pubkey: 'author456',
        kind: PALETTE_KIND,
        created_at: 1700000000,
        tags: [['d', 'palette-mypalette']],
        content: JSON.stringify({
          name: 'My Palette',
          colors: ['#ff0000', '#00ff00', '#0000ff'],
        }),
        sig: 'sig',
      };

      const palette = parsePaletteEvent(event);
      
      expect(palette).not.toBeNull();
      expect(palette!.name).toBe('My Palette');
      expect(palette!.colors).toEqual(['#ff0000', '#00ff00', '#0000ff']);
    });
  });

  describe('parsePostTagsEvent', () => {
    it('parses valid post tags event', () => {
      const event: NostrEvent = {
        id: 'tags123',
        pubkey: 'author456',
        kind: POST_TAGS_KIND,
        created_at: 1700000000,
        tags: [
          ['d', 'tags-post789'],
          ['e', 'post789'],
          ['t', 'pixel-art'],
          ['t', 'cute'],
        ],
        content: '',
        sig: 'sig',
      };

      const result = parsePostTagsEvent(event);
      
      expect(result).not.toBeNull();
      expect(result!.postId).toBe('post789');
      expect(result!.tags).toEqual(['pixel-art', 'cute']);
    });
  });

  describe('getDTagValue', () => {
    it('extracts d tag value', () => {
      const event: NostrEvent = {
        id: 'event123',
        pubkey: 'pubkey456',
        kind: NOSTRDRAW_KIND,
        created_at: 1700000000,
        tags: [['d', 'my-d-tag']],
        content: '',
        sig: 'sig',
      };

      expect(getDTagValue(event)).toBe('my-d-tag');
    });

    it('returns null for missing d tag', () => {
      const event: NostrEvent = {
        id: 'event123',
        pubkey: 'pubkey456',
        kind: NOSTRDRAW_KIND,
        created_at: 1700000000,
        tags: [],
        content: '',
        sig: 'sig',
      };

      expect(getDTagValue(event)).toBeNull();
    });
  });
});
