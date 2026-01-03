// 通知サービス

import type { Filter } from 'nostr-tools';
import { fetchEvents } from './relay';
import { NOSTRDRAW_KIND, type NewYearCard } from '../types';
import { parseNewYearCard, fetchCardById } from './card';

// 通知の種類
export type NotificationType = 'reaction' | 'extend';

// 通知データ
export interface Notification {
  id: string;
  type: NotificationType;
  createdAt: number;
  fromPubkey: string;
  targetCardId: string;
  targetCard?: NewYearCard;
  // 描き足しの場合、新しいカードの情報
  extendCard?: NewYearCard;
}

// 自分のカードに対するリアクション通知を取得
async function fetchReactionNotifications(
  myCardIds: string[],
  myPubkey: string,
  since?: number
): Promise<Notification[]> {
  if (myCardIds.length === 0) return [];

  const notifications: Notification[] = [];
  
  // 大量のeventIdがある場合は分割して取得
  const batchSize = 20;
  for (let i = 0; i < myCardIds.length; i += batchSize) {
    const batch = myCardIds.slice(i, i + batchSize);
    
    try {
      const filter: Filter = {
        kinds: [7], // リアクション
        '#e': batch,
        limit: 100,
      };
      if (since) {
        filter.since = since;
      }
      
      const reactions = await fetchEvents(filter);

      for (const reaction of reactions) {
        // 自分自身のリアクションは除外
        if (reaction.pubkey === myPubkey) continue;
        
        const eTags = reaction.tags.filter(tag => tag[0] === 'e');
        // NIP-25: 最後のeタグがリアクション対象
        if (eTags.length > 0) {
          const lastETag = eTags[eTags.length - 1];
          const eventId = lastETag[1];
          if (eventId && batch.includes(eventId)) {
            notifications.push({
              id: reaction.id,
              type: 'reaction',
              createdAt: reaction.created_at,
              fromPubkey: reaction.pubkey,
              targetCardId: eventId,
            });
          }
        }
      }
    } catch (error) {
      console.error('リアクション通知取得エラー:', error);
    }
  }

  return notifications;
}

// 自分のカードに対する描き足し通知を取得
async function fetchExtendNotifications(
  myCardIds: string[],
  myPubkey: string,
  since?: number
): Promise<Notification[]> {
  if (myCardIds.length === 0) return [];

  const notifications: Notification[] = [];
  
  // 大量のeventIdがある場合は分割して取得
  const batchSize = 20;
  for (let i = 0; i < myCardIds.length; i += batchSize) {
    const batch = myCardIds.slice(i, i + batchSize);
    
    try {
      const filter: Filter = {
        kinds: [NOSTRDRAW_KIND],
        '#e': batch,
        limit: 100,
      };
      if (since) {
        filter.since = since;
      }
      
      const events = await fetchEvents(filter);

      for (const event of events) {
        // 自分自身の描き足しは除外
        if (event.pubkey === myPubkey) continue;
        
        const card = parseNewYearCard(event);
        if (!card) continue;
        
        // parentEventIdが自分のカードIDかチェック
        if (card.parentEventId && batch.includes(card.parentEventId)) {
          notifications.push({
            id: event.id,
            type: 'extend',
            createdAt: event.created_at,
            fromPubkey: event.pubkey,
            targetCardId: card.parentEventId,
            extendCard: card,
          });
        }
      }
    } catch (error) {
      console.error('描き足し通知取得エラー:', error);
    }
  }

  return notifications;
}

// 自分が投稿したカードのIDリストを取得
async function fetchMyCardIds(myPubkey: string): Promise<string[]> {
  try {
    const events = await fetchEvents({
      kinds: [NOSTRDRAW_KIND],
      authors: [myPubkey],
      limit: 200,
    });

    return events.map(event => event.id);
  } catch (error) {
    console.error('自分のカード取得エラー:', error);
    return [];
  }
}

// 通知を取得（リアクションと描き足し）
export async function fetchNotifications(
  myPubkey: string,
  since?: number
): Promise<Notification[]> {
  // 自分のカードIDリストを取得
  const myCardIds = await fetchMyCardIds(myPubkey);
  
  if (myCardIds.length === 0) {
    return [];
  }

  // 並行してリアクションと描き足し通知を取得
  const [reactionNotifications, extendNotifications] = await Promise.all([
    fetchReactionNotifications(myCardIds, myPubkey, since),
    fetchExtendNotifications(myCardIds, myPubkey, since),
  ]);

  // 全通知をマージして日時でソート（新しい順）
  const allNotifications = [...reactionNotifications, ...extendNotifications];
  allNotifications.sort((a, b) => b.createdAt - a.createdAt);

  // 対象カードの情報を取得
  const uniqueCardIds = [...new Set(allNotifications.map(n => n.targetCardId))];
  const cardMap = new Map<string, NewYearCard>();
  
  for (const cardId of uniqueCardIds) {
    try {
      const card = await fetchCardById(cardId);
      if (card) {
        cardMap.set(cardId, card);
      }
    } catch (error) {
      console.error('カード取得エラー:', error);
    }
  }

  // 通知にカード情報を付与
  return allNotifications.map(notification => ({
    ...notification,
    targetCard: cardMap.get(notification.targetCardId),
  }));
}

