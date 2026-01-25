import { describe, it, expect } from 'vitest';
import { mergeSvgs, mergeDiffChain, getFullSvg, getRootEventId, getEventChain } from './merge';
import { compressSvg } from './compress';
import { NOSTRDRAW_KIND } from './constants';
import type { NostrEvent, NostrDrawPost } from './types';

describe('merge', () => {
  const baseSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect id="base" width="100" height="100" fill="red"/></svg>';
  const childSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><circle id="child" cx="200" cy="200" r="50" fill="blue"/></svg>';

  describe('mergeSvgs', () => {
    it('merges two SVGs correctly', () => {
      const merged = mergeSvgs(baseSvg, childSvg);
      
      expect(merged).toContain('<svg');
      expect(merged).toContain('</svg>');
      expect(merged).toContain('id="base"');
      expect(merged).toContain('id="child"');
      expect(merged).toContain('viewBox="0 0 800 600"');
    });

    it('preserves parent viewBox', () => {
      const parentWithDifferentViewBox = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect/></svg>';
      const merged = mergeSvgs(parentWithDifferentViewBox, childSvg);
      
      expect(merged).toContain('viewBox="0 0 400 300"');
    });

    it('places child content after parent content', () => {
      const merged = mergeSvgs(baseSvg, childSvg);
      
      const baseIndex = merged.indexOf('id="base"');
      const childIndex = merged.indexOf('id="child"');
      expect(baseIndex).toBeLessThan(childIndex);
    });
  });

  describe('mergeDiffChain', () => {
    it('returns SVG as-is for non-diff event', async () => {
      const event: NostrEvent = {
        id: 'event1',
        pubkey: 'pubkey',
        kind: NOSTRDRAW_KIND,
        created_at: 1700000000,
        tags: [],
        content: JSON.stringify({
          svg: baseSvg,
          isDiff: false,
        }),
        sig: 'sig',
      };

      const fetchEvent = async () => null;
      const result = await mergeDiffChain(event, fetchEvent);
      
      expect(result).toBe(baseSvg);
    });

    it('merges diff with parent', async () => {
      const parentEvent: NostrEvent = {
        id: 'parent1',
        pubkey: 'pubkey',
        kind: NOSTRDRAW_KIND,
        created_at: 1700000000,
        tags: [],
        content: JSON.stringify({
          svg: baseSvg,
          isDiff: false,
        }),
        sig: 'sig',
      };

      const childEvent: NostrEvent = {
        id: 'child1',
        pubkey: 'pubkey',
        kind: NOSTRDRAW_KIND,
        created_at: 1700000001,
        tags: [],
        content: JSON.stringify({
          svg: childSvg,
          isDiff: true,
          parentEventId: 'parent1',
        }),
        sig: 'sig',
      };

      const fetchEvent = async (id: string) => {
        if (id === 'parent1') return parentEvent;
        return null;
      };

      const result = await mergeDiffChain(childEvent, fetchEvent);
      
      expect(result).toContain('id="base"');
      expect(result).toContain('id="child"');
    });

    it('merges chain of diffs', async () => {
      const svg1 = '<svg viewBox="0 0 800 600"><rect id="r1"/></svg>';
      const svg2 = '<svg viewBox="0 0 800 600"><rect id="r2"/></svg>';
      const svg3 = '<svg viewBox="0 0 800 600"><rect id="r3"/></svg>';

      const events: Record<string, NostrEvent> = {
        event1: {
          id: 'event1',
          pubkey: 'pubkey',
          kind: NOSTRDRAW_KIND,
          created_at: 1700000000,
          tags: [],
          content: JSON.stringify({ svg: svg1, isDiff: false }),
          sig: 'sig',
        },
        event2: {
          id: 'event2',
          pubkey: 'pubkey',
          kind: NOSTRDRAW_KIND,
          created_at: 1700000001,
          tags: [],
          content: JSON.stringify({ svg: svg2, isDiff: true, parentEventId: 'event1' }),
          sig: 'sig',
        },
        event3: {
          id: 'event3',
          pubkey: 'pubkey',
          kind: NOSTRDRAW_KIND,
          created_at: 1700000002,
          tags: [],
          content: JSON.stringify({ svg: svg3, isDiff: true, parentEventId: 'event2' }),
          sig: 'sig',
        },
      };

      const fetchEvent = async (id: string) => events[id] || null;
      const result = await mergeDiffChain(events.event3, fetchEvent);
      
      expect(result).toContain('id="r1"');
      expect(result).toContain('id="r2"');
      expect(result).toContain('id="r3"');
    });

    it('throws error when parent not found', async () => {
      const childEvent: NostrEvent = {
        id: 'child1',
        pubkey: 'pubkey',
        kind: NOSTRDRAW_KIND,
        created_at: 1700000001,
        tags: [],
        content: JSON.stringify({
          svg: childSvg,
          isDiff: true,
          parentEventId: 'nonexistent',
        }),
        sig: 'sig',
      };

      const fetchEvent = async () => null;
      
      await expect(mergeDiffChain(childEvent, fetchEvent)).rejects.toThrow('Parent event not found');
    });
  });

  describe('getFullSvg', () => {
    it('returns SVG directly for non-diff post', async () => {
      const post: NostrDrawPost = {
        id: 'post1',
        pubkey: 'pubkey',
        recipientPubkey: null,
        svg: baseSvg,
        message: '',
        layoutId: 'vertical',
        createdAt: 1700000000,
        isDiff: false,
      };

      const fetchEvent = async () => null;
      const result = await getFullSvg(post, fetchEvent);
      
      expect(result).toBe(baseSvg);
    });
  });

  describe('getRootEventId', () => {
    it('returns same ID for non-diff event', async () => {
      const events: Record<string, NostrEvent> = {
        event1: {
          id: 'event1',
          pubkey: 'pubkey',
          kind: NOSTRDRAW_KIND,
          created_at: 1700000000,
          tags: [],
          content: JSON.stringify({ svg: baseSvg, isDiff: false }),
          sig: 'sig',
        },
      };

      const fetchEvent = async (id: string) => events[id] || null;
      const result = await getRootEventId('event1', fetchEvent);
      
      expect(result).toBe('event1');
    });

    it('finds root of chain', async () => {
      const events: Record<string, NostrEvent> = {
        root: {
          id: 'root',
          pubkey: 'pubkey',
          kind: NOSTRDRAW_KIND,
          created_at: 1700000000,
          tags: [],
          content: JSON.stringify({ svg: baseSvg, isDiff: false }),
          sig: 'sig',
        },
        child: {
          id: 'child',
          pubkey: 'pubkey',
          kind: NOSTRDRAW_KIND,
          created_at: 1700000001,
          tags: [],
          content: JSON.stringify({ svg: childSvg, isDiff: true, parentEventId: 'root' }),
          sig: 'sig',
        },
      };

      const fetchEvent = async (id: string) => events[id] || null;
      const result = await getRootEventId('child', fetchEvent);
      
      expect(result).toBe('root');
    });
  });

  describe('getEventChain', () => {
    it('returns single event for non-diff', async () => {
      const event: NostrEvent = {
        id: 'event1',
        pubkey: 'pubkey',
        kind: NOSTRDRAW_KIND,
        created_at: 1700000000,
        tags: [],
        content: JSON.stringify({ svg: baseSvg, isDiff: false }),
        sig: 'sig',
      };

      const fetchEvent = async (id: string) => id === 'event1' ? event : null;
      const chain = await getEventChain('event1', fetchEvent);
      
      expect(chain).toHaveLength(1);
      expect(chain[0].id).toBe('event1');
    });

    it('returns chain in order from root to leaf', async () => {
      const events: Record<string, NostrEvent> = {
        root: {
          id: 'root',
          pubkey: 'pubkey',
          kind: NOSTRDRAW_KIND,
          created_at: 1700000000,
          tags: [],
          content: JSON.stringify({ svg: baseSvg, isDiff: false }),
          sig: 'sig',
        },
        child: {
          id: 'child',
          pubkey: 'pubkey',
          kind: NOSTRDRAW_KIND,
          created_at: 1700000001,
          tags: [],
          content: JSON.stringify({ svg: childSvg, isDiff: true, parentEventId: 'root' }),
          sig: 'sig',
        },
      };

      const fetchEvent = async (id: string) => events[id] || null;
      const chain = await getEventChain('child', fetchEvent);
      
      expect(chain).toHaveLength(2);
      expect(chain[0].id).toBe('root');
      expect(chain[1].id).toBe('child');
    });
  });
});
