// カラーパレット管理サービス
// kind 31899 を使用してユーザーのカラーパレットをNostrに保存

import { type Event, type EventTemplate } from 'nostr-tools';
import { fetchEvents, publishEvent } from './relay';

// パレットのkind (NostrDraw専用)
const PALETTE_KIND = 31899;
const PALETTE_D_TAG_PREFIX = 'palette';

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
  authorPicture?: string; // 著者のアバター画像URL
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

// プリセットパレット（アプリ組み込み）
export const PRESET_PALETTES: ColorPalette[] = [
  {
    id: 'preset-8bit',
    name: '8bit パレット',
    colors: [
      // ファミコン（NES）カラーパレット - 54色
      // Row 0: グレースケール
      '#7C7C7C', '#BCBCBC', '#F8F8F8', '#FCFCFC',
      // Row 1: ブルー系
      '#0000FC', '#0078F8', '#3CBCFC', '#A4E4FC',
      // Row 2: パープル/バイオレット系
      '#0000BC', '#6844FC', '#9878F8', '#B8B8F8',
      // Row 3: マゼンタ/ピンク系
      '#4428BC', '#D800CC', '#F878F8', '#F8B8F8',
      // Row 4: レッド系
      '#940084', '#E40058', '#F85898', '#F8A4C0',
      // Row 5: オレンジ/レッド系
      '#A80020', '#F83800', '#F87858', '#F0D0B0',
      // Row 6: オレンジ系
      '#A81000', '#E45C10', '#FCA044', '#FCE0A8',
      // Row 7: イエロー/オレンジ系
      '#881400', '#AC7C00', '#F8B800', '#F8D878',
      // Row 8: イエロー/グリーン系
      '#503000', '#B8F818', '#D8F878', '#F8F8B8',
      // Row 9: グリーン系
      '#007800', '#00B800', '#B8F8B8', '#D8F8D8',
      // Row 10: グリーン/シアン系
      '#006800', '#00A800', '#58D854', '#B8F8B8',
      // Row 11: シアン系
      '#005800', '#008888', '#00E8D8', '#00FCFC',
      // Row 12: ダーク
      '#000000', '#080808', '#101010', '#181818',
      // 追加の便利な色
      '#F8D8B0', '#787878',
    ],
    createdAt: 0,
    updatedAt: 0,
    isDefault: false,
  },
];

// プリセットパレットIDかどうかを判定
export function isPresetPalette(id: string): boolean {
  return id.startsWith('preset-');
}

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

    // パレットに変換
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

// お気に入りパレットのdタグ
const FAVORITE_PALETTES_D_TAG = 'nostrdraw-favorite-palettes';

// お気に入りパレットのキーを取得（ユーザーごとに分離）
function getFavoritePalettesKey(pubkey?: string): string {
  return pubkey ? `${FAVORITE_PALETTES_KEY}-${pubkey}` : `${FAVORITE_PALETTES_KEY}-anonymous`;
}

// お気に入りパレットID一覧を取得（ローカル）
export function getFavoritePaletteIds(pubkey?: string): string[] {
  try {
    const key = getFavoritePalettesKey(pubkey);
    const saved = localStorage.getItem(key);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // エラーを無視
  }
  return [];
}

// お気に入りパレットID一覧を保存（ローカル）
export function saveFavoritePaletteIds(ids: string[], pubkey?: string): void {
  try {
    const key = getFavoritePalettesKey(pubkey);
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // エラーを無視
  }
}

// パレットをお気に入りに追加（ローカル）
export function addFavoritePalette(eventId: string, pubkey?: string): void {
  const ids = getFavoritePaletteIds(pubkey);
  if (!ids.includes(eventId)) {
    ids.push(eventId);
    saveFavoritePaletteIds(ids, pubkey);
  }
}

// パレットをお気に入りから削除（ローカル）
export function removeFavoritePalette(eventId: string, pubkey?: string): void {
  const ids = getFavoritePaletteIds(pubkey);
  const filtered = ids.filter(id => id !== eventId);
  saveFavoritePaletteIds(filtered, pubkey);
}

// パレットがお気に入りかどうか
export function isFavoritePalette(eventId: string, pubkey?: string): boolean {
  const ids = getFavoritePaletteIds(pubkey);
  return ids.includes(eventId);
}

// お気に入りパレットをNostrから取得
export async function fetchFavoritePalettesFromNostr(pubkey: string): Promise<string[]> {
  try {
    const events = await fetchEvents({
      kinds: [PALETTE_KIND],
      authors: [pubkey],
      '#d': [FAVORITE_PALETTES_D_TAG],
    });

    if (events.length === 0) return [];

    // 最新のイベントを使用
    const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];
    const content = JSON.parse(latestEvent.content);
    return content.favoriteIds || [];
  } catch (error) {
    console.error('Failed to fetch favorite palettes from Nostr:', error);
    return [];
  }
}

// お気に入りパレットをNostrに保存
export async function saveFavoritePalettesToNostr(
  favoriteIds: string[],
  signEvent: (event: EventTemplate) => Promise<Event>
): Promise<boolean> {
  try {
    const eventTemplate: EventTemplate = {
      kind: PALETTE_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', FAVORITE_PALETTES_D_TAG],
      ],
      content: JSON.stringify({
        favoriteIds,
      }),
    };

    const signedEvent = await signEvent(eventTemplate);
    await publishEvent(signedEvent);
    return true;
  } catch (error) {
    console.error('Failed to save favorite palettes to Nostr:', error);
    return false;
  }
}

// お気に入りパレットを同期（Nostrから取得してローカルにマージ）
export async function syncFavoritePalettes(pubkey: string): Promise<string[]> {
  const cloudFavorites = await fetchFavoritePalettesFromNostr(pubkey);
  const localFavorites = getFavoritePaletteIds(pubkey);
  
  // マージ（重複を除去）
  const merged = [...new Set([...localFavorites, ...cloudFavorites])];
  saveFavoritePaletteIds(merged, pubkey);
  
  return merged;
}

// お気に入りパレットの実際のデータを取得
export async function fetchFavoritePaletteData(favoriteIds: string[]): Promise<ColorPalette[]> {
  if (favoriteIds.length === 0) return [];
  
  const results: ColorPalette[] = [];
  
  // プリセットパレットのIDを分離
  const presetIds = favoriteIds.filter(id => isPresetPalette(id));
  const nostrIds = favoriteIds.filter(id => !isPresetPalette(id));
  
  // プリセットパレットを追加
  for (const id of presetIds) {
    const preset = PRESET_PALETTES.find(p => p.id === id);
    if (preset) {
      results.push(preset);
    }
  }
  
  // Nostrからパレットを取得
  if (nostrIds.length > 0) {
    try {
      const events = await fetchEvents({
        kinds: [PALETTE_KIND],
        ids: nostrIds,
      });

      const nostrPalettes = events
        .map(eventToPalette)
        .filter((p): p is ColorPalette => p !== null && p.colors.length > 0);
      
      results.push(...nostrPalettes);
    } catch (error) {
      console.error('Failed to fetch favorite palette data:', error);
    }
  }
  
  return results;
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

// 全ユーザーのお気に入りリストを取得して、各パレットの人気度（お気に入り数）をカウント
export async function fetchPalettePopularityCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  
  try {
    // 全ユーザーのお気に入りリストイベントを取得
    const events = await fetchEvents({
      kinds: [PALETTE_KIND],
      '#d': [FAVORITE_PALETTES_D_TAG],
      limit: 500,
    });

    // 各イベントからfavoriteIdsを抽出してカウント
    for (const event of events) {
      try {
        const content = JSON.parse(event.content);
        const favoriteIds = content.favoriteIds || [];
        for (const id of favoriteIds) {
          counts.set(id, (counts.get(id) || 0) + 1);
        }
      } catch {
        // JSONパースエラーは無視
      }
    }
  } catch (error) {
    console.error('Failed to fetch palette popularity counts:', error);
  }
  
  return counts;
}
