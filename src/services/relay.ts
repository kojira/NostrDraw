// リレー接続管理サービス

import { SimplePool, type Filter, type Event } from 'nostr-tools';
import { DEFAULT_RELAYS, type RelayConfig } from '../types';

let pool: SimplePool | null = null;
let activeRelays: RelayConfig[] = [...DEFAULT_RELAYS];

// シードリレー（NIP-65取得用）
// 日本語圏向け
const SEED_RELAYS_JA: string[] = [
  'wss://yabu.me',
  'wss://r.kojira.io',
  'wss://relay-jp.nostr.wirednet.jp',
];

// 英語圏向け
const SEED_RELAYS_EN: string[] = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://purplepag.es',
];

// 言語に応じたシードリレーを取得
export function getSeedRelays(language: string): string[] {
  if (language.startsWith('ja')) {
    return SEED_RELAYS_JA;
  }
  return [...SEED_RELAYS_EN, ...SEED_RELAYS_JA.slice(0, 1)]; // 英語圏 + yabu.me（国際リレー）
}

export function getPool(): SimplePool {
  if (!pool) {
    pool = new SimplePool();
  }
  return pool;
}

export function getActiveRelays(): RelayConfig[] {
  return activeRelays;
}

export function getReadRelayUrls(): string[] {
  return activeRelays.filter(r => r.read).map(r => r.url);
}

export function getWriteRelayUrls(): string[] {
  return activeRelays.filter(r => r.write).map(r => r.url);
}

export function setRelays(relays: RelayConfig[]): void {
  activeRelays = relays;
}

export function addRelay(relay: RelayConfig): void {
  const existing = activeRelays.find(r => r.url === relay.url);
  if (!existing) {
    activeRelays.push(relay);
  }
}

export function removeRelay(url: string): void {
  activeRelays = activeRelays.filter(r => r.url !== url);
}

export async function fetchEvents(filter: Filter): Promise<Event[]> {
  const p = getPool();
  const relayUrls = getReadRelayUrls();
  
  return await p.querySync(relayUrls, filter);
}

// ストリーミングでイベントを購読（リアルタイム表示用）
export function subscribeToEvents(
  filter: Filter,
  onEvent: (event: Event) => void,
  onEose?: () => void
): () => void {
  const p = getPool();
  const relayUrls = getReadRelayUrls();
  
  // nostr-toolsのsubscribeManyは単一のFilterを受け取る
  const sub = p.subscribeMany(relayUrls, filter, {
    onevent: onEvent,
    oneose: onEose,
  });
  
  // クリーンアップ関数を返す
  return () => {
    sub.close();
  };
}

export async function publishEvent(event: Event): Promise<void> {
  const p = getPool();
  const relayUrls = getWriteRelayUrls();
  
  await Promise.all(p.publish(relayUrls, event));
}

export function closePool(): void {
  if (pool) {
    pool.close(getReadRelayUrls());
    pool = null;
  }
}

// NIP-65: ユーザーのリレーリストを取得
export async function fetchUserRelayList(pubkey: string, language: string = 'ja'): Promise<RelayConfig[]> {
  const p = getPool();
  const seedRelays = getSeedRelays(language);
  
  try {
    // kind:10002 (NIP-65 Relay List Metadata) を取得
    const events = await p.querySync(seedRelays, {
      kinds: [10002],
      authors: [pubkey],
      limit: 1,
    });
    
    if (events.length === 0) {
      console.log('NIP-65 relay list not found for user');
      return [];
    }
    
    // 最新のイベントを使用
    const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];
    
    const relays: RelayConfig[] = [];
    
    // "r" タグからリレーを抽出
    for (const tag of latestEvent.tags) {
      if (tag[0] === 'r' && tag[1]) {
        const url = tag[1];
        const marker = tag[2]; // "read" or "write" or undefined (both)
        
        relays.push({
          url,
          read: marker === undefined || marker === 'read',
          write: marker === undefined || marker === 'write',
        });
      }
    }
    
    console.log(`Found ${relays.length} relays from NIP-65`);
    return relays;
  } catch (error) {
    console.error('Failed to fetch NIP-65 relay list:', error);
    return [];
  }
}

