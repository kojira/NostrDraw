// 通知既読管理サービス
// NIP-33 Addressable Eventで最終確認時刻を管理

import type { Event, EventTemplate, Filter } from 'nostr-tools';
import { fetchEvents, publishEvent } from './relay';

// 通知既読管理用のkind（NIP-33 Addressable Event）
export const NOTIFICATION_READ_KIND = 30897;

// d-tag識別子
const D_TAG = 'notification-read';

/**
 * 最終確認時刻を取得
 */
export async function fetchLastReadTimestamp(pubkey: string): Promise<number | null> {
  const filter: Filter = {
    kinds: [NOTIFICATION_READ_KIND],
    authors: [pubkey],
    '#d': [D_TAG],
    limit: 1,
  };

  try {
    const events = await fetchEvents(filter);
    
    if (events.length === 0) {
      return null;
    }

    // 最新のイベントからタイムスタンプを取得
    const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];
    const timestamp = parseInt(latestEvent.content, 10);
    
    if (isNaN(timestamp)) {
      return latestEvent.created_at;
    }
    
    return timestamp;
  } catch (error) {
    console.error('[notificationRead] Failed to fetch last read timestamp:', error);
    return null;
  }
}

/**
 * 最終確認時刻を更新（現在時刻で）
 */
export async function updateLastReadTimestamp(
  signEvent: (event: EventTemplate) => Promise<Event>
): Promise<{ success: boolean; timestamp?: number; error?: string }> {
  const now = Math.floor(Date.now() / 1000);

  const eventTemplate: EventTemplate = {
    kind: NOTIFICATION_READ_KIND,
    created_at: now,
    tags: [
      ['d', D_TAG],
    ],
    content: now.toString(),
  };

  try {
    const signedEvent = await signEvent(eventTemplate);
    await publishEvent(signedEvent);
    
    return { success: true, timestamp: now };
  } catch (error) {
    console.error('[notificationRead] Failed to update last read timestamp:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー',
    };
  }
}

/**
 * 指定時刻以降の通知数をカウント
 */
export async function countUnreadNotifications(
  pubkey: string,
  lastReadTimestamp: number | null
): Promise<number> {
  // 最終確認時刻がない場合は全て未読として扱わない（初回は0）
  if (lastReadTimestamp === null) {
    return 0;
  }

  const { NOSTRDRAW_KIND } = await import('../types');

  // まず自分のカードIDを取得
  const myCardsFilter: Filter = {
    kinds: [NOSTRDRAW_KIND],
    authors: [pubkey],
    limit: 200,
  };

  const myCards = await fetchEvents(myCardsFilter);
  const myCardIds = myCards.map(e => e.id);

  if (myCardIds.length === 0) {
    return 0;
  }

  // リアクション通知をカウント
  const reactionFilter: Filter = {
    kinds: [7],
    '#e': myCardIds,
    since: lastReadTimestamp + 1,
    limit: 500,
  };

  // 描き足し通知をカウント
  const extendFilter: Filter = {
    kinds: [NOSTRDRAW_KIND],
    '#e': myCardIds,
    since: lastReadTimestamp + 1,
    limit: 500,
  };

  try {
    const [reactions, extends_] = await Promise.all([
      fetchEvents(reactionFilter),
      fetchEvents(extendFilter),
    ]);

    // 自分自身からの通知を除外
    const filteredReactions = reactions.filter(e => e.pubkey !== pubkey);
    const filteredExtends = extends_.filter(e => e.pubkey !== pubkey);

    // 重複排除（同じイベントIDがある場合）
    const uniqueIds = new Set([
      ...filteredReactions.map(e => e.id),
      ...filteredExtends.map(e => e.id),
    ]);

    return uniqueIds.size;
  } catch (error) {
    console.error('[notificationRead] Failed to count unread notifications:', error);
    return 0;
  }
}
