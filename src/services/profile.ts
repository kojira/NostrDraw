// プロフィール取得サービス

import { nip19 } from 'nostr-tools';
import { fetchEvents } from './relay';
import type { NostrProfile } from '../types';

const profileCache = new Map<string, NostrProfile>();

export function pubkeyToNpub(pubkey: string): string {
  return nip19.npubEncode(pubkey);
}

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

export async function fetchProfile(pubkey: string): Promise<NostrProfile | null> {
  // キャッシュチェック
  const cached = profileCache.get(pubkey);
  if (cached) {
    return cached;
  }

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
  
  try {
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
    
    profileCache.set(pubkey, profile);
    return profile;
  } catch {
    return null;
  }
}

export async function fetchProfiles(pubkeys: string[]): Promise<Map<string, NostrProfile>> {
  const results = new Map<string, NostrProfile>();
  const uncachedPubkeys: string[] = [];

  // キャッシュから取得
  for (const pubkey of pubkeys) {
    const cached = profileCache.get(pubkey);
    if (cached) {
      results.set(pubkey, cached);
    } else {
      uncachedPubkeys.push(pubkey);
    }
  }

  if (uncachedPubkeys.length === 0) {
    return results;
  }

  // 未キャッシュのプロフィールを取得
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

  // プロフィールをパース
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
      
      profileCache.set(pubkey, profile);
      results.set(pubkey, profile);
    } catch {
      // パース失敗は無視
    }
  }

  return results;
}

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

export function clearProfileCache(): void {
  profileCache.clear();
}

