import { describe, it, expect } from 'vitest';
import { validateNostrDrawEvent, validateSvg, isNostrDrawEvent } from './validate';
import { compressSvg } from './compress';
import { NOSTRDRAW_KIND } from './constants';
import type { NostrEvent } from './types';

describe('validate', () => {
  const testSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="100" height="100" fill="red"/></svg>';

  const createValidEvent = (): NostrEvent => ({
    id: 'event123',
    pubkey: 'pubkey456',
    kind: NOSTRDRAW_KIND,
    created_at: 1700000000,
    tags: [
      ['d', 'public-20260125-120000'],
      ['client', 'nostrdraw'],
    ],
    content: JSON.stringify({
      svgCompressed: compressSvg(testSvg),
      compression: 'gzip+base64',
      version: '20260125',
      layoutId: 'vertical',
    }),
    sig: 'sig789',
  });

  describe('validateNostrDrawEvent', () => {
    it('validates correct event', () => {
      const result = validateNostrDrawEvent(createValidEvent());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects wrong kind', () => {
      const event = createValidEvent();
      event.kind = 1;
      
      const result = validateNostrDrawEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(`Invalid kind: expected ${NOSTRDRAW_KIND}, got 1`);
    });

    it('rejects missing d tag', () => {
      const event = createValidEvent();
      event.tags = [['client', 'nostrdraw']]; // no d tag
      
      const result = validateNostrDrawEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing d tag (required for NIP-33)');
    });

    it('rejects missing SVG', () => {
      const event = createValidEvent();
      event.content = JSON.stringify({ message: 'no svg', version: '20260125' });
      
      const result = validateNostrDrawEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing SVG data');
    });

    it('rejects invalid JSON content', () => {
      const event = createValidEvent();
      event.content = 'not json';
      
      const result = validateNostrDrawEvent(event);
      expect(result.valid).toBe(false);
      // parseNostrDrawContent returns {} for invalid JSON, so it reports missing SVG
      expect(result.errors).toContain('Missing SVG data');
    });

    it('warns about missing version', () => {
      const event = createValidEvent();
      event.content = JSON.stringify({
        svgCompressed: compressSvg(testSvg),
        compression: 'gzip+base64',
        // no version
      });
      
      const result = validateNostrDrawEvent(event);
      expect(result.valid).toBe(true); // still valid
      expect(result.warnings).toContain('Missing version field');
    });

    it('warns about too many tags', () => {
      const event = createValidEvent();
      const manyTags: string[][] = [
        ['d', 'public-20260125-120000'],
        ['client', 'nostrdraw'],
      ];
      for (let i = 0; i < 15; i++) {
        manyTags.push(['t', `tag${i}`]);
      }
      event.tags = manyTags;
      
      const result = validateNostrDrawEvent(event);
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('Too many tags'))).toBe(true);
    });

    it('errors on isDiff without parentEventId', () => {
      const event = createValidEvent();
      event.content = JSON.stringify({
        svgCompressed: compressSvg(testSvg),
        compression: 'gzip+base64',
        version: '20260125',
        isDiff: true,
        // no parentEventId
      });
      
      const result = validateNostrDrawEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('isDiff is true but parentEventId is missing');
    });
  });

  describe('validateSvg', () => {
    it('validates correct SVG', () => {
      const result = validateSvg(testSvg);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects empty SVG', () => {
      const result = validateSvg('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SVG is empty');
    });

    it('rejects missing svg element', () => {
      const result = validateSvg('<div>not svg</div>');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing <svg> element');
    });

    it('rejects unclosed svg', () => {
      const result = validateSvg('<svg><rect/></div>');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing closing </svg> tag');
    });

    it('warns about script tags', () => {
      const result = validateSvg('<svg><script>alert(1)</script></svg>');
      expect(result.valid).toBe(true); // still technically valid SVG
      expect(result.warnings.some(w => w.includes('script'))).toBe(true);
    });

    it('warns about event handlers', () => {
      const result = validateSvg('<svg onclick="alert(1)"></svg>');
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('on\\w+='))).toBe(true);
    });
  });

  describe('isNostrDrawEvent', () => {
    it('returns true for valid NostrDraw event', () => {
      expect(isNostrDrawEvent(createValidEvent())).toBe(true);
    });

    it('returns false for wrong kind', () => {
      const event = createValidEvent();
      event.kind = 1;
      expect(isNostrDrawEvent(event)).toBe(false);
    });

    it('returns false for missing SVG', () => {
      const event = createValidEvent();
      event.content = JSON.stringify({ message: 'no svg' });
      expect(isNostrDrawEvent(event)).toBe(false);
    });
  });
});
