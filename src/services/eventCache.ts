// イベントキャッシュサービス
// 利用側から透過的に使用できるNostrイベントのキャッシュ機構

import type { Event } from 'nostr-tools';
import { fetchEvents } from './relay';

// キャッシュ設定
const STORAGE_KEY = 'nostrdraw-event-cache';
const MAX_CACHE_SIZE = 500; // 最大キャッシュ数

// メモリキャッシュ
const memoryCache = new Map<string, Event>();

// 重複リクエスト防止用
const pendingRequests = new Map<string, Promise<Event | null>>();

// ローカルストレージからキャッシュを読み込み
function loadCacheFromStorage(): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    
    const entries: [string, Event][] = JSON.parse(saved);
    for (const [id, event] of entries) {
      memoryCache.set(id, event);
    }
  } catch {
    // エラーを無視
  }
}

// ローカルストレージにキャッシュを保存
function saveCacheToStorage(): void {
  try {
    // サイズ制限
    const entries = Array.from(memoryCache.entries());
    if (entries.length > MAX_CACHE_SIZE) {
      // 古いエントリを削除（挿入順）
      const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
      for (const [id] of toRemove) {
        memoryCache.delete(id);
      }
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(memoryCache.entries())));
  } catch {
    // ストレージ容量オーバーなどのエラーを無視
  }
}

// 初期化時にキャッシュを読み込み
loadCacheFromStorage();

/**
 * イベントIDでイベントを取得（キャッシュ付き）
 * 利用側から透過的に使用可能
 */
export async function fetchEventById(eventId: string, kinds?: number[]): Promise<Event | null> {
  // メモリキャッシュをチェック
  const cached = memoryCache.get(eventId);
  if (cached) {
    return cached;
  }
  
  // 重複リクエストをチェック
  const pending = pendingRequests.get(eventId);
  if (pending) {
    return pending;
  }
  
  // リレーから取得
  const promise = (async (): Promise<Event | null> => {
    try {
      const filter: { ids: string[]; kinds?: number[] } = { ids: [eventId] };
      if (kinds) {
        filter.kinds = kinds;
      }
      
      const events = await fetchEvents(filter);
      
      if (events.length > 0) {
        const event = events[0];
        // キャッシュに追加
        memoryCache.set(eventId, event);
        saveCacheToStorage();
        return event;
      }
      
      return null;
    } finally {
      pendingRequests.delete(eventId);
    }
  })();
  
  pendingRequests.set(eventId, promise);
  return promise;
}

/**
 * 複数のイベントIDでイベントを取得（キャッシュ付き）
 * キャッシュにないものだけリレーに問い合わせ
 */
export async function fetchEventsByIds(eventIds: string[], kinds?: number[]): Promise<Event[]> {
  const results: Event[] = [];
  const uncachedIds: string[] = [];
  
  // キャッシュからチェック
  for (const id of eventIds) {
    const cached = memoryCache.get(id);
    if (cached) {
      results.push(cached);
    } else {
      uncachedIds.push(id);
    }
  }
  
  // キャッシュにないものをリレーから取得
  if (uncachedIds.length > 0) {
    const filter: { ids: string[]; kinds?: number[] } = { ids: uncachedIds };
    if (kinds) {
      filter.kinds = kinds;
    }
    
    const events = await fetchEvents(filter);
    
    // キャッシュに追加
    for (const event of events) {
      memoryCache.set(event.id, event);
      results.push(event);
    }
    
    saveCacheToStorage();
  }
  
  return results;
}

/**
 * イベントをキャッシュに追加（新規投稿時など）
 */
export function cacheEvent(event: Event): void {
  memoryCache.set(event.id, event);
  saveCacheToStorage();
}

/**
 * 複数のイベントをキャッシュに追加
 */
export function cacheEvents(events: Event[]): void {
  for (const event of events) {
    memoryCache.set(event.id, event);
  }
  saveCacheToStorage();
}

/**
 * キャッシュからイベントを取得（同期的、キャッシュヒットのみ）
 */
export function getCachedEvent(eventId: string): Event | null {
  return memoryCache.get(eventId) || null;
}

/**
 * キャッシュをクリア
 */
export function clearEventCache(): void {
  memoryCache.clear();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // エラーを無視
  }
}

/**
 * キャッシュの統計情報を取得
 */
export function getEventCacheStats(): { size: number; maxSize: number } {
  return {
    size: memoryCache.size,
    maxSize: MAX_CACHE_SIZE,
  };
}

/**
 * 条件に合うイベントをキャッシュから検索（同期的）
 * @param filter フィルタ条件
 * @returns 条件に合うイベントの配列（新しい順）
 */
export function getCachedEventsByFilter(filter: {
  kinds?: number[];
  authors?: string[];
  since?: number;
  limit?: number;
}): Event[] {
  const results: Event[] = [];
  
  for (const event of memoryCache.values()) {
    // kind フィルタ
    if (filter.kinds && !filter.kinds.includes(event.kind)) {
      continue;
    }
    
    // authors フィルタ
    if (filter.authors && !filter.authors.includes(event.pubkey)) {
      continue;
    }
    
    // since フィルタ
    if (filter.since && event.created_at < filter.since) {
      continue;
    }
    
    results.push(event);
  }
  
  // 新しい順にソート
  results.sort((a, b) => b.created_at - a.created_at);
  
  // limit適用
  if (filter.limit && results.length > filter.limit) {
    return results.slice(0, filter.limit);
  }
  
  return results;
}
