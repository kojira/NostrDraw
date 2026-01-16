// リレー接続管理サービス（rx-nostr版）

import { createRxNostr, createRxBackwardReq, createRxForwardReq, type RxNostr } from 'rx-nostr';
import { verifier } from '@rx-nostr/crypto';
import type { Filter, Event } from 'nostr-tools';
import { DEFAULT_RELAYS, type RelayConfig } from '../types';
import { fetchEventsWithCache, cacheEvent, streamEventsWithCache } from './eventCache';

let rxNostr: RxNostr | null = null;
let activeRelays: RelayConfig[] = [...DEFAULT_RELAYS];

// シードリレー（NIP-65取得用）
const SEED_RELAYS_JA: string[] = [
  'wss://yabu.me',
  'wss://r.kojira.io',
  'wss://relay-jp.nostr.wirednet.jp',
];

const SEED_RELAYS_EN: string[] = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://purplepag.es',
];

export function getSeedRelays(language: string): string[] {
  if (language.startsWith('ja')) {
    return SEED_RELAYS_JA;
  }
  return [...SEED_RELAYS_EN, ...SEED_RELAYS_JA.slice(0, 1)];
}

// RxNostrインスタンスを取得（シングルトン）
export function getRxNostr(): RxNostr {
  if (!rxNostr) {
    rxNostr = createRxNostr({
      verifier,
    });
    updateDefaultRelays();
  }
  return rxNostr;
}

function updateDefaultRelays(): void {
  if (!rxNostr) return;
  
  const relayConfig: Record<string, { read: boolean; write: boolean }> = {};
  for (const relay of activeRelays) {
    relayConfig[relay.url] = { read: relay.read, write: relay.write };
  }
  rxNostr.setDefaultRelays(relayConfig);
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
  updateDefaultRelays();
}

export function addRelay(relay: RelayConfig): void {
  const existing = activeRelays.find(r => r.url === relay.url);
  if (!existing) {
    activeRelays.push(relay);
    updateDefaultRelays();
  }
}

export function removeRelay(url: string): void {
  activeRelays = activeRelays.filter(r => r.url !== url);
  updateDefaultRelays();
}

// リレーから直接イベントを取得（キャッシュなし、内部用）
async function fetchEventsFromRelay(filter: Filter): Promise<Event[]> {
  const rx = getRxNostr();
  const rxReq = createRxBackwardReq();
  
  return new Promise((resolve) => {
    const eventMap = new Map<string, Event>(); // IDで重複排除
    
    const subscription = rx.use(rxReq).subscribe({
      next: (packet) => {
        // 複数リレーから同じイベントが来ても1つだけ保持
        if (!eventMap.has(packet.event.id)) {
          eventMap.set(packet.event.id, packet.event);
        }
      },
      complete: () => {
        resolve(Array.from(eventMap.values()));
      },
    });
    
    rxReq.emit(filter);
    rxReq.over();
    
    setTimeout(() => {
      subscription.unsubscribe();
      resolve(Array.from(eventMap.values()));
    }, 10000);
  });
}

// イベントを取得（キャッシュ経由）
export async function fetchEvents(filter: Filter): Promise<Event[]> {
  return fetchEventsWithCache(filter, fetchEventsFromRelay);
}

// リレーからストリーミングでイベントを取得（内部用、キャッシュなし）
function streamEventsFromRelay(
  filter: Filter,
  onEvent: (event: Event) => void,
  onComplete: () => void
): () => void {
  const rx = getRxNostr();
  const rxReq = createRxBackwardReq();
  
  let completed = false;
  
  const subscription = rx.use(rxReq).subscribe({
    next: (packet) => {
      onEvent(packet.event);
    },
    complete: () => {
      if (!completed) {
        completed = true;
        onComplete();
      }
    },
  });
  
  rxReq.emit(filter);
  rxReq.over();
  
  // タイムアウト処理
  const timeout = setTimeout(() => {
    if (!completed) {
      completed = true;
      onComplete();
    }
    subscription.unsubscribe();
  }, 10000);
  
  return () => {
    clearTimeout(timeout);
    subscription.unsubscribe();
  };
}

// ストリーミングでイベントを取得（キャッシュ経由）
// キャッシュから即座に1つずつ返し、リレーからも1つずつ返す
export function streamEvents(
  filter: Filter,
  onEvent: (event: Event) => void,
  onComplete?: () => void
): () => void {
  return streamEventsWithCache(
    filter,
    streamEventsFromRelay,
    onEvent,
    onComplete
  );
}

// ストリーミングでイベントを購読（受信イベントはキャッシュに追加）
export function subscribeToEvents(
  filter: Filter,
  onEvent: (event: Event) => void,
  onEose?: () => void
): () => void {
  const rx = getRxNostr();
  const rxReq = createRxForwardReq();
  
  const subscription = rx.use(rxReq).subscribe({
    next: (packet) => {
      // キャッシュに追加
      cacheEvent(packet.event);
      onEvent(packet.event);
    },
  });
  
  if (onEose) {
    setTimeout(() => {
      onEose();
    }, 3000);
  }
  
  rxReq.emit(filter);
  
  return () => {
    subscription.unsubscribe();
  };
}

// イベントを発行
export async function publishEvent(event: Event): Promise<void> {
  const rx = getRxNostr();
  
  return new Promise((resolve, reject) => {
    const subscription = rx.send(event).subscribe({
      next: (packet) => {
        if (packet.ok) {
          console.log('Event published to', packet.from);
        } else {
          console.warn('Failed to publish to', packet.from, packet.notice);
        }
      },
      complete: () => {
        resolve();
      },
      error: (err) => {
        reject(err);
      },
    });
    
    setTimeout(() => {
      subscription.unsubscribe();
      resolve();
    }, 10000);
  });
}

export function closePool(): void {
  if (rxNostr) {
    rxNostr.dispose();
    rxNostr = null;
  }
}

// NIP-65: ユーザーのリレーリストを取得（シードリレーを使用）
// シードリレーは特殊なケースのため直接アクセスするが、キャッシュにも保存する
export async function fetchUserRelayList(pubkey: string, language: string = 'ja'): Promise<RelayConfig[]> {
  const filter: Filter = {
    kinds: [10002],
    authors: [pubkey],
    limit: 1,
  };
  
  // fetchEventsWithCacheを使用し、シードリレーからの取得関数を渡す
  const seedRelays = getSeedRelays(language);
  
  const fetchFromSeedRelays = async (f: Filter): Promise<Event[]> => {
    const rx = getRxNostr();
    const rxReq = createRxBackwardReq();
    
    return new Promise((resolve) => {
      const events: Event[] = [];
      
      const subscription = rx.use(rxReq, { relays: seedRelays }).subscribe({
        next: (packet) => {
          events.push(packet.event);
        },
        complete: () => {
          resolve(events);
        },
      });
      
      rxReq.emit(f);
      rxReq.over();
      
      setTimeout(() => {
        subscription.unsubscribe();
        resolve(events);
      }, 5000);
    });
  };
  
  const events = await fetchEventsWithCache(filter, fetchFromSeedRelays);
  
  if (events.length === 0) {
    console.log('NIP-65 relay list not found for user');
    return [];
  }
  
  const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];
  const relays: RelayConfig[] = [];
  
  for (const tag of latestEvent.tags) {
    if (tag[0] === 'r' && tag[1]) {
      const url = tag[1];
      const marker = tag[2];
      
      relays.push({
        url,
        read: marker === undefined || marker === 'read',
        write: marker === undefined || marker === 'write',
      });
    }
  }
  
  console.log('Found', relays.length, 'relays from NIP-65');
  return relays;
}
