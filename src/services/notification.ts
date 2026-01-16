// 通知サービス

import type { Filter, Event } from 'nostr-tools';
import { streamEvents } from './relay';
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

// 自分が投稿したカードのIDリストを取得（ストリーミング）
async function fetchMyCardIds(myPubkey: string): Promise<string[]> {
  const filter = {
    kinds: [NOSTRDRAW_KIND],
    authors: [myPubkey],
    limit: 200,
  };
  
  const cardIds = new Set<string>();
  
  return new Promise((resolve) => {
    streamEvents(
      filter,
      (event) => {
        cardIds.add(event.id);
      },
      () => {
        resolve(Array.from(cardIds));
      }
    );
  });
}

// 通知を取得（完全ストリーミング）
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
  const cardCache = new Map<string, NostrDrawPost | null>();
  
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
  
  // 通知を追加してコールバックを呼ぶヘルパー
  const addNotificationAndUpdate = async (notification: Notification) => {
    if (notificationMap.has(notification.id)) return;
    
    notificationMap.set(notification.id, notification);
    
    // 対象カードの情報を取得（キャッシュ活用）
    if (!cardCache.has(notification.targetCardId)) {
      try {
        const card = await fetchCardById(notification.targetCardId);
        cardCache.set(notification.targetCardId, card);
      } catch {
        cardCache.set(notification.targetCardId, null);
      }
    }
    
    // 通知にカード情報を付与
    notification.targetCard = cardCache.get(notification.targetCardId) || undefined;
    
    // コールバック
    if (onUpdate) {
      const sorted = Array.from(notificationMap.values())
        .sort((a, b) => b.createdAt - a.createdAt);
      onUpdate(sorted);
    }
  };
  
  // リアクション通知をストリーミング
  const reactionPromise = new Promise<void>((resolve) => {
    streamEvents(
      reactionFilter,
      async (event) => {
        const notification = reactionToNotification(event, myPubkey, myCardIdSet);
        if (notification) {
          await addNotificationAndUpdate(notification);
        }
      },
      () => resolve()
    );
  });
  
  // 描き足し通知をストリーミング
  const extendPromise = new Promise<void>((resolve) => {
    streamEvents(
      extendFilter,
      async (event) => {
        const notification = extendToNotification(event, myPubkey, myCardIdSet);
        if (notification) {
          await addNotificationAndUpdate(notification);
        }
      },
      () => resolve()
    );
  });
  
  // 両方のストリームが完了するのを待つ
  await Promise.all([reactionPromise, extendPromise]);
  
  // 最終結果を返す
  return Array.from(notificationMap.values())
    .sort((a, b) => b.createdAt - a.createdAt);
}

