// NostrDraw 送受信サービス

import { type Event, finalizeEvent, type EventTemplate } from 'nostr-tools';
import { fetchEvents, publishEvent } from './relay';
import { 
  NOSTRDRAW_KIND, 
  NOSTRDRAW_CLIENT_TAG, 
  NOSTRDRAW_VERSION,
  type NewYearCard, 
  type LayoutType 
} from '../types';
import { compressSvg, decompressSvg } from '../utils/compression';

// NostrDrawのイベントかどうかをチェック
export function isNostrDrawEvent(event: Event): boolean {
  // clientタグでNostrDrawのイベントか確認
  const clientTag = event.tags.find(tag => tag[0] === 'client' && tag[1] === NOSTRDRAW_CLIENT_TAG);
  return !!clientTag;
}

export function parseNewYearCard(event: Event): NewYearCard | null {
  try {
    // NostrDrawのイベントでない場合はスキップ
    if (!isNostrDrawEvent(event)) {
      return null;
    }

    const tags = new Map<string, string>();
    let recipientPubkey: string | null = null;
    let parentEventId: string | null = null;
    let parentPubkey: string | null = null;
    
    for (const tag of event.tags) {
      if (tag[0] === 'p') {
        recipientPubkey = tag[1];
      } else if (tag[0] === 'e' && tag[3] === 'reply') {
        // 描き足し元の参照
        parentEventId = tag[1];
      } else if (tag[0] === 'parent_p') {
        // 描き足し元の投稿者
        parentPubkey = tag[1];
      } else if (tag[0] && tag[1]) {
        tags.set(tag[0], tag[1]);
      }
    }

    const dTag = tags.get('d') || '';
    const year = parseInt(dTag.split('-')[0]) || new Date().getFullYear();
    const allowExtend = tags.get('allow_extend') === 'true';

    // contentからSVGとメッセージを取得
    let message = '';
    let svg = '';
    let layoutId: LayoutType = 'vertical';

    try {
      const parsed = JSON.parse(event.content);
      message = parsed.message || '';
      
      // 圧縮されたSVGがあれば解凍、なければ通常のSVG
      if (parsed.svgCompressed) {
        try {
          svg = decompressSvg(parsed.svgCompressed);
        } catch (decompressError) {
          console.error('Failed to decompress SVG:', decompressError);
          svg = '';
        }
      } else {
        svg = parsed.svg || '';
      }
      
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
      allowExtend,
      parentEventId,
      parentPubkey,
    };
  } catch {
    return null;
  }
}

// イベントIDからカードを取得
export async function fetchCardById(eventId: string): Promise<NewYearCard | null> {
  const events = await fetchEvents({
    ids: [eventId],
    kinds: [NOSTRDRAW_KIND], // 新旧両方のkindをサポート
  });

  if (events.length === 0) return null;
  return parseNewYearCard(events[0]);
}

export async function fetchReceivedCards(pubkey: string): Promise<NewYearCard[]> {
  const events = await fetchEvents({
    kinds: [NOSTRDRAW_KIND], // 新旧両方のkindをサポート
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
    kinds: [NOSTRDRAW_KIND], // 新旧両方のkindをサポート
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

// 特定ユーザーの投稿を取得
export async function fetchCardsByAuthor(pubkey: string, limit: number = 50): Promise<NewYearCard[]> {
  const events = await fetchEvents({
    kinds: [NOSTRDRAW_KIND],
    authors: [pubkey],
    limit: limit,
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

// 複数著者の投稿を取得（フォロータイムライン用）
export async function fetchCardsByAuthors(pubkeys: string[], limit: number = 50): Promise<NewYearCard[]> {
  if (pubkeys.length === 0) return [];

  const events = await fetchEvents({
    kinds: [NOSTRDRAW_KIND],
    authors: pubkeys,
    limit: limit,
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

// 公開ギャラリー（宛先なしの投稿）を取得
export async function fetchPublicGalleryCards(limit: number = 50): Promise<NewYearCard[]> {
  const events = await fetchEvents({
    kinds: [NOSTRDRAW_KIND], // 新旧両方のkindをサポート
    limit: limit * 2, // 宛先ありのものも含まれるので余裕を持って取得
  });

  const cards: NewYearCard[] = [];
  for (const event of events) {
    const card = parseNewYearCard(event);
    // 宛先なし（公開）のカードのみ
    if (card && !card.recipientPubkey) {
      cards.push(card);
    }
  }

  // 新しい順にソートしてlimit件数に制限
  return cards.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

// リアクション数付きのカード型
export interface NewYearCardWithReactions extends NewYearCard {
  reactionCount: number;
  userReacted?: boolean; // ユーザーがリアクション済みかどうか
}

// 特定のイベントIDに対するリアクション数を取得
export async function fetchReactionCounts(eventIds: string[]): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map();

  const reactions = await fetchEvents({
    kinds: [7], // リアクション
    '#e': eventIds,
  });

  const counts = new Map<string, number>();
  
  for (const reaction of reactions) {
    // eタグからリアクション対象のイベントIDを取得
    const eTag = reaction.tags.find(tag => tag[0] === 'e');
    if (eTag && eTag[1]) {
      const eventId = eTag[1];
      counts.set(eventId, (counts.get(eventId) || 0) + 1);
    }
  }

  return counts;
}

// 過去N日間の人気投稿を取得（リアクション数順）
export async function fetchPopularCards(days: number = 3, limit: number = 20): Promise<NewYearCardWithReactions[]> {
  const sinceTimestamp = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);

  // 過去N日間の公開投稿を取得
  const events = await fetchEvents({
    kinds: [NOSTRDRAW_KIND], // 新旧両方のkindをサポート
    since: sinceTimestamp,
    limit: 100, // 十分な数を取得
  });

  const cards: NewYearCard[] = [];
  for (const event of events) {
    const card = parseNewYearCard(event);
    // 宛先なし（公開）のカードのみ
    if (card && !card.recipientPubkey) {
      cards.push(card);
    }
  }

  if (cards.length === 0) return [];

  // リアクション数を取得
  const eventIds = cards.map(card => card.id);
  const reactionCounts = await fetchReactionCounts(eventIds);

  // リアクション数を付与し、1以上のもののみフィルタ
  const cardsWithReactions: NewYearCardWithReactions[] = cards
    .map(card => ({
      ...card,
      reactionCount: reactionCounts.get(card.id) || 0,
    }))
    .filter(card => card.reactionCount >= 1); // リアクション1以上のみ

  // リアクション数でソート（多い順）、同数なら新しい順
  cardsWithReactions.sort((a, b) => {
    if (b.reactionCount !== a.reactionCount) {
      return b.reactionCount - a.reactionCount;
    }
    return b.createdAt - a.createdAt;
  });

  return cardsWithReactions.slice(0, limit);
}

export interface SendCardParams {
  recipientPubkey?: string | null; // 任意（宛先なしでも送信可能）
  svg: string; // SVGデータ
  message: string;
  layoutId: LayoutType;
  year?: number;
  allowExtend?: boolean; // 描き足し許可
  parentEventId?: string | null; // 描き足し元のイベントID
  parentPubkey?: string | null; // 描き足し元の投稿者
  isPublic?: boolean; // kind 1にも投稿するか
}

export async function sendCard(
  params: SendCardParams,
  signEvent: (event: EventTemplate) => Promise<Event>
): Promise<Event> {
  const year = params.year || new Date().getFullYear();
  const timestamp = Math.floor(Date.now() / 1000);
  
  // 宛先がある場合はrecipient付きのdTag、ない場合はタイムスタンプベース
  const dTag = params.recipientPubkey 
    ? `${year}-${params.recipientPubkey}` 
    : `${year}-public-${timestamp}`;

  // タグを構築
  const tags: string[][] = [
    ['d', dTag],
    ['client', NOSTRDRAW_CLIENT_TAG], // アプリ識別タグ
    ['v', NOSTRDRAW_VERSION], // バージョンタグ
    ['message', params.message],
    ['layout', params.layoutId],
    ['year', year.toString()],
  ];
  
  // 宛先がある場合のみpタグを追加
  if (params.recipientPubkey) {
    tags.push(['p', params.recipientPubkey]);
  }

  // 描き足し許可
  if (params.allowExtend) {
    tags.push(['allow_extend', 'true']);
  }

  // 描き足し元の参照（スレッド形式）
  if (params.parentEventId) {
    tags.push(['e', params.parentEventId, '', 'reply']);
  }
  if (params.parentPubkey) {
    tags.push(['parent_p', params.parentPubkey]);
  }

  // SVGを圧縮してサイズを削減
  let svgCompressed: string;
  try {
    svgCompressed = compressSvg(params.svg);
  } catch (error) {
    console.error('Failed to compress SVG, using original:', error);
    // 圧縮失敗時は元のSVGを使用
    svgCompressed = '';
  }

  // SVGデータはcontentに含める（タグには長すぎる可能性がある）
  // 圧縮に成功した場合はsvgCompressedを使用、失敗時はsvgを使用
  const eventTemplate: EventTemplate = {
    kind: NOSTRDRAW_KIND,
    created_at: timestamp,
    tags,
    content: JSON.stringify({
      message: params.message,
      ...(svgCompressed 
        ? { svgCompressed, compression: 'gzip+base64' }
        : { svg: params.svg }
      ),
      layoutId: params.layoutId,
      year,
      version: NOSTRDRAW_VERSION,
      isPublic: !params.recipientPubkey, // 宛先なしの場合はpublicフラグ
      allowExtend: params.allowExtend,
      parentEventId: params.parentEventId,
    }),
  };

  const signedEvent = await signEvent(eventTemplate);
  await publishEvent(signedEvent);
  
  // kind 1（タイムライン）にも投稿する場合
  if (params.isPublic) {
    // NostrDrawで閲覧するためのURL
    const viewUrl = `https://kojira.github.io/NostrDraw/?eventid=${signedEvent.id}`;
    
    const kind1Tags: string[][] = [
      ['client', NOSTRDRAW_CLIENT_TAG],
      ['e', signedEvent.id, '', 'mention'], // kind 31898への参照
      ['r', viewUrl], // URLタグ
    ];
    
    // 描き足し元への参照
    if (params.parentEventId) {
      kind1Tags.push(['e', params.parentEventId, '', 'reply']);
    }
    if (params.parentPubkey) {
      kind1Tags.push(['p', params.parentPubkey]);
    }
    
    const kind1EventTemplate: EventTemplate = {
      kind: 1, // テキストノート
      created_at: timestamp,
      tags: kind1Tags,
      content: params.message 
        ? `${params.message}\n\n${viewUrl}`
        : `NostrDrawで絵を投稿しました！\n\n${viewUrl}`,
    };
    
    const signedKind1Event = await signEvent(kind1EventTemplate);
    await publishEvent(signedKind1Event);
  }
  
  return signedEvent;
}

// NIP-07を使わない場合のイベント署名（秘密鍵を直接使用）
export function signEventWithPrivateKey(
  eventTemplate: EventTemplate,
  privateKey: Uint8Array
): Event {
  return finalizeEvent(eventTemplate, privateKey);
}

// リアクションを送信（NIP-25）
export async function sendReaction(
  targetEventId: string,
  targetEventPubkey: string,
  content: string = '❤️',
  signEvent: (event: EventTemplate) => Promise<Event>
): Promise<Event> {
  const timestamp = Math.floor(Date.now() / 1000);

  const eventTemplate: EventTemplate = {
    kind: 7, // リアクション
    created_at: timestamp,
    tags: [
      ['e', targetEventId],
      ['p', targetEventPubkey],
    ],
    content,
  };

  const signedEvent = await signEvent(eventTemplate);
  await publishEvent(signedEvent);
  
  return signedEvent;
}

// 自分がリアクションしたかどうかをチェック
export async function hasUserReacted(eventId: string, userPubkey: string): Promise<boolean> {
  const reactions = await fetchEvents({
    kinds: [7],
    authors: [userPubkey],
    '#e': [eventId],
    limit: 1,
  });
  
  return reactions.length > 0;
}

