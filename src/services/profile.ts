// プロフィール取得サービス（kind 0）
// キャッシュ機構付き - 利用側はキャッシュを意識せずに使える
// TTL無制限、プロフィールページで明示的にrefreshProfileを呼ぶ

import { nip19 } from 'nostr-tools';
import { fetchEvents } from './relay';
import type { NostrProfile } from '../types';

// キャッシュ設定
const STORAGE_KEY = 'nostrdraw-profile-cache';
const MAX_CACHE_SIZE = 500; // 最大キャッシュ数

interface CacheEntry {
  profile: NostrProfile;
  timestamp: number;
}

// メモリキャッシュ
const memoryCache = new Map<string, CacheEntry>();

// 進行中のリクエストを追跡（重複防止）
const pendingRequests = new Map<string, Promise<NostrProfile | null>>();

// ローカルストレージからキャッシュを読み込み
function loadCacheFromStorage(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, CacheEntry>;
      for (const [pubkey, entry] of Object.entries(parsed)) {
        memoryCache.set(pubkey, entry);
      }
    }
  } catch {
    // パース失敗は無視
  }
}

// ローカルストレージにキャッシュを保存
function saveCacheToStorage(): void {
  try {
    const entries: Record<string, CacheEntry> = {};
    
    // 最大数制限
    let count = 0;
    for (const [pubkey, entry] of memoryCache) {
      if (count < MAX_CACHE_SIZE) {
        entries[pubkey] = entry;
        count++;
      }
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // 保存失敗は無視（容量オーバーなど）
  }
}

// 初期化時にストレージから読み込み
loadCacheFromStorage();

// pubkey → npub 変換
export function pubkeyToNpub(pubkey: string): string {
  return nip19.npubEncode(pubkey);
}

// npub → pubkey 変換
export function npubToPubkey(npub: string): string | null {
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type === 'npub') {
      return decoded.data;
    }
    return null;
  } catch {
    return null;
  }
}

// 単一プロフィール取得（キャッシュ優先）
export async function fetchProfile(pubkey: string): Promise<NostrProfile | null> {
  // 1. メモリキャッシュをチェック（TTL無制限）
  const cached = memoryCache.get(pubkey);
  if (cached) {
    return cached.profile;
  }

  // 2. 進行中のリクエストがあれば待機（重複防止）
  const pending = pendingRequests.get(pubkey);
  if (pending) {
    return pending;
  }

  // 3. 新規リクエストを作成
  const request = (async (): Promise<NostrProfile | null> => {
    try {
      const events = await fetchEvents({
        kinds: [0],
        authors: [pubkey],
        limit: 1,
      });

      if (events.length === 0) {
        return null;
      }

      // 最新のkind:0イベントを取得
      const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];
      
      const content = JSON.parse(latestEvent.content);
      const profile: NostrProfile = {
        pubkey,
        npub: pubkeyToNpub(pubkey),
        name: content.name,
        display_name: content.display_name,
        picture: content.picture,
        about: content.about,
        nip05: content.nip05,
      };
      
      // キャッシュに保存
      memoryCache.set(pubkey, { profile, timestamp: Date.now() });
      saveCacheToStorage();
      
      return profile;
    } catch {
      return null;
    } finally {
      // リクエスト完了後にpendingから削除
      pendingRequests.delete(pubkey);
    }
  })();

  pendingRequests.set(pubkey, request);
  return request;
}

// 複数プロフィール一括取得（キャッシュ優先）
export async function fetchProfiles(pubkeys: string[]): Promise<Map<string, NostrProfile>> {
  const results = new Map<string, NostrProfile>();
  const uncachedPubkeys: string[] = [];

  // 1. キャッシュから取得（TTL無制限）
  for (const pubkey of pubkeys) {
    const cached = memoryCache.get(pubkey);
    if (cached) {
      results.set(pubkey, cached.profile);
    } else {
      uncachedPubkeys.push(pubkey);
    }
  }

  if (uncachedPubkeys.length === 0) {
    return results;
  }

  // 2. 未キャッシュのプロフィールを一括取得
  const events = await fetchEvents({
    kinds: [0],
    authors: uncachedPubkeys,
  });

  // pubkeyごとに最新のイベントを取得
  const latestEvents = new Map<string, typeof events[0]>();
  for (const event of events) {
    const existing = latestEvents.get(event.pubkey);
    if (!existing || event.created_at > existing.created_at) {
      latestEvents.set(event.pubkey, event);
    }
  }

  // プロフィールをパース＆キャッシュ
  const now = Date.now();
  for (const [pubkey, event] of latestEvents) {
    try {
      const content = JSON.parse(event.content);
      const profile: NostrProfile = {
        pubkey,
        npub: pubkeyToNpub(pubkey),
        name: content.name,
        display_name: content.display_name,
        picture: content.picture,
        about: content.about,
        nip05: content.nip05,
      };
      
      memoryCache.set(pubkey, { profile, timestamp: now });
      results.set(pubkey, profile);
    } catch {
      // パース失敗は無視
    }
  }

  saveCacheToStorage();
  return results;
}

// フォロイー一覧取得（kind 3）
export async function fetchFollowees(pubkey: string): Promise<string[]> {
  const events = await fetchEvents({
    kinds: [3], // Contact list
    authors: [pubkey],
    limit: 1,
  });

  if (events.length === 0) {
    return [];
  }

  // 最新のkind:3イベントを取得
  const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];
  
  // pタグからフォロイーのpubkeyを抽出
  const followees = latestEvent.tags
    .filter(tag => tag[0] === 'p' && tag[1])
    .map(tag => tag[1]);

  return followees;
}

// キャッシュをクリア
export function clearProfileCache(): void {
  memoryCache.clear();
  pendingRequests.clear();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 削除失敗は無視
  }
}

// キャッシュ済みプロフィールを取得（非同期なし、nullなら未キャッシュ）
export function getCachedProfile(pubkey: string): NostrProfile | null {
  const cached = memoryCache.get(pubkey);
  return cached?.profile || null;
}

// キャッシュを強制的に更新（プロフィールページで使用）
export async function refreshProfile(pubkey: string): Promise<NostrProfile | null> {
  memoryCache.delete(pubkey);
  return fetchProfile(pubkey);
}
