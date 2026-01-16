// リレー接続管理サービス（rx-nostr版）

import { createRxNostr, createRxBackwardReq, createRxForwardReq, type RxNostr } from 'rx-nostr';
import { verifier } from '@rx-nostr/crypto';
import type { Filter, Event } from 'nostr-tools';
import { DEFAULT_RELAYS, type RelayConfig } from '../types';

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

// イベントを取得（過去のイベント向け）
export async function fetchEvents(filter: Filter): Promise<Event[]> {
  const rx = getRxNostr();
  const rxReq = createRxBackwardReq();
  
  return new Promise((resolve) => {
    const events: Event[] = [];
    
    const subscription = rx.use(rxReq).subscribe({
      next: (packet) => {
        events.push(packet.event);
      },
      complete: () => {
        resolve(events);
      },
    });
    
    rxReq.emit(filter);
    rxReq.over();
    
    setTimeout(() => {
      subscription.unsubscribe();
      resolve(events);
    }, 10000);
  });
}

// ストリーミングでイベントを購読
export function subscribeToEvents(
  filter: Filter,
  onEvent: (event: Event) => void,
  onEose?: () => void
): () => void {
  const rx = getRxNostr();
  const rxReq = createRxForwardReq();
  
  const subscription = rx.use(rxReq).subscribe({
    next: (packet) => {
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

// NIP-65: ユーザーのリレーリストを取得
export async function fetchUserRelayList(pubkey: string, language: string = 'ja'): Promise<RelayConfig[]> {
  const rx = getRxNostr();
  const seedRelays = getSeedRelays(language);
  const rxReq = createRxBackwardReq();
  
  return new Promise((resolve) => {
    const events: Event[] = [];
    
    const subscription = rx.use(rxReq, { relays: seedRelays }).subscribe({
      next: (packet) => {
        events.push(packet.event);
      },
      complete: () => {
        processEvents();
      },
    });
    
    rxReq.emit({
      kinds: [10002],
      authors: [pubkey],
      limit: 1,
    });
    rxReq.over();
    
    const timeout = setTimeout(() => {
      subscription.unsubscribe();
      processEvents();
    }, 5000);
    
    function processEvents() {
      clearTimeout(timeout);
      
      if (events.length === 0) {
        console.log('NIP-65 relay list not found for user');
        resolve([]);
        return;
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
      resolve(relays);
    }
  });
}
