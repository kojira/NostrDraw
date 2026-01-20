// カラーパレット管理サービス
// NIP-78 (kind 30078) を使用してユーザーのカラーパレットをNostrに保存

import { type Event, type EventTemplate } from 'nostr-tools';
import { fetchEvents, publishEvent } from './relay';

// パレットのkind (NIP-78 Application Specific Data)
const PALETTE_KIND = 30078;
const PALETTE_D_TAG_PREFIX = 'nostrdraw-palette';

// ローカルストレージキー（pubkeyごとに分離）
const LOCAL_PALETTES_KEY_PREFIX = 'nostrdraw-palettes';
const ACTIVE_PALETTE_KEY_PREFIX = 'nostrdraw-active-palette';
const FAVORITE_PALETTES_KEY = 'nostrdraw-favorite-palettes';

// pubkeyを含むキーを生成（未ログインの場合は'anonymous'）
function getPalettesKey(pubkey?: string): string {
  return pubkey ? `${LOCAL_PALETTES_KEY_PREFIX}-${pubkey}` : `${LOCAL_PALETTES_KEY_PREFIX}-anonymous`;
}

function getActiveKey(pubkey?: string): string {
  return pubkey ? `${ACTIVE_PALETTE_KEY_PREFIX}-${pubkey}` : `${ACTIVE_PALETTE_KEY_PREFIX}-anonymous`;
}

export interface ColorPalette {
  id: string;
  name: string;
  colors: string[];
  createdAt: number;
  updatedAt: number;
  isDefault?: boolean;
  pubkey?: string; // 著者のpubkey（ギャラリー用）
  eventId?: string; // NostrイベントID
}

// デフォルトパレット
export const DEFAULT_PALETTE: ColorPalette = {
  id: 'default',
  name: 'デフォルト',
  colors: [],
  createdAt: 0,
  updatedAt: 0,
  isDefault: true,
};

// ローカルストレージからパレット一覧を取得
export function loadPalettesFromLocal(pubkey?: string): ColorPalette[] {
  try {
    const key = getPalettesKey(pubkey);
    const saved = localStorage.getItem(key);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // エラーを無視
  }
  return [DEFAULT_PALETTE];
}

// ローカルストレージにパレット一覧を保存
export function savePalettesToLocal(palettes: ColorPalette[], pubkey?: string): void {
  try {
    const key = getPalettesKey(pubkey);
    localStorage.setItem(key, JSON.stringify(palettes));
  } catch {
    // エラーを無視
  }
}

// アクティブなパレットIDを取得
export function getActivePaletteId(pubkey?: string): string {
  try {
    const key = getActiveKey(pubkey);
    return localStorage.getItem(key) || 'default';
  } catch {
    return 'default';
  }
}

// アクティブなパレットIDを設定
export function setActivePaletteId(id: string, pubkey?: string): void {
  try {
    const key = getActiveKey(pubkey);
    localStorage.setItem(key, id);
  } catch {
    // エラーを無視
  }
}

// イベントをパレットに変換
function eventToPalette(event: Event): ColorPalette | null {
  const dTag = event.tags.find(t => t[0] === 'd');
  if (!dTag || !dTag[1]?.startsWith(PALETTE_D_TAG_PREFIX)) {
    return null;
  }
  
  const id = dTag[1].replace(`${PALETTE_D_TAG_PREFIX}-`, '') || event.id;
  
  try {
    const content = JSON.parse(event.content);
    // 削除されたパレットはスキップ
    if (content.deleted) {
      return null;
    }
    return {
      id,
      name: content.name || 'パレット',
      colors: content.colors || [],
      createdAt: event.created_at,
      updatedAt: event.created_at,
      pubkey: event.pubkey,
      eventId: event.id,
    };
  } catch {
    return null;
  }
}

// パレットをNostrから取得（自分のパレット）
export async function fetchPalettesFromNostr(pubkey: string): Promise<ColorPalette[]> {
  try {
    const events = await fetchEvents({
      kinds: [PALETTE_KIND],
      authors: [pubkey],
    });

    // dタグでフィルタリングしてパレットに変換
    return events
      .map(eventToPalette)
      .filter((p): p is ColorPalette => p !== null);
  } catch (error) {
    console.error('Failed to fetch palettes from Nostr:', error);
    return [];
  }
}

// パレットギャラリー用：最近の公開パレットを取得
export async function fetchPublicPalettes(limit: number = 50): Promise<ColorPalette[]> {
  try {
    const events = await fetchEvents({
      kinds: [PALETTE_KIND],
      limit,
    });

    // dタグでフィルタリングしてパレットに変換
    const palettes = events
      .map(eventToPalette)
      .filter((p): p is ColorPalette => p !== null && p.colors.length > 0);
    
    // 新しい順にソート
    return palettes.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error('Failed to fetch public palettes:', error);
    return [];
  }
}

// パレットをNostrに保存
export async function savePaletteToNostr(
  palette: ColorPalette,
  signEvent: (event: EventTemplate) => Promise<Event>
): Promise<boolean> {
  try {
    const eventTemplate: EventTemplate = {
      kind: PALETTE_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', `${PALETTE_D_TAG_PREFIX}-${palette.id}`],
      ],
      content: JSON.stringify({
        name: palette.name,
        colors: palette.colors,
      }),
    };

    const signedEvent = await signEvent(eventTemplate);
    await publishEvent(signedEvent);
    return true;
  } catch (error) {
    console.error('Failed to save palette to Nostr:', error);
    return false;
  }
}

// パレットをNostrから削除（空の内容で上書き）
export async function deletePaletteFromNostr(
  paletteId: string,
  signEvent: (event: EventTemplate) => Promise<Event>
): Promise<boolean> {
  try {
    const eventTemplate: EventTemplate = {
      kind: PALETTE_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', `${PALETTE_D_TAG_PREFIX}-${paletteId}`],
      ],
      content: JSON.stringify({
        deleted: true,
      }),
    };

    const signedEvent = await signEvent(eventTemplate);
    await publishEvent(signedEvent);
    return true;
  } catch (error) {
    console.error('Failed to delete palette from Nostr:', error);
    return false;
  }
}

// ユニークなパレットIDを生成
export function generatePaletteId(): string {
  return `palette-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// お気に入りパレットID一覧を取得
export function getFavoritePaletteIds(): string[] {
  try {
    const saved = localStorage.getItem(FAVORITE_PALETTES_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // エラーを無視
  }
  return [];
}

// お気に入りパレットID一覧を保存
export function saveFavoritePaletteIds(ids: string[]): void {
  try {
    localStorage.setItem(FAVORITE_PALETTES_KEY, JSON.stringify(ids));
  } catch {
    // エラーを無視
  }
}

// パレットをお気に入りに追加
export function addFavoritePalette(eventId: string): void {
  const ids = getFavoritePaletteIds();
  if (!ids.includes(eventId)) {
    ids.push(eventId);
    saveFavoritePaletteIds(ids);
  }
}

// パレットをお気に入りから削除
export function removeFavoritePalette(eventId: string): void {
  const ids = getFavoritePaletteIds();
  const filtered = ids.filter(id => id !== eventId);
  saveFavoritePaletteIds(filtered);
}

// パレットがお気に入りかどうか
export function isFavoritePalette(eventId: string): boolean {
  const ids = getFavoritePaletteIds();
  return ids.includes(eventId);
}

// 特定ユーザーのパレットを取得
export async function fetchPalettesByAuthor(pubkey: string): Promise<ColorPalette[]> {
  try {
    const events = await fetchEvents({
      kinds: [PALETTE_KIND],
      authors: [pubkey],
    });

    // dタグでフィルタリングしてパレットに変換
    const palettes = events
      .map(eventToPalette)
      .filter((p): p is ColorPalette => p !== null && p.colors.length > 0);
    
    // 新しい順にソート
    return palettes.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error('Failed to fetch palettes by author:', error);
    return [];
  }
}
