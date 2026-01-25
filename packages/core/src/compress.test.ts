import { describe, it, expect } from 'vitest';
import { compressSvg, decompressSvg, isCompressed, getCompressedSize } from './compress';

describe('compress', () => {
  const testSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="100" height="100" fill="red"/></svg>';

  it('compresses and decompresses SVG correctly', () => {
    const compressed = compressSvg(testSvg);
    const decompressed = decompressSvg(compressed);
    expect(decompressed).toBe(testSvg);
  });

  it('produces smaller output for typical SVGs', () => {
    const largeSvg = testSvg.repeat(10);
    const compressed = compressSvg(largeSvg);
    expect(compressed.length).toBeLessThan(largeSvg.length);
  });

  it('detects compressed content', () => {
    const compressed = compressSvg(testSvg);
    expect(isCompressed(compressed)).toBe(true);
    expect(isCompressed(testSvg)).toBe(false);
  });

  it('calculates compressed size', () => {
    const compressed = compressSvg(testSvg);
    const size = getCompressedSize(compressed);
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(compressed.length);
  });
});
