import { describe, it, expect } from 'vitest';
import { buildNostrDrawEvent, buildExtendEvent, generateDTag } from './build';
import { NOSTRDRAW_KIND, NOSTRDRAW_CLIENT_TAG } from './constants';

describe('build', () => {
  const testSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="100" height="100" fill="red"/></svg>';

  describe('generateDTag', () => {
    it('generates public d-tag without recipient', () => {
      const dTag = generateDTag();
      expect(dTag).toMatch(/^public-\d{8}-\d{6}$/);
    });

    it('generates recipient d-tag with recipient', () => {
      const dTag = generateDTag('abc123456789');
      expect(dTag).toMatch(/^to-abc12345-\d{8}$/);
    });
  });

  describe('buildNostrDrawEvent', () => {
    it('builds basic event template', () => {
      const event = buildNostrDrawEvent({
        svg: testSvg,
        message: 'Test message',
        allowExtend: true,
      });

      expect(event.kind).toBe(NOSTRDRAW_KIND);
      expect(event.created_at).toBeGreaterThan(0);
      
      // Check tags
      const dTag = event.tags.find(t => t[0] === 'd');
      expect(dTag).toBeTruthy();
      
      const clientTag = event.tags.find(t => t[0] === 'client');
      expect(clientTag?.[1]).toBe(NOSTRDRAW_CLIENT_TAG);

      // Check content
      const content = JSON.parse(event.content);
      expect(content.message).toBe('Test message');
      expect(content.allowExtend).toBe(true);
      expect(content.svgCompressed || content.svg).toBeTruthy();
    });

    it('includes category tags', () => {
      const event = buildNostrDrawEvent({
        svg: testSvg,
        categoryTags: ['pixel-art', 'character'],
      });

      const tTags = event.tags.filter(t => t[0] === 't');
      expect(tTags.length).toBe(2);
      expect(tTags[0][1]).toBe('pixel-art');
      expect(tTags[1][1]).toBe('character');
    });

    it('includes recipient tag', () => {
      const recipientPubkey = 'abc123456789abcdef';
      const event = buildNostrDrawEvent({
        svg: testSvg,
        recipientPubkey,
      });

      const pTag = event.tags.find(t => t[0] === 'p');
      expect(pTag?.[1]).toBe(recipientPubkey);

      const content = JSON.parse(event.content);
      expect(content.isPublic).toBe(false);
    });
  });

  describe('buildExtendEvent', () => {
    it('builds extend event with parent reference', () => {
      const event = buildExtendEvent({
        parentEventId: 'parent123',
        parentPubkey: 'pubkey456',
        diffSvg: testSvg,
        message: 'Extended!',
      });

      expect(event.kind).toBe(NOSTRDRAW_KIND);

      // Check parent references
      const eTags = event.tags.filter(t => t[0] === 'e');
      expect(eTags.length).toBe(2); // root and reply
      
      const rootTag = eTags.find(t => t[3] === 'root');
      expect(rootTag?.[1]).toBe('parent123');
      
      const replyTag = eTags.find(t => t[3] === 'reply');
      expect(replyTag?.[1]).toBe('parent123');

      const parentPTag = event.tags.find(t => t[0] === 'parent_p');
      expect(parentPTag?.[1]).toBe('pubkey456');

      // Check content
      const content = JSON.parse(event.content);
      expect(content.isDiff).toBe(true);
      expect(content.parentEventId).toBe('parent123');
    });
  });
});
