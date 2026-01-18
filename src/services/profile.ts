// プロフィール取得サービス（kind 0）
// キャッシュ機構付き - 利用側はキャッシュを意識せずに使える

import { nip19, type Event, type EventTemplate } from 'nostr-tools';
import { fetchEvents, publishEvent } from './relay';
import type { NostrProfile } from '../types';

// キャッシュ設定
const CACHE_TTL = 5 * 60 * 1000; // 5分
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

// キャッシュの有効性チェック
function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp < CACHE_TTL;
}

// ローカルストレージからキャッシュを読み込み
function loadCacheFromStorage(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, CacheEntry>;
      const now = Date.now();
      for (const [pubkey, entry] of Object.entries(parsed)) {
        // 有効期限内のエントリのみ復元
        if (now - entry.timestamp < CACHE_TTL) {
          memoryCache.set(pubkey, entry);
        }
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
    const now = Date.now();
    
    // 有効なエントリのみ保存（最大数制限）
    let count = 0;
    for (const [pubkey, entry] of memoryCache) {
      if (now - entry.timestamp < CACHE_TTL && count < MAX_CACHE_SIZE) {
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
  // 1. メモリキャッシュをチェック
  const cached = memoryCache.get(pubkey);
  if (cached && isCacheValid(cached)) {
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

  // 1. キャッシュから取得
  for (const pubkey of pubkeys) {
    const cached = memoryCache.get(pubkey);
    if (cached && isCacheValid(cached)) {
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
  if (cached && isCacheValid(cached)) {
    return cached.profile;
  }
  return null;
}

// キャッシュを強制的に更新
export async function refreshProfile(pubkey: string): Promise<NostrProfile | null> {
  // キャッシュを削除して再取得
  memoryCache.delete(pubkey);
  return fetchProfile(pubkey);
}

// フォローリストを取得（kind 3の生イベント）
export async function fetchFollowListEvent(pubkey: string): Promise<Event | null> {
  const events = await fetchEvents({
    kinds: [3],
    authors: [pubkey],
    limit: 1,
  });

  if (events.length === 0) {
    return null;
  }

  // 最新のkind:3イベントを返す
  return events.sort((a, b) => b.created_at - a.created_at)[0];
}

// ユーザーをフォローする
export async function followUser(
  targetPubkey: string,
  myPubkey: string,
  signEvent: (event: EventTemplate) => Promise<Event>
): Promise<boolean> {
  try {
    // 現在のフォローリストを取得
    const currentEvent = await fetchFollowListEvent(myPubkey);
    
    // 現在のpタグを取得（重複を防ぐためSetを使用）
    const currentTags = currentEvent?.tags || [];
    const pTags = new Map<string, string[]>();
    
    for (const tag of currentTags) {
      if (tag[0] === 'p' && tag[1]) {
        pTags.set(tag[1], tag);
      }
    }
    
    // 既にフォローしている場合は何もしない
    if (pTags.has(targetPubkey)) {
      return true;
    }
    
    // 新しいpタグを追加
    pTags.set(targetPubkey, ['p', targetPubkey]);
    
    // 新しいイベントを作成
    const eventTemplate: EventTemplate = {
      kind: 3,
      created_at: Math.floor(Date.now() / 1000),
      tags: Array.from(pTags.values()),
      content: currentEvent?.content || '', // リレー情報を保持
    };
    
    // 署名して公開
    const signedEvent = await signEvent(eventTemplate);
    await publishEvent(signedEvent);
    
    return true;
  } catch (error) {
    console.error('フォローに失敗:', error);
    return false;
  }
}

// ユーザーのフォローを解除する
export async function unfollowUser(
  targetPubkey: string,
  myPubkey: string,
  signEvent: (event: EventTemplate) => Promise<Event>
): Promise<boolean> {
  try {
    // 現在のフォローリストを取得
    const currentEvent = await fetchFollowListEvent(myPubkey);
    
    if (!currentEvent) {
      // フォローリストがない場合は何もしない
      return true;
    }
    
    // 対象ユーザーを除外したpタグを作成
    const newTags = currentEvent.tags.filter(
      tag => !(tag[0] === 'p' && tag[1] === targetPubkey)
    );
    
    // 新しいイベントを作成
    const eventTemplate: EventTemplate = {
      kind: 3,
      created_at: Math.floor(Date.now() / 1000),
      tags: newTags,
      content: currentEvent.content || '',
    };
    
    // 署名して公開
    const signedEvent = await signEvent(eventTemplate);
    await publishEvent(signedEvent);
    
    return true;
  } catch (error) {
    console.error('フォロー解除に失敗:', error);
    return false;
  }
}

// 特定のユーザーをフォローしているかチェック
export async function isFollowing(myPubkey: string, targetPubkey: string): Promise<boolean> {
  const followees = await fetchFollowees(myPubkey);
  return followees.includes(targetPubkey);
}

// プロフィールを更新（kind 0イベントを発行）
export async function updateProfile(
  profile: { name: string; about?: string; picture?: string },
  myPubkey: string,
  signEvent: (event: EventTemplate) => Promise<Event>
): Promise<boolean> {
  try {
    // 現在のプロフィールを取得（既存の情報を保持するため）
    const currentProfile = await fetchProfile(myPubkey);
    
    // 新しいプロフィール内容を作成
    const content: Record<string, string> = {};
    
    // 既存のプロフィール情報を引き継ぎ
    if (currentProfile) {
      if (currentProfile.name) content.name = currentProfile.name;
      if (currentProfile.display_name) content.display_name = currentProfile.display_name;
      if (currentProfile.picture) content.picture = currentProfile.picture;
      if (currentProfile.about) content.about = currentProfile.about;
      if (currentProfile.nip05) content.nip05 = currentProfile.nip05;
    }
    
    // 新しい情報で上書き
    content.name = profile.name;
    content.display_name = profile.name; // display_nameも同じにする
    if (profile.about !== undefined) content.about = profile.about;
    if (profile.picture !== undefined && profile.picture !== '') {
      content.picture = profile.picture;
    }
    
    // kind 0イベントを作成
    const eventTemplate: EventTemplate = {
      kind: 0,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify(content),
    };
    
    // 署名して公開
    const signedEvent = await signEvent(eventTemplate);
    await publishEvent(signedEvent);
    
    // キャッシュを更新
    const updatedProfile: NostrProfile = {
      pubkey: myPubkey,
      npub: nip19.npubEncode(myPubkey),
      name: content.name,
      display_name: content.display_name,
      picture: content.picture,
      about: content.about,
      nip05: content.nip05,
    };
    
    memoryCache.set(myPubkey, {
      profile: updatedProfile,
      timestamp: Date.now(),
    });
    saveCacheToStorage();
    
    return true;
  } catch (error) {
    console.error('プロフィール更新に失敗:', error);
    return false;
  }
}