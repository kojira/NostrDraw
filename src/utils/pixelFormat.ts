/**
 * ドット絵バイナリフォーマット
 * ピクセルレイヤーを効率的にエンコード/デコードする
 * 
 * フォーマット仕様 (NDPX):
 * [Header] 7 bytes
 *   magic: 4 bytes "NDPX" (NostrDraw Pixel)
 *   version: 1 byte
 *   gridSize: 1 byte (16|24|32|48|64)
 *   paletteSize: 1 byte (max 64)
 * [Palette] N × 3 bytes
 *   Color × N: RGB (3 bytes each)
 * [Pixels] gridSize × gridSize bytes
 *   PixelData: palette index (0 = transparent)
 * 
 * 差分フォーマット (NDPD):
 * [Header] 6 bytes
 *   magic: 4 bytes "NDPD" (NostrDraw Pixel Diff)
 *   changeCount: 2 bytes (uint16)
 * [Changes] × N
 *   x: 1 byte
 *   y: 1 byte
 *   oldColor: 1 byte (palette index)
 *   newColor: 1 byte (palette index)
 */

import pako from 'pako';
import type { PixelLayer, GridSize } from '../components/CardEditor/DrawingCanvas/types';

// マジックナンバー
const MAGIC_PIXEL = 'NDPX';
const MAGIC_DIFF = 'NDPD';
const FORMAT_VERSION = 1;

// 色をRGB配列に変換
function colorToRgb(color: string): [number, number, number] {
  let hex = color.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  return [r, g, b];
}

// RGB配列を色に変換
function rgbToColor(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Uint8Arrayをbase64文字列に変換
function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
  return btoa(binaryString);
}

// base64文字列をUint8Arrayに変換
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const uint8Array = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    uint8Array[i] = binaryString.charCodeAt(i);
  }
  return uint8Array;
}

// バイナリライター
class BinaryWriter {
  private buffer: number[] = [];

  writeBytes(bytes: number[]): void {
    this.buffer.push(...bytes);
  }

  writeString(str: string): void {
    const encoded = new TextEncoder().encode(str);
    this.buffer.push(...encoded);
  }

  writeUint8(value: number): void {
    this.buffer.push(value & 0xFF);
  }

  writeUint16(value: number): void {
    this.buffer.push((value >> 8) & 0xFF);
    this.buffer.push(value & 0xFF);
  }

  writeUint8Array(array: Uint8Array): void {
    this.buffer.push(...array);
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

// バイナリリーダー
class BinaryReader {
  private data: Uint8Array;
  private offset: number = 0;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  readString(length: number): string {
    const bytes = this.data.slice(this.offset, this.offset + length);
    this.offset += length;
    return new TextDecoder().decode(bytes);
  }

  readUint8(): number {
    return this.data[this.offset++];
  }

  readUint16(): number {
    const high = this.data[this.offset++];
    const low = this.data[this.offset++];
    return (high << 8) | low;
  }

  readUint8Array(length: number): Uint8Array {
    const result = this.data.slice(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  hasMore(): boolean {
    return this.offset < this.data.length;
  }
}

/**
 * ピクセルレイヤーをバイナリエンコードしてbase64で返す
 */
export function encodePixelLayer(layer: PixelLayer): string {
  const writer = new BinaryWriter();
  
  // Header
  writer.writeString(MAGIC_PIXEL);
  writer.writeUint8(FORMAT_VERSION);
  writer.writeUint8(layer.gridSize);
  writer.writeUint8(layer.palette.length);
  
  // Palette
  for (const color of layer.palette) {
    const [r, g, b] = colorToRgb(color);
    writer.writeUint8(r);
    writer.writeUint8(g);
    writer.writeUint8(b);
  }
  
  // Pixels
  writer.writeUint8Array(layer.pixels);
  
  // gzip圧縮
  const rawData = writer.toUint8Array();
  const compressed = pako.deflate(rawData, { level: 9 });
  
  return uint8ArrayToBase64(compressed);
}

/**
 * base64エンコードされたバイナリをデコードしてピクセルレイヤーを返す
 */
export function decodePixelLayer(encoded: string, id: string, name: string): PixelLayer {
  const compressed = base64ToUint8Array(encoded);
  const rawData = pako.inflate(compressed);
  const reader = new BinaryReader(rawData);
  
  // Header
  const magic = reader.readString(4);
  if (magic !== MAGIC_PIXEL) {
    throw new Error(`Invalid pixel format magic: ${magic}`);
  }
  
  const version = reader.readUint8();
  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported pixel format version: ${version}`);
  }
  
  const gridSize = reader.readUint8() as GridSize;
  const paletteSize = reader.readUint8();
  
  // Palette
  const palette: string[] = [];
  for (let i = 0; i < paletteSize; i++) {
    const r = reader.readUint8();
    const g = reader.readUint8();
    const b = reader.readUint8();
    palette.push(rgbToColor(r, g, b));
  }
  
  // Pixels
  const pixelCount = gridSize * gridSize;
  const pixels = reader.readUint8Array(pixelCount);
  
  return {
    id,
    name,
    gridSize,
    palette,
    pixels,
    visible: true,
  };
}

/**
 * データがピクセルバイナリフォーマットかどうかを判定
 */
export function isPixelBinaryFormat(data: string): boolean {
  try {
    const compressed = base64ToUint8Array(data);
    const rawData = pako.inflate(compressed);
    const magic = new TextDecoder().decode(rawData.slice(0, 4));
    return magic === MAGIC_PIXEL;
  } catch {
    return false;
  }
}

/**
 * ピクセル差分のエンコード（コラボ用）
 */
export interface PixelChange {
  x: number;
  y: number;
  oldColor: number; // palette index
  newColor: number; // palette index
}

export function encodePixelDiff(changes: PixelChange[]): string {
  const writer = new BinaryWriter();
  
  // Header
  writer.writeString(MAGIC_DIFF);
  writer.writeUint16(changes.length);
  
  // Changes
  for (const change of changes) {
    writer.writeUint8(change.x);
    writer.writeUint8(change.y);
    writer.writeUint8(change.oldColor);
    writer.writeUint8(change.newColor);
  }
  
  // gzip圧縮
  const rawData = writer.toUint8Array();
  const compressed = pako.deflate(rawData, { level: 9 });
  
  return uint8ArrayToBase64(compressed);
}

export function decodePixelDiff(encoded: string): PixelChange[] {
  const compressed = base64ToUint8Array(encoded);
  const rawData = pako.inflate(compressed);
  const reader = new BinaryReader(rawData);
  
  // Header
  const magic = reader.readString(4);
  if (magic !== MAGIC_DIFF) {
    throw new Error(`Invalid pixel diff format magic: ${magic}`);
  }
  
  const changeCount = reader.readUint16();
  
  // Changes
  const changes: PixelChange[] = [];
  for (let i = 0; i < changeCount; i++) {
    changes.push({
      x: reader.readUint8(),
      y: reader.readUint8(),
      oldColor: reader.readUint8(),
      newColor: reader.readUint8(),
    });
  }
  
  return changes;
}

/**
 * ピクセル差分をマージ（コラボ用）
 */
export function mergePixelDiff(layer: PixelLayer, changes: PixelChange[]): PixelLayer {
  const newPixels = new Uint8Array(layer.pixels);
  
  for (const change of changes) {
    const index = change.y * layer.gridSize + change.x;
    newPixels[index] = change.newColor;
  }
  
  return {
    ...layer,
    pixels: newPixels,
  };
}

/**
 * ピクセルレイヤーをSVG要素に変換（正方形を維持してキャンバス中央に配置）
 * 外部のSVGに埋め込む用（svg要素は含まない）
 */
export function pixelLayerToSvg(
  layer: PixelLayer,
  canvasWidth: number = 800,
  canvasHeight: number = 600
): string {
  const { gridSize, palette, pixels } = layer;
  
  // 正方形領域を計算（キャンバスの短辺に合わせる）
  const squareSize = Math.min(canvasWidth, canvasHeight);
  const offsetX = (canvasWidth - squareSize) / 2;
  const offsetY = (canvasHeight - squareSize) / 2;
  
  // ピクセルサイズを正方形領域に合わせる
  const pixelSize = squareSize / gridSize;
  
  const svgParts: string[] = [];
  
  // 同じ色のピクセルをまとめて効率化（行ごとにRLE）
  for (let y = 0; y < gridSize; y++) {
    let x = 0;
    while (x < gridSize) {
      const index = y * gridSize + x;
      const colorIndex = pixels[index];
      
      // 透明（0）はスキップ
      if (colorIndex === 0) {
        x++;
        continue;
      }
      
      // 同じ色が続く長さをカウント
      let runLength = 1;
      while (x + runLength < gridSize) {
        const nextIndex = y * gridSize + (x + runLength);
        if (pixels[nextIndex] !== colorIndex) break;
        runLength++;
      }
      
      const color = palette[colorIndex - 1] || '#000000';
      const px = offsetX + x * pixelSize;
      const py = offsetY + y * pixelSize;
      const width = runLength * pixelSize;
      
      svgParts.push(
        `<rect x="${px.toFixed(2)}" y="${py.toFixed(2)}" width="${width.toFixed(2)}" height="${pixelSize.toFixed(2)}" fill="${color}"/>`
      );
      
      x += runLength;
    }
  }
  
  if (svgParts.length === 0) return '';
  
  return svgParts.join('\n    ');
}

/**
 * ピクセルレイヤーを完全なSVGとして変換（スタンドアロン用）
 */
export function pixelLayerToFullSvg(
  layer: PixelLayer,
  canvasWidth: number = 800,
  canvasHeight: number = 600
): string {
  const innerSvg = pixelLayerToSvg(layer, canvasWidth, canvasHeight);
  if (!innerSvg) return '';
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">
  <g class="pixel-layer" data-grid-size="${layer.gridSize}">
    ${innerSvg}
  </g>
</svg>`;
}

/**
 * 複数のピクセルレイヤーを含むSVGを生成
 */
export function pixelLayersToSvg(
  layers: PixelLayer[],
  canvasWidth: number = 800,
  canvasHeight: number = 600
): string {
  const visibleLayers = layers.filter(l => l.visible);
  
  if (visibleLayers.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}"></svg>`;
  }
  
  // 各レイヤーのSVGコンテンツを生成
  const layerContents = visibleLayers.map(layer => {
    const { gridSize, palette, pixels } = layer;
    
    const maxScaleX = Math.floor(canvasWidth / gridSize);
    const maxScaleY = Math.floor(canvasHeight / gridSize);
    const scale = Math.min(maxScaleX, maxScaleY);
    
    const pixelSize = scale;
    const totalWidth = gridSize * pixelSize;
    const totalHeight = gridSize * pixelSize;
    
    const offsetX = Math.floor((canvasWidth - totalWidth) / 2);
    const offsetY = Math.floor((canvasHeight - totalHeight) / 2);
    
    const svgParts: string[] = [];
    
    for (let y = 0; y < gridSize; y++) {
      let x = 0;
      while (x < gridSize) {
        const index = y * gridSize + x;
        const colorIndex = pixels[index];
        
        if (colorIndex === 0) {
          x++;
          continue;
        }
        
        let runLength = 1;
        while (x + runLength < gridSize) {
          const nextIndex = y * gridSize + (x + runLength);
          if (pixels[nextIndex] !== colorIndex) break;
          runLength++;
        }
        
        const color = palette[colorIndex - 1] || '#000000';
        const px = offsetX + x * pixelSize;
        const py = offsetY + y * pixelSize;
        const width = runLength * pixelSize;
        
        svgParts.push(
          `<rect x="${px}" y="${py}" width="${width}" height="${pixelSize}" fill="${color}"/>`
        );
        
        x += runLength;
      }
    }
    
    return `<g class="pixel-layer" data-layer-id="${layer.id}" data-grid-size="${gridSize}">
      ${svgParts.join('\n      ')}
    </g>`;
  });
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">
  ${layerContents.join('\n  ')}
</svg>`;
}

/**
 * 色がパレットに存在するか確認し、なければ追加してインデックスを返す
 * palette indexは1から始まる（0は透明）
 */
export function getOrAddPaletteIndex(palette: string[], color: string): number {
  // 透明色の場合は0を返す
  if (color === 'transparent' || color === '') {
    return 0;
  }
  
  // 色を正規化（小文字に統一）
  const normalizedColor = color.toLowerCase();
  
  // 既存のパレットを検索
  const existingIndex = palette.findIndex(c => c.toLowerCase() === normalizedColor);
  if (existingIndex !== -1) {
    return existingIndex + 1; // 1-based index
  }
  
  // パレットが上限に達している場合はエラー
  if (palette.length >= 64) {
    throw new Error('Palette is full (max 64 colors)');
  }
  
  // 新しい色を追加
  palette.push(normalizedColor);
  return palette.length; // 1-based index
}
