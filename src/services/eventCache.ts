// イベントキャッシュサービス
// 全てのリレーリクエストで透過的に使用されるNostrイベントのキャッシュ機構

import type { Event, Filter } from 'nostr-tools';

// キャッシュ設定
const STORAGE_KEY = 'nostrdraw-event-cache';
const MAX_CACHE_SIZE_STORAGE_KEY = 'nostrdraw-cache-max-size';
const DEFAULT_MAX_CACHE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

// 最大キャッシュサイズ（変更可能）
let maxCacheSizeBytes = DEFAULT_MAX_CACHE_SIZE_BYTES;

// ローカルストレージから最大キャッシュサイズを読み込み
function loadMaxCacheSize(): void {
  try {
    const saved = localStorage.getItem(MAX_CACHE_SIZE_STORAGE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 1024 * 1024) { // 最低1MB
        maxCacheSizeBytes = parsed;
      }
    }
  } catch {
    // エラーを無視
  }
}

// 初期化時に最大サイズを読み込み
loadMaxCacheSize();

// メモリキャッシュ
const eventCache = new Map<string, Event>();

// タグインデックス: tagKey -> Set<eventId>
// tagKeyの形式: "e:eventId" または "p:pubkey" など
const tagIndex = new Map<string, Set<string>>();

// kindインデックス: kind -> Set<eventId>
const kindIndex = new Map<number, Set<string>>();

// authorインデックス: pubkey -> Set<eventId>
const authorIndex = new Map<string, Set<string>>();

// 現在のキャッシュサイズ（バイト）
let currentCacheSize = 0;

// ローカルストレージへの保存をデバウンス
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 1000; // 1秒後に保存

function scheduleSaveToStorage(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    saveCacheToStorage();
    saveTimeout = null;
  }, SAVE_DEBOUNCE_MS);
}

// イベントのサイズを計算
function getEventSize(event: Event): number {
  return JSON.stringify(event).length * 2; // UTF-16を考慮
}

// インデックスにイベントを追加
function addToIndex(event: Event): void {
  // kindインデックス
  if (!kindIndex.has(event.kind)) {
    kindIndex.set(event.kind, new Set());
  }
  kindIndex.get(event.kind)!.add(event.id);
  
  // authorインデックス
  if (!authorIndex.has(event.pubkey)) {
    authorIndex.set(event.pubkey, new Set());
  }
  authorIndex.get(event.pubkey)!.add(event.id);
  
  // タグインデックス
  for (const tag of event.tags) {
    if (tag.length >= 2) {
      const tagKey = `${tag[0]}:${tag[1]}`;
      if (!tagIndex.has(tagKey)) {
        tagIndex.set(tagKey, new Set());
      }
      tagIndex.get(tagKey)!.add(event.id);
    }
  }
}

// インデックスからイベントを削除
function removeFromIndex(event: Event): void {
  // kindインデックス
  kindIndex.get(event.kind)?.delete(event.id);
  
  // authorインデックス
  authorIndex.get(event.pubkey)?.delete(event.id);
  
  // タグインデックス
  for (const tag of event.tags) {
    if (tag.length >= 2) {
      const tagKey = `${tag[0]}:${tag[1]}`;
      tagIndex.get(tagKey)?.delete(event.id);
    }
  }
}

// LRU削除（古いイベントから削除）
function evictOldEvents(requiredSpace: number): void {
  // created_atでソートして古い順に削除
  const sortedEvents = Array.from(eventCache.values())
    .sort((a, b) => a.created_at - b.created_at);
  
  let freedSpace = 0;
  for (const event of sortedEvents) {
    if (freedSpace >= requiredSpace) break;
    
    const size = getEventSize(event);
    removeFromIndex(event);
    eventCache.delete(event.id);
    currentCacheSize -= size;
    freedSpace += size;
  }
}

// ローカルストレージからキャッシュを読み込み
function loadCacheFromStorage(): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    
    const events: Event[] = JSON.parse(saved);
    for (const event of events) {
      const size = getEventSize(event);
      if (currentCacheSize + size <= maxCacheSizeBytes) {
        eventCache.set(event.id, event);
        addToIndex(event);
        currentCacheSize += size;
      }
    }
  } catch {
    // エラーを無視
  }
}

// ローカルストレージにキャッシュを保存
function saveCacheToStorage(): void {
  try {
    const events = Array.from(eventCache.values());
    const json = JSON.stringify(events);
    
    // ローカルストレージの制限（通常5MB）を考慮
    if (json.length < 4 * 1024 * 1024) {
      localStorage.setItem(STORAGE_KEY, json);
    }
  } catch {
    // ストレージ容量オーバーなどのエラーを無視
  }
}

// 初期化時にキャッシュを読み込み
loadCacheFromStorage();

/**
 * イベントをキャッシュに追加
 */
export function cacheEvent(event: Event): void {
  if (eventCache.has(event.id)) return;
  
  const size = getEventSize(event);
  
  // サイズ制限チェック
  if (currentCacheSize + size > maxCacheSizeBytes) {
    evictOldEvents(size);
  }
  
  eventCache.set(event.id, event);
  addToIndex(event);
  currentCacheSize += size;
  
  // ローカルストレージへの保存をスケジュール（デバウンス）
  scheduleSaveToStorage();
}

/**
 * 複数のイベントをキャッシュに追加
 */
export function cacheEvents(events: Event[]): void {
  for (const event of events) {
    cacheEvent(event);
  }
  // cacheEvent内でscheduleSaveToStorageが呼ばれるので、ここでは不要
}

/**
 * キャッシュからイベントを取得（同期的）
 */
export function getCachedEvent(eventId: string): Event | null {
  return eventCache.get(eventId) || null;
}

/**
 * キャッシュからイベントを削除
 * 削除リクエスト後などに使用
 */
export function removeEventFromCache(eventId: string): boolean {
  const event = eventCache.get(eventId);
  if (!event) return false;
  
  // インデックスから削除
  const indexKey = `kind:${event.kind}`;
  const kindSet = tagIndex.get(indexKey);
  if (kindSet) {
    kindSet.delete(eventId);
  }
  
  const authorKey = `author:${event.pubkey}`;
  const authorSet = tagIndex.get(authorKey);
  if (authorSet) {
    authorSet.delete(eventId);
  }
  
  // タグインデックスから削除
  for (const tag of event.tags) {
    if (tag.length >= 2) {
      const tagKey = `#${tag[0]}:${tag[1]}`;
      const tagSet = tagIndex.get(tagKey);
      if (tagSet) {
        tagSet.delete(eventId);
      }
    }
  }
  
  // サイズを減算
  const eventSize = JSON.stringify(event).length;
  currentCacheSize -= eventSize;
  
  // キャッシュから削除
  eventCache.delete(eventId);
  
  // ストレージに保存
  scheduleSaveToStorage();
  
  console.log(`[EventCache] Removed event: ${eventId}`);
  return true;
}

/**
 * フィルタに合致するイベントをキャッシュから取得
 * @returns マッチしたイベント（created_at降順）
 */
export function getCachedEventsByFilter(filter: Filter): Event[] {
  let candidateIds: Set<string> | null = null;
  
  // idsフィルタ
  if (filter.ids && filter.ids.length > 0) {
    candidateIds = new Set(filter.ids.filter(id => eventCache.has(id)));
  }
  
  // kindsフィルタ
  if (filter.kinds && filter.kinds.length > 0) {
    const kindMatches = new Set<string>();
    for (const kind of filter.kinds) {
      const ids = kindIndex.get(kind);
      if (ids) {
        for (const id of ids) {
          kindMatches.add(id);
        }
      }
    }
    candidateIds = candidateIds 
      ? new Set([...candidateIds].filter(id => kindMatches.has(id)))
      : kindMatches;
  }
  
  // authorsフィルタ
  if (filter.authors && filter.authors.length > 0) {
    const authorMatches = new Set<string>();
    for (const author of filter.authors) {
      const ids = authorIndex.get(author);
      if (ids) {
        for (const id of ids) {
          authorMatches.add(id);
        }
      }
    }
    candidateIds = candidateIds
      ? new Set([...candidateIds].filter(id => authorMatches.has(id)))
      : authorMatches;
  }
  
  // #eタグフィルタ
  if (filter['#e'] && filter['#e'].length > 0) {
    const tagMatches = new Set<string>();
    for (const value of filter['#e']) {
      const ids = tagIndex.get(`e:${value}`);
      if (ids) {
        for (const id of ids) {
          tagMatches.add(id);
        }
      }
    }
    candidateIds = candidateIds
      ? new Set([...candidateIds].filter(id => tagMatches.has(id)))
      : tagMatches;
  }
  
  // #pタグフィルタ
  if (filter['#p'] && filter['#p'].length > 0) {
    const tagMatches = new Set<string>();
    for (const value of filter['#p']) {
      const ids = tagIndex.get(`p:${value}`);
      if (ids) {
        for (const id of ids) {
          tagMatches.add(id);
        }
      }
    }
    candidateIds = candidateIds
      ? new Set([...candidateIds].filter(id => tagMatches.has(id)))
      : tagMatches;
  }
  
  // #dタグフィルタ
  if (filter['#d'] && filter['#d'].length > 0) {
    const tagMatches = new Set<string>();
    for (const value of filter['#d']) {
      const ids = tagIndex.get(`d:${value}`);
      if (ids) {
        for (const id of ids) {
          tagMatches.add(id);
        }
      }
    }
    candidateIds = candidateIds
      ? new Set([...candidateIds].filter(id => tagMatches.has(id)))
      : tagMatches;
  }
  
  // #tタグフィルタ（カテゴリタグ）
  if (filter['#t'] && filter['#t'].length > 0) {
    const tagMatches = new Set<string>();
    for (const value of filter['#t']) {
      const ids = tagIndex.get(`t:${value}`);
      if (ids) {
        for (const id of ids) {
          tagMatches.add(id);
        }
      }
    }
    candidateIds = candidateIds
      ? new Set([...candidateIds].filter(id => tagMatches.has(id)))
      : tagMatches;
  }
  
  // 候補がない場合は全イベントを対象
  if (candidateIds === null) {
    candidateIds = new Set(eventCache.keys());
  }
  
  // イベントを取得してフィルタリング
  const results: Event[] = [];
  for (const id of candidateIds) {
    const event = eventCache.get(id);
    if (!event) continue;
    
    // sinceフィルタ
    if (filter.since && event.created_at < filter.since) continue;
    
    // untilフィルタ
    if (filter.until && event.created_at > filter.until) continue;
    
    results.push(event);
  }
  
  // created_at降順でソート
  results.sort((a, b) => b.created_at - a.created_at);
  
  // limitを適用
  if (filter.limit && results.length > filter.limit) {
    return results.slice(0, filter.limit);
  }
  
  return results;
}

/**
 * フィルタでイベントを取得（従来のPromiseベースAPI、後方互換性のため）
 */
export async function fetchEventsWithCache(
  filter: Filter,
  fetchFromRelay: (filter: Filter) => Promise<Event[]>
): Promise<Event[]> {
  const eventMap = new Map<string, Event>();
  
  // キャッシュから取得
  const cachedEvents = getCachedEventsByFilter(filter);
  for (const event of cachedEvents) {
    eventMap.set(event.id, event);
  }
  
  // リレーから取得
  const relayEvents = await fetchFromRelay(filter);
  
  for (const event of relayEvents) {
    cacheEvent(event);
    if (!eventMap.has(event.id)) {
      eventMap.set(event.id, event);
    }
  }
  
  const results = Array.from(eventMap.values())
    .sort((a, b) => b.created_at - a.created_at);
  
  if (filter.limit && results.length > filter.limit) {
    return results.slice(0, filter.limit);
  }
  
  return results;
}

/**
 * キャッシュからイベントを即座に取得（同期的）
 * リレーへのリクエストなし
 */
export function getEventsFromCache(filter: Filter): Event[] {
  return getCachedEventsByFilter(filter);
}

/**
 * ストリーミングでイベントを取得（キャッシュ優先）
 * キャッシュから即座にイベントを返し、その後リレーからのイベントをコールバックで返す
 * @param filter フィルタ
 * @param fetchFromRelay リレーからストリーミングで取得する関数
 * @param onEvent イベント受信時のコールバック
 * @param onComplete 完了時のコールバック
 * @returns unsubscribe関数
 */
export function streamEventsWithCache(
  filter: Filter,
  fetchFromRelay: (
    filter: Filter,
    onEvent: (event: Event) => void,
    onComplete: () => void
  ) => () => void,
  onEvent: (event: Event) => void,
  onComplete?: () => void
): () => void {
  const seenIds = new Set<string>();
  let unsubscribed = false;
  
  console.log('[streamEventsWithCache] filter:', JSON.stringify(filter));
  
  // まずキャッシュから取得して即座に1つずつ返す
  const cachedEvents = getCachedEventsByFilter(filter);
  console.log('[streamEventsWithCache] cached events count:', cachedEvents.length);
  for (const event of cachedEvents) {
    if (unsubscribed) break;
    if (!seenIds.has(event.id)) {
      seenIds.add(event.id);
      onEvent(event);
    }
  }
  
  // リレーから取得（fetchFromRelayを使用）
  let relayEventCount = 0;
  const unsubscribeRelay = fetchFromRelay(
    filter,
    (event: Event) => {
      relayEventCount++;
      if (relayEventCount <= 5) {
        console.log('[streamEventsWithCache] relay event:', event.id);
      }
      if (unsubscribed) return;
      if (!seenIds.has(event.id)) {
        seenIds.add(event.id);
        cacheEvent(event);
        onEvent(event);
      }
    },
    () => {
      console.log('[streamEventsWithCache] complete, total relay events:', relayEventCount);
      if (onComplete && !unsubscribed) {
        onComplete();
      }
    }
  );
  
  return () => {
    unsubscribed = true;
    unsubscribeRelay();
  };
}

/**
 * キャッシュをクリア
 */
export function clearEventCache(): void {
  eventCache.clear();
  tagIndex.clear();
  kindIndex.clear();
  authorIndex.clear();
  currentCacheSize = 0;
  
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // エラーを無視
  }
}

/**
 * キャッシュの統計情報を取得
 */
export function getEventCacheStats(): { 
  count: number; 
  sizeBytes: number; 
  maxSizeBytes: number;
  sizeMB: string;
  maxSizeMB: string;
  usagePercent: number;
} {
  return {
    count: eventCache.size,
    sizeBytes: currentCacheSize,
    maxSizeBytes: maxCacheSizeBytes,
    sizeMB: (currentCacheSize / (1024 * 1024)).toFixed(2),
    maxSizeMB: (maxCacheSizeBytes / (1024 * 1024)).toFixed(0),
    usagePercent: maxCacheSizeBytes > 0 
      ? Math.round((currentCacheSize / maxCacheSizeBytes) * 100)
      : 0,
  };
}

/**
 * 最大キャッシュサイズを設定
 * @param sizeBytes 最大サイズ（バイト）、最低1MB
 */
export function setMaxCacheSize(sizeBytes: number): void {
  const minSize = 1024 * 1024; // 1MB
  const newSize = Math.max(sizeBytes, minSize);
  
  maxCacheSizeBytes = newSize;
  
  // ローカルストレージに保存
  try {
    localStorage.setItem(MAX_CACHE_SIZE_STORAGE_KEY, newSize.toString());
  } catch {
    // エラーを無視
  }
  
  // 新しい最大サイズを超えている場合は古いイベントを削除
  if (currentCacheSize > maxCacheSizeBytes) {
    evictOldEvents(currentCacheSize - maxCacheSizeBytes);
    scheduleSaveToStorage();
  }
}
