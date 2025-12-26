// 年賀状送受信サービス

import { type Event, finalizeEvent, type EventTemplate } from 'nostr-tools';
import { fetchEvents, publishEvent } from './relay';
import { NEW_YEAR_CARD_KIND, type NewYearCard, type LayoutType } from '../types';

export function parseNewYearCard(event: Event): NewYearCard | null {
  try {
    const tags = new Map<string, string>();
    let recipientPubkey = '';
    
    for (const tag of event.tags) {
      if (tag[0] === 'p') {
        recipientPubkey = tag[1];
      } else if (tag[0] && tag[1]) {
        tags.set(tag[0], tag[1]);
      }
    }

    const dTag = tags.get('d') || '';
    const year = parseInt(dTag.split('-')[0]) || new Date().getFullYear();

    // contentからSVGとメッセージを取得
    let message = '';
    let svg = '';
    let layoutId: LayoutType = 'vertical';

    try {
      const parsed = JSON.parse(event.content);
      message = parsed.message || '';
      svg = parsed.svg || '';
      layoutId = parsed.layoutId || 'vertical';
    } catch {
      // JSONパース失敗
    }

    // タグからフォールバック（後方互換性）
    if (!message) message = tags.get('message') || '';
    if (!svg) svg = tags.get('svg') || '';
    if (!layoutId) layoutId = (tags.get('layout') as LayoutType) || 'vertical';

    return {
      id: event.id,
      pubkey: event.pubkey,
      recipientPubkey,
      svg,
      message,
      layoutId,
      createdAt: event.created_at,
      year,
    };
  } catch {
    return null;
  }
}

// イベントIDからカードを取得
export async function fetchCardById(eventId: string): Promise<NewYearCard | null> {
  const events = await fetchEvents({
    ids: [eventId],
    kinds: [NEW_YEAR_CARD_KIND],
  });

  if (events.length === 0) return null;
  return parseNewYearCard(events[0]);
}

export async function fetchReceivedCards(pubkey: string): Promise<NewYearCard[]> {
  const events = await fetchEvents({
    kinds: [NEW_YEAR_CARD_KIND],
    '#p': [pubkey],
  });

  const cards: NewYearCard[] = [];
  for (const event of events) {
    const card = parseNewYearCard(event);
    if (card) {
      cards.push(card);
    }
  }

  // 新しい順にソート
  return cards.sort((a, b) => b.createdAt - a.createdAt);
}

export async function fetchSentCards(pubkey: string): Promise<NewYearCard[]> {
  const events = await fetchEvents({
    kinds: [NEW_YEAR_CARD_KIND],
    authors: [pubkey],
  });

  const cards: NewYearCard[] = [];
  for (const event of events) {
    const card = parseNewYearCard(event);
    if (card) {
      cards.push(card);
    }
  }

  // 新しい順にソート
  return cards.sort((a, b) => b.createdAt - a.createdAt);
}

export interface SendCardParams {
  recipientPubkey: string;
  svg: string; // SVGデータ
  message: string;
  layoutId: LayoutType;
  year?: number;
}

export async function sendCard(
  params: SendCardParams,
  signEvent: (event: EventTemplate) => Promise<Event>
): Promise<Event> {
  const year = params.year || new Date().getFullYear();
  const dTag = `${year}-${params.recipientPubkey}`;

  // SVGデータはcontentに含める（タグには長すぎる可能性がある）
  const eventTemplate: EventTemplate = {
    kind: NEW_YEAR_CARD_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', dTag],
      ['p', params.recipientPubkey],
      ['message', params.message],
      ['layout', params.layoutId],
      ['year', year.toString()],
    ],
    content: JSON.stringify({
      message: params.message,
      svg: params.svg,
      layoutId: params.layoutId,
      year,
    }),
  };

  const signedEvent = await signEvent(eventTemplate);
  await publishEvent(signedEvent);
  
  return signedEvent;
}

// NIP-07を使わない場合のイベント署名（秘密鍵を直接使用）
export function signEventWithPrivateKey(
  eventTemplate: EventTemplate,
  privateKey: Uint8Array
): Event {
  return finalizeEvent(eventTemplate, privateKey);
}

