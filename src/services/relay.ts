// リレー接続管理サービス

import { SimplePool, type Filter, type Event } from 'nostr-tools';
import { DEFAULT_RELAYS, type RelayConfig } from '../types';

let pool: SimplePool | null = null;
let activeRelays: RelayConfig[] = [...DEFAULT_RELAYS];

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

