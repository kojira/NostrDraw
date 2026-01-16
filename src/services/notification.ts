// 通知サービス

import type { Filter, Event } from 'nostr-tools';
import { fetchEvents } from './relay';
import { getEventsFromCache } from './eventCache';
import { NOSTRDRAW_KIND, type NostrDrawPost } from '../types';
import { parseNostrDrawPost, fetchCardById } from './card';

// 通知の種類
export type NotificationType = 'reaction' | 'extend';

// 通知データ
export interface Notification {
  id: string;
  type: NotificationType;
  createdAt: number;
  fromPubkey: string;
  targetCardId: string;
  targetCard?: NostrDrawPost;
  // 描き足しの場合、新しいカードの情報
  extendCard?: NostrDrawPost;
}

// リアクションイベントから通知を生成
function reactionToNotification(
  reaction: Event,
  myPubkey: string,
  myCardIdSet: Set<string>
): Notification | null {
  // 自分自身のリアクションは除外
  if (reaction.pubkey === myPubkey) return null;
  
  const eTags = reaction.tags.filter(tag => tag[0] === 'e');
  // NIP-25: 最後のeタグがリアクション対象
  if (eTags.length > 0) {
    const lastETag = eTags[eTags.length - 1];
    const eventId = lastETag[1];
    // 最後のeタグが自分のカードIDかチェック
    if (eventId && myCardIdSet.has(eventId)) {
      return {
        id: reaction.id,
        type: 'reaction',
        createdAt: reaction.created_at,
        fromPubkey: reaction.pubkey,
        targetCardId: eventId,
      };
    }
  }
  return null;
}

// 描き足しイベントから通知を生成
function extendToNotification(
  event: Event,
  myPubkey: string,
  myCardIdSet: Set<string>
): Notification | null {
  // 自分自身の描き足しは除外
  if (event.pubkey === myPubkey) return null;
  
  const card = parseNostrDrawPost(event);
  if (!card) return null;
  
  // parentEventIdが自分のカードIDかチェック
  if (card.parentEventId && myCardIdSet.has(card.parentEventId)) {
    return {
      id: event.id,
      type: 'extend',
      createdAt: event.created_at,
      fromPubkey: event.pubkey,
      targetCardId: card.parentEventId,
      extendCard: card,
    };
  }
  return null;
}

// 自分が投稿したカードのIDリストを取得（キャッシュ優先）
async function fetchMyCardIds(myPubkey: string): Promise<string[]> {
  const filter = {
    kinds: [NOSTRDRAW_KIND],
    authors: [myPubkey],
    limit: 200,
  };
  
  // まずキャッシュから取得
  const cachedEvents = getEventsFromCache(filter);
  const cachedIds = new Set(cachedEvents.map(e => e.id));
  
  // リレーからも取得（バックグラウンド）
  try {
    const events = await fetchEvents(filter);
    for (const event of events) {
      cachedIds.add(event.id);
    }
  } catch (error) {
    console.error('自分のカード取得エラー:', error);
  }
  
  return Array.from(cachedIds);
}

// 通知を取得（キャッシュ優先、ストリーミング対応）
export async function fetchNotifications(
  myPubkey: string,
  since?: number,
  onUpdate?: (notifications: Notification[]) => void
): Promise<Notification[]> {
  // 自分のカードIDリストを取得
  const myCardIds = await fetchMyCardIds(myPubkey);
  
  if (myCardIds.length === 0) {
    return [];
  }

  const myCardIdSet = new Set(myCardIds);
  const notificationMap = new Map<string, Notification>();
  
  // フィルタ作成
  const reactionFilter: Filter = {
    kinds: [7],
    '#e': myCardIds,
    limit: 500,
  };
  const extendFilter: Filter = {
    kinds: [NOSTRDRAW_KIND],
    '#e': myCardIds,
    limit: 500,
  };
  if (since) {
    reactionFilter.since = since;
    extendFilter.since = since;
  }
  
  // === Phase 1: キャッシュから即座に取得 ===
  const cachedReactions = getEventsFromCache(reactionFilter);
  const cachedExtends = getEventsFromCache(extendFilter);
  
  for (const reaction of cachedReactions) {
    const notification = reactionToNotification(reaction, myPubkey, myCardIdSet);
    if (notification) {
      notificationMap.set(notification.id, notification);
    }
  }
  
  for (const event of cachedExtends) {
    const notification = extendToNotification(event, myPubkey, myCardIdSet);
    if (notification) {
      notificationMap.set(notification.id, notification);
    }
  }
  
  // キャッシュから取得した通知を即座にコールバック
  if (notificationMap.size > 0 && onUpdate) {
    const cachedNotifications = sortAndAttachCards(
      Array.from(notificationMap.values())
    );
    onUpdate(await cachedNotifications);
  }
  
  // === Phase 2: リレーから取得 ===
  try {
    const [reactions, extends_] = await Promise.all([
      fetchEvents(reactionFilter),
      fetchEvents(extendFilter),
    ]);
    
    let hasNew = false;
    
    for (const reaction of reactions) {
      if (notificationMap.has(reaction.id)) continue;
      const notification = reactionToNotification(reaction, myPubkey, myCardIdSet);
      if (notification) {
        notificationMap.set(notification.id, notification);
        hasNew = true;
      }
    }
    
    for (const event of extends_) {
      if (notificationMap.has(event.id)) continue;
      const notification = extendToNotification(event, myPubkey, myCardIdSet);
      if (notification) {
        notificationMap.set(notification.id, notification);
        hasNew = true;
      }
    }
    
    // 新しい通知があればコールバック
    if (hasNew && onUpdate) {
      const allNotifications = await sortAndAttachCards(
        Array.from(notificationMap.values())
      );
      onUpdate(allNotifications);
    }
  } catch (error) {
    console.error('通知取得エラー:', error);
  }
  
  // 最終結果を返す
  return sortAndAttachCards(Array.from(notificationMap.values()));
}

// 通知をソートしてカード情報を付与
async function sortAndAttachCards(
  notifications: Notification[]
): Promise<Notification[]> {
  // 日時でソート（新しい順）
  notifications.sort((a, b) => b.createdAt - a.createdAt);
  
  // 対象カードの情報を取得
  const uniqueCardIds = [...new Set(notifications.map(n => n.targetCardId))];
  const cardMap = new Map<string, NostrDrawPost>();
  
  // 並行して取得
  await Promise.all(
    uniqueCardIds.map(async (cardId) => {
      try {
        const card = await fetchCardById(cardId);
        if (card) {
          cardMap.set(cardId, card);
        }
      } catch (error) {
        console.error('カード取得エラー:', error);
      }
    })
  );
  
  // 通知にカード情報を付与
  return notifications.map(notification => ({
    ...notification,
    targetCard: cardMap.get(notification.targetCardId),
  }));
}
