/**
 * カスタムバイナリ圧縮フォーマット
 * レイヤー構造を効率的にエンコード/デコードする
 * 
 * フォーマット仕様:
 * [Header]
 *   magic: 4 bytes "NDLR" (NostrDraw Layer)
 *   version: 1 byte
 *   flags: 1 byte (bit0: hasTemplate)
 *   layerCount: 1 byte
 *   canvasWidth: 2 bytes (uint16)
 *   canvasHeight: 2 bytes (uint16)
 * [Template] (if hasTemplate)
 *   templateIdLength: 1 byte
 *   templateId: N bytes (UTF-8)
 * [Layer] × layerCount
 *   ...
 */

import pako from 'pako';
import type { Layer, Stroke, PlacedStamp, TextBox, Point } from '../components/CardEditor/DrawingCanvas/types';
import { createDefaultLayer } from '../components/CardEditor/DrawingCanvas/types';

// マジックナンバー
const MAGIC = 'NDLR';
const FORMAT_VERSION = 1;

// 色をRGB配列に変換
function colorToRgb(color: string): [number, number, number, number] {
  // #RRGGBB または #RGB 形式
  let hex = color.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  return [r, g, b, 255];
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

  writeInt16(value: number): void {
    // 符号付き16ビット整数
    const unsigned = value < 0 ? 0x10000 + value : value;
    this.writeUint16(unsigned);
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

// バイナリリーダー
class BinaryReader {
  private buffer: Uint8Array;
  private offset: number = 0;

  constructor(buffer: Uint8Array) {
    this.buffer = buffer;
  }

  readBytes(length: number): Uint8Array {
    const result = this.buffer.slice(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  readString(length: number): string {
    const bytes = this.readBytes(length);
    return new TextDecoder().decode(bytes);
  }

  readUint8(): number {
    return this.buffer[this.offset++];
  }

  readUint16(): number {
    const high = this.buffer[this.offset++];
    const low = this.buffer[this.offset++];
    return (high << 8) | low;
  }

  readInt16(): number {
    const unsigned = this.readUint16();
    return unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned;
  }

  hasMore(): boolean {
    return this.offset < this.buffer.length;
  }
}

// ストロークをバイナリにエンコード
function encodeStroke(writer: BinaryWriter, stroke: Stroke): void {
  const [r, g, b, a] = colorToRgb(stroke.color);
  writer.writeUint8(r);
  writer.writeUint8(g);
  writer.writeUint8(b);
  writer.writeUint8(a);
  writer.writeUint8(Math.min(255, Math.max(1, stroke.lineWidth)));
  
  // ポイント数
  writer.writeUint16(stroke.points.length);
  
  // デルタエンコーディング
  let prevX = 0;
  let prevY = 0;
  for (const point of stroke.points) {
    const x = Math.round(point.x * 100); // 0.01単位
    const y = Math.round(point.y * 100);
    const dx = x - prevX;
    const dy = y - prevY;
    writer.writeInt16(dx);
    writer.writeInt16(dy);
    prevX = x;
    prevY = y;
  }
}

// ストロークをバイナリからデコード
function decodeStroke(reader: BinaryReader): Stroke {
  const r = reader.readUint8();
  const g = reader.readUint8();
  const b = reader.readUint8();
  reader.readUint8(); // alpha (unused for now)
  const lineWidth = reader.readUint8();
  const pointCount = reader.readUint16();
  
  const points: Point[] = [];
  let prevX = 0;
  let prevY = 0;
  for (let i = 0; i < pointCount; i++) {
    const dx = reader.readInt16();
    const dy = reader.readInt16();
    prevX += dx;
    prevY += dy;
    points.push({ x: prevX / 100, y: prevY / 100 });
  }
  
  return {
    points,
    color: rgbToColor(r, g, b),
    lineWidth,
  };
}

// スタンプをバイナリにエンコード
function encodeStamp(writer: BinaryWriter, stamp: PlacedStamp): void {
  // タイプ: 0 = builtin, 1 = customEmoji
  writer.writeUint8(stamp.isCustomEmoji ? 1 : 0);
  
  // スタンプID
  const idBytes = new TextEncoder().encode(stamp.stampId);
  writer.writeUint8(Math.min(255, idBytes.length));
  writer.writeBytes([...idBytes.slice(0, 255)]);
  
  // 位置（0.01単位）
  writer.writeUint16(Math.round(stamp.x * 100));
  writer.writeUint16(Math.round(stamp.y * 100));
  
  // スケール（0.25刻み、0=0.25, 1=0.5, ..., 11=3.0）
  const scaleIndex = Math.round((stamp.scale - 0.25) / 0.25);
  writer.writeUint8(Math.max(0, Math.min(255, scaleIndex)));
  
  // カスタム絵文字の場合はURL
  if (stamp.isCustomEmoji && stamp.customEmojiUrl) {
    const urlBytes = new TextEncoder().encode(stamp.customEmojiUrl);
    writer.writeUint16(Math.min(65535, urlBytes.length));
    writer.writeBytes([...urlBytes.slice(0, 65535)]);
  }
}

// スタンプをバイナリからデコード
function decodeStamp(reader: BinaryReader): PlacedStamp {
  const type = reader.readUint8();
  const isCustomEmoji = type === 1;
  
  const idLength = reader.readUint8();
  const stampId = reader.readString(idLength);
  
  const x = reader.readUint16() / 100;
  const y = reader.readUint16() / 100;
  
  const scaleIndex = reader.readUint8();
  const scale = 0.25 + scaleIndex * 0.25;
  
  let customEmojiUrl: string | undefined;
  if (isCustomEmoji) {
    const urlLength = reader.readUint16();
    customEmojiUrl = reader.readString(urlLength);
  }
  
  return {
    id: `stamp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    stampId,
    x,
    y,
    scale,
    isCustomEmoji,
    customEmojiUrl,
  };
}

// テキストボックスをバイナリにエンコード
function encodeTextBox(writer: BinaryWriter, textBox: TextBox): void {
  // 位置とサイズ
  writer.writeUint16(Math.round(textBox.x));
  writer.writeUint16(Math.round(textBox.y));
  writer.writeUint16(Math.round(textBox.width));
  writer.writeUint16(Math.round(textBox.height));
  
  // フォントサイズ
  writer.writeUint8(Math.min(255, Math.max(1, textBox.fontSize)));
  
  // 色
  const [r, g, b] = colorToRgb(textBox.color);
  writer.writeUint8(r);
  writer.writeUint8(g);
  writer.writeUint8(b);
  
  // フォントID
  const fontIdBytes = new TextEncoder().encode(textBox.fontId);
  writer.writeUint8(Math.min(255, fontIdBytes.length));
  writer.writeBytes([...fontIdBytes.slice(0, 255)]);
  
  // フォントファミリー
  const fontFamilyBytes = new TextEncoder().encode(textBox.fontFamily);
  writer.writeUint8(Math.min(255, fontFamilyBytes.length));
  writer.writeBytes([...fontFamilyBytes.slice(0, 255)]);
  
  // テキスト
  const textBytes = new TextEncoder().encode(textBox.text);
  writer.writeUint16(Math.min(65535, textBytes.length));
  writer.writeBytes([...textBytes.slice(0, 65535)]);
}

// テキストボックスをバイナリからデコード
function decodeTextBox(reader: BinaryReader): TextBox {
  const x = reader.readUint16();
  const y = reader.readUint16();
  const width = reader.readUint16();
  const height = reader.readUint16();
  const fontSize = reader.readUint8();
  
  const r = reader.readUint8();
  const g = reader.readUint8();
  const b = reader.readUint8();
  const color = rgbToColor(r, g, b);
  
  const fontIdLength = reader.readUint8();
  const fontId = reader.readString(fontIdLength);
  
  const fontFamilyLength = reader.readUint8();
  const fontFamily = reader.readString(fontFamilyLength);
  
  const textLength = reader.readUint16();
  const text = reader.readString(textLength);
  
  return {
    id: `textbox-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    x,
    y,
    width,
    height,
    fontSize,
    color,
    fontId,
    fontFamily,
    text,
  };
}

// レイヤーをバイナリにエンコード
function encodeLayer(writer: BinaryWriter, layer: Layer): void {
  // フラグ: bit0=visible, bit1=locked
  let flags = 0;
  if (layer.visible) flags |= 0x01;
  if (layer.locked) flags |= 0x02;
  writer.writeUint8(flags);
  
  // 不透明度 (0-255)
  writer.writeUint8(Math.round(layer.opacity * 255));
  
  // レイヤー名
  const nameBytes = new TextEncoder().encode(layer.name);
  writer.writeUint8(Math.min(255, nameBytes.length));
  writer.writeBytes([...nameBytes.slice(0, 255)]);
  
  // 要素数
  writer.writeUint16(layer.strokes.length);
  writer.writeUint16(layer.placedStamps.length);
  writer.writeUint16(layer.textBoxes.length);
  
  // ストローク
  for (const stroke of layer.strokes) {
    encodeStroke(writer, stroke);
  }
  
  // スタンプ
  for (const stamp of layer.placedStamps) {
    encodeStamp(writer, stamp);
  }
  
  // テキストボックス
  for (const textBox of layer.textBoxes) {
    encodeTextBox(writer, textBox);
  }
}

// レイヤーをバイナリからデコード
function decodeLayer(reader: BinaryReader, layerId: string): Layer {
  const flags = reader.readUint8();
  const visible = (flags & 0x01) !== 0;
  const locked = (flags & 0x02) !== 0;
  
  const opacity = reader.readUint8() / 255;
  
  const nameLength = reader.readUint8();
  const name = reader.readString(nameLength);
  
  const strokeCount = reader.readUint16();
  const stampCount = reader.readUint16();
  const textCount = reader.readUint16();
  
  const strokes: Stroke[] = [];
  for (let i = 0; i < strokeCount; i++) {
    strokes.push(decodeStroke(reader));
  }
  
  const placedStamps: PlacedStamp[] = [];
  for (let i = 0; i < stampCount; i++) {
    placedStamps.push(decodeStamp(reader));
  }
  
  const textBoxes: TextBox[] = [];
  for (let i = 0; i < textCount; i++) {
    textBoxes.push(decodeTextBox(reader));
  }
  
  return {
    id: layerId,
    name,
    visible,
    locked,
    opacity,
    strokes,
    placedStamps,
    textBoxes,
  };
}

/**
 * レイヤーデータをバイナリ形式にエンコードしてbase64で返す
 */
export function encodeLayersToBinary(
  layers: Layer[],
  templateId: string | null,
  canvasSize: { width: number; height: number }
): string {
  const writer = new BinaryWriter();
  
  // マジックナンバー
  writer.writeString(MAGIC);
  
  // バージョン
  writer.writeUint8(FORMAT_VERSION);
  
  // フラグ
  let flags = 0;
  if (templateId) flags |= 0x01;
  writer.writeUint8(flags);
  
  // レイヤー数
  writer.writeUint8(layers.length);
  
  // キャンバスサイズ
  writer.writeUint16(canvasSize.width);
  writer.writeUint16(canvasSize.height);
  
  // テンプレートID
  if (templateId) {
    const templateBytes = new TextEncoder().encode(templateId);
    writer.writeUint8(Math.min(255, templateBytes.length));
    writer.writeBytes([...templateBytes.slice(0, 255)]);
  }
  
  // レイヤー
  for (const layer of layers) {
    encodeLayer(writer, layer);
  }
  
  // gzip圧縮
  const rawData = writer.toUint8Array();
  const compressed = pako.deflate(rawData, { level: 9 });
  
  // base64エンコード
  return uint8ArrayToBase64(compressed);
}

/**
 * base64エンコードされたバイナリデータをデコードしてレイヤーデータを返す
 */
export function decodeBinaryToLayers(encoded: string): {
  layers: Layer[];
  templateId: string | null;
  canvasSize: { width: number; height: number };
} {
  // base64デコード
  const compressed = base64ToUint8Array(encoded);
  
  // gzip解凍
  const rawData = pako.inflate(compressed);
  
  const reader = new BinaryReader(rawData);
  
  // マジックナンバー確認
  const magic = reader.readString(4);
  if (magic !== MAGIC) {
    throw new Error('Invalid binary format: magic number mismatch');
  }
  
  // バージョン
  const version = reader.readUint8();
  if (version > FORMAT_VERSION) {
    throw new Error(`Unsupported format version: ${version}`);
  }
  
  // フラグ
  const flags = reader.readUint8();
  const hasTemplate = (flags & 0x01) !== 0;
  
  // レイヤー数
  const layerCount = reader.readUint8();
  
  // キャンバスサイズ
  const width = reader.readUint16();
  const height = reader.readUint16();
  
  // テンプレートID
  let templateId: string | null = null;
  if (hasTemplate) {
    const templateLength = reader.readUint8();
    templateId = reader.readString(templateLength);
  }
  
  // レイヤー
  const layers: Layer[] = [];
  for (let i = 0; i < layerCount; i++) {
    const layerId = `layer-${i + 1}`;
    layers.push(decodeLayer(reader, layerId));
  }
  
  return {
    layers,
    templateId,
    canvasSize: { width, height },
  };
}

/**
 * データがレイヤーバイナリフォーマットかどうかを判定
 */
export function isLayerBinaryFormat(data: string): boolean {
  try {
    const compressed = base64ToUint8Array(data);
    const rawData = pako.inflate(compressed);
    const magic = new TextDecoder().decode(rawData.slice(0, 4));
    return magic === MAGIC;
  } catch {
    return false;
  }
}

/**
 * 空のレイヤーセットを作成（初期化用）
 */
export function createEmptyLayers(): Layer[] {
  return [createDefaultLayer('layer-1', 'レイヤー 1')];
}
