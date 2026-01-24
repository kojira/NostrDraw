// タグフォローサービス（kind 30899）
// ユーザーがフォローしているタグの管理

import { type Event, type EventTemplate } from 'nostr-tools';
import { fetchEvents, publishEvent } from './relay';
import { TAG_FOLLOW_KIND, TAG_FOLLOW_D_TAG, NOSTRDRAW_CLIENT_TAG } from '../types';

// ローカルストレージキー
const STORAGE_KEY = 'nostrdraw-tag-follows';

// キャッシュ設定
const CACHE_TTL = 5 * 60 * 1000; // 5分

interface CacheEntry {
  tags: string[];
  timestamp: number;
  eventId?: string;
}

// メモリキャッシュ（pubkey -> CacheEntry）
const memoryCache = new Map<string, CacheEntry>();

// ローカルストレージからキャッシュを読み込み
function loadCacheFromStorage(pubkey: string): CacheEntry | null {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY}-${pubkey}`);
    if (stored) {
      const entry = JSON.parse(stored) as CacheEntry;
      return entry;
    }
  } catch {
    // パース失敗は無視
  }
  return null;
}

// ローカルストレージにキャッシュを保存
function saveCacheToStorage(pubkey: string, entry: CacheEntry): void {
  try {
    localStorage.setItem(`${STORAGE_KEY}-${pubkey}`, JSON.stringify(entry));
  } catch {
    // 保存失敗は無視
  }
}

// キャッシュの有効性チェック
function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp < CACHE_TTL;
}

// イベントからタグを抽出
function extractTagsFromEvent(event: Event): string[] {
  return event.tags
    .filter(tag => tag[0] === 't' && tag[1])
    .map(tag => tag[1]);
}

/**
 * ユーザーがフォローしているタグを取得
 */
export async function fetchFollowedTags(pubkey: string): Promise<string[]> {
  // 1. メモリキャッシュをチェック
  const memoryCached = memoryCache.get(pubkey);
  if (memoryCached && isCacheValid(memoryCached)) {
    return memoryCached.tags;
  }

  // 2. ローカルストレージをチェック
  const storageCached = loadCacheFromStorage(pubkey);
  if (storageCached && isCacheValid(storageCached)) {
    memoryCache.set(pubkey, storageCached);
    return storageCached.tags;
  }

  // 3. リレーから取得
  try {
    const events = await fetchEvents({
      kinds: [TAG_FOLLOW_KIND],
      authors: [pubkey],
      '#d': [TAG_FOLLOW_D_TAG],
      limit: 1,
    });

    if (events.length > 0) {
      // 最新のイベントを取得
      const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];
      const tags = extractTagsFromEvent(latestEvent);
      
      const entry: CacheEntry = {
        tags,
        timestamp: Date.now(),
        eventId: latestEvent.id,
      };
      
      memoryCache.set(pubkey, entry);
      saveCacheToStorage(pubkey, entry);
      
      return tags;
    }
  } catch (error) {
    console.error('[tagFollow] Failed to fetch followed tags:', error);
  }

  // イベントがない場合は空配列を返す
  const emptyEntry: CacheEntry = {
    tags: [],
    timestamp: Date.now(),
  };
  memoryCache.set(pubkey, emptyEntry);
  saveCacheToStorage(pubkey, emptyEntry);
  
  return [];
}

/**
 * タグフォローリストを更新（追加・削除）
 */
export async function updateFollowedTags(
  tags: string[],
  signEvent: (event: EventTemplate) => Promise<Event>
): Promise<{ success: boolean; error?: string }> {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    
    // タグを構築
    const eventTags: string[][] = [
      ['d', TAG_FOLLOW_D_TAG],
      ['client', NOSTRDRAW_CLIENT_TAG],
      ...tags.map(tag => ['t', tag]),
    ];

    const eventTemplate: EventTemplate = {
      kind: TAG_FOLLOW_KIND,
      created_at: timestamp,
      tags: eventTags,
      content: '',
    };

    const signedEvent = await signEvent(eventTemplate);
    await publishEvent(signedEvent);

    // キャッシュを更新
    const entry: CacheEntry = {
      tags,
      timestamp: Date.now(),
      eventId: signedEvent.id,
    };
    memoryCache.set(signedEvent.pubkey, entry);
    saveCacheToStorage(signedEvent.pubkey, entry);

    return { success: true };
  } catch (error) {
    console.error('[tagFollow] Failed to update followed tags:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー',
    };
  }
}

/**
 * タグをフォローに追加
 */
export async function followTag(
  tag: string,
  pubkey: string,
  signEvent: (event: EventTemplate) => Promise<Event>
): Promise<{ success: boolean; error?: string }> {
  const currentTags = await fetchFollowedTags(pubkey);
  
  // 既にフォロー済みの場合はスキップ
  if (currentTags.includes(tag)) {
    return { success: true };
  }

  const newTags = [...currentTags, tag];
  return updateFollowedTags(newTags, signEvent);
}

/**
 * タグをフォローから削除
 */
export async function unfollowTag(
  tag: string,
  pubkey: string,
  signEvent: (event: EventTemplate) => Promise<Event>
): Promise<{ success: boolean; error?: string }> {
  const currentTags = await fetchFollowedTags(pubkey);
  
  // フォローしていない場合はスキップ
  if (!currentTags.includes(tag)) {
    return { success: true };
  }

  const newTags = currentTags.filter(t => t !== tag);
  return updateFollowedTags(newTags, signEvent);
}

/**
 * タグがフォローされているかチェック
 */
export async function isTagFollowed(pubkey: string, tag: string): Promise<boolean> {
  const tags = await fetchFollowedTags(pubkey);
  return tags.includes(tag);
}

/**
 * キャッシュをクリア（ログアウト時など）
 */
export function clearTagFollowCache(pubkey?: string): void {
  if (pubkey) {
    memoryCache.delete(pubkey);
    try {
      localStorage.removeItem(`${STORAGE_KEY}-${pubkey}`);
    } catch {
      // 無視
    }
  } else {
    memoryCache.clear();
  }
}
