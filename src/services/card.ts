// NostrDraw 送受信サービス

import { type Event, finalizeEvent, type EventTemplate } from 'nostr-tools';
import { fetchEvents, publishEvent, subscribeToEvents } from './relay';
import { 
  NOSTRDRAW_KIND, 
  NOSTRDRAW_CLIENT_TAG, 
  NOSTRDRAW_VERSION,
  type NostrDrawPost, 
  type LayoutType 
} from '../types';
import { compressSvg, decompressSvg } from '../utils/compression';
import { decodeBinaryToLayers } from '../utils/binaryFormat';
import type { Layer } from '../components/CardEditor/DrawingCanvas/types';
import { BASE_URL } from '../config';
import { uploadWithNip96 } from './imageUpload';

/**
 * 親SVGと差分SVGを合成する
 * @param parentSvg 親のSVG
 * @param diffSvg 差分SVG（テンプレートなしのレイヤーのみ）
 * @returns 合成されたSVG
 */
export function mergeSvgWithDiff(parentSvg: string, diffSvg: string): string {
  // 親SVGからviewBoxを取得
  const viewBoxMatch = parentSvg.match(/viewBox="([^"]+)"/);
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 800 600';
  
  // 親SVGから内部コンテンツを抽出（<svg>タグの中身）
  const parentContentMatch = parentSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  const parentContent = parentContentMatch ? parentContentMatch[1] : '';
  
  // 差分SVGから内部コンテンツを抽出（<svg>タグの中身）
  const diffContentMatch = diffSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  const diffContent = diffContentMatch ? diffContentMatch[1] : '';
  
  // 合成：親の上に差分を重ねる
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">
  ${parentContent}
  ${diffContent}
</svg>`;
}

// SVG文字列をPNG Blobに変換するヘルパー関数
async function svgToPngBlob(svgString: string, width: number = 800, height: number = 600): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      // SVG文字列をData URLに変換
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(svgUrl);
            resolve(null);
            return;
          }
          
          // 背景を白で塗りつぶし
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          
          // SVGを描画
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(svgUrl);
              resolve(blob);
            },
            'image/png',
            0.95
          );
        } catch (error) {
          console.error('[svgToPngBlob] Canvas error:', error);
          URL.revokeObjectURL(svgUrl);
          resolve(null);
        }
      };
      
      img.onerror = (error) => {
        console.error('[svgToPngBlob] Image load error:', error);
        URL.revokeObjectURL(svgUrl);
        resolve(null);
      };
      
      img.src = svgUrl;
    } catch (error) {
      console.error('[svgToPngBlob] Error:', error);
      resolve(null);
    }
  });
}

// レイヤーデータからSVGを生成するヘルパー関数
function layersToSvg(layers: import('../components/CardEditor/DrawingCanvas/types').Layer[], canvasSize: { width: number; height: number }): string {
  const { width, height } = canvasSize;
  
  const svgParts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  ];
  
  // 背景（白）
  svgParts.push(`<rect width="${width}" height="${height}" fill="white"/>`);
  
  // 各レイヤーを処理
  for (const layer of layers) {
    if (!layer.visible) continue;
    
    const opacity = layer.opacity !== 1 ? ` opacity="${layer.opacity}"` : '';
    svgParts.push(`<g${opacity}>`);
    
    // ストローク
    for (const stroke of layer.strokes) {
      if (stroke.points.length < 2) continue;
      const pathData = stroke.points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join(' ');
      svgParts.push(`<path d="${pathData}" stroke="${stroke.color}" stroke-width="${stroke.lineWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
    
    // スタンプ
    for (const stamp of layer.placedStamps) {
      if (stamp.isCustomEmoji && stamp.customEmojiUrl) {
        const size = 64 * stamp.scale;
        svgParts.push(`<image href="${stamp.customEmojiUrl}" x="${stamp.x - size/2}" y="${stamp.y - size/2}" width="${size}" height="${size}"/>`);
      }
    }
    
    // テキストボックス
    for (const textBox of layer.textBoxes) {
      if (!textBox.text) continue;
      svgParts.push(`<text x="${textBox.x}" y="${textBox.y + textBox.fontSize}" font-size="${textBox.fontSize}" fill="${textBox.color}" font-family="${textBox.fontFamily}">${textBox.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>`);
    }
    
    svgParts.push('</g>');
  }
  
  svgParts.push('</svg>');
  return svgParts.join('\n');
}

// NostrDrawのイベントかどうかをチェック
export function isNostrDrawEvent(event: Event): boolean {
  // clientタグでNostrDrawのイベントか確認
  const clientTag = event.tags.find(tag => tag[0] === 'client' && tag[1] === NOSTRDRAW_CLIENT_TAG);
  return !!clientTag;
}

export function parseNostrDrawPost(event: Event): NostrDrawPost | null {
  try {
    // NostrDrawのイベントでない場合はスキップ
    if (!isNostrDrawEvent(event)) {
      return null;
    }

    const tags = new Map<string, string>();
    let recipientPubkey: string | null = null;
    let parentEventId: string | null = null;
    let parentPubkey: string | null = null;
    let rootEventId: string | null = null;
    
    for (const tag of event.tags) {
      if (tag[0] === 'p') {
        recipientPubkey = tag[1];
      } else if (tag[0] === 'e' && tag[3] === 'reply') {
        // 描き足し元の参照（直接の親）
        parentEventId = tag[1];
      } else if (tag[0] === 'e' && tag[3] === 'root') {
        // スレッドのルート
        rootEventId = tag[1];
      } else if (tag[0] === 'parent_p') {
        // 描き足し元の投稿者
        parentPubkey = tag[1];
      } else if (tag[0] && tag[1]) {
        tags.set(tag[0], tag[1]);
      }
    }

    const dTag = tags.get('d') || '';
    const year = parseInt(dTag.split('-')[0]) || new Date().getFullYear();

    // contentからSVG、メッセージ、レイアウト、描き足し許可を取得
    let message = '';
    let svg = '';
    let layoutId: LayoutType = 'vertical';
    let allowExtend = false;
    let isDiff = false;

    try {
      const parsed = JSON.parse(event.content);
      message = parsed.message || '';
      
      // 新バイナリフォーマット（layerData）を優先、なければ従来形式
      if (parsed.layerData && parsed.compression === 'binary+gzip+base64') {
        try {
          const decoded = decodeBinaryToLayers(parsed.layerData);
          svg = layersToSvg(decoded.layers, decoded.canvasSize);
        } catch (decodeError) {
          console.error('Failed to decode layerData:', decodeError);
          svg = '';
        }
      } else if (parsed.svgCompressed) {
        // 従来の圧縮SVG形式
        try {
          svg = decompressSvg(parsed.svgCompressed);
        } catch (decompressError) {
          console.error('Failed to decompress SVG:', decompressError);
          svg = '';
        }
      } else {
        // 生SVG
        svg = parsed.svg || '';
      }
      
      layoutId = parsed.layoutId || 'vertical';
      allowExtend = parsed.allowExtend === true;
      isDiff = parsed.isDiff === true;
    } catch {
      // JSONパース失敗
    }

    // タグからフォールバック（後方互換性：既存のイベントに対応）
    if (!message) message = tags.get('message') || '';
    if (!svg) svg = tags.get('svg') || '';
    if (!layoutId) layoutId = (tags.get('layout') as LayoutType) || 'vertical';
    if (!allowExtend) allowExtend = tags.get('allow_extend') === 'true';

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
      rootEventId,
      isDiff,
    };
  } catch {
    return null;
  }
}

// イベントIDからカードを取得
export async function fetchCardById(eventId: string): Promise<NostrDrawPost | null> {
  const events = await fetchEvents({
    ids: [eventId],
    kinds: [NOSTRDRAW_KIND], // 新旧両方のkindをサポート
  });

  if (events.length === 0) return null;
  return parseNostrDrawPost(events[0]);
}

// 特定のカードを親として持つ子カード（描き足しされたカード）を取得
export async function fetchChildCards(parentEventId: string): Promise<NostrDrawPost[]> {
  const events = await fetchEvents({
    kinds: [NOSTRDRAW_KIND],
    '#e': [parentEventId],
  });

  const cards: NostrDrawPost[] = [];
  for (const event of events) {
    const card = parseNostrDrawPost(event);
    // parentEventIdが一致するもののみ（replyタグで参照されているもの）
    if (card && card.parentEventId === parentEventId) {
      cards.push(card);
    }
  }

  // 新しい順にソート
  return cards.sort((a, b) => b.createdAt - a.createdAt);
}

export async function fetchReceivedCards(pubkey: string): Promise<NostrDrawPost[]> {
  const events = await fetchEvents({
    kinds: [NOSTRDRAW_KIND], // 新旧両方のkindをサポート
    '#p': [pubkey],
  });

  const cards: NostrDrawPost[] = [];
  for (const event of events) {
    const card = parseNostrDrawPost(event);
    if (card) {
      cards.push(card);
    }
  }

  // 新しい順にソート
  return cards.sort((a, b) => b.createdAt - a.createdAt);
}

export async function fetchSentCards(pubkey: string): Promise<NostrDrawPost[]> {
  const events = await fetchEvents({
    kinds: [NOSTRDRAW_KIND], // 新旧両方のkindをサポート
    authors: [pubkey],
  });

  const cards: NostrDrawPost[] = [];
  for (const event of events) {
    const card = parseNostrDrawPost(event);
    if (card) {
      cards.push(card);
    }
  }

  // 新しい順にソート
  return cards.sort((a, b) => b.createdAt - a.createdAt);
}

// 特定ユーザーの投稿を取得
export async function fetchCardsByAuthor(pubkey: string, limit: number = 50): Promise<NostrDrawPost[]> {
  const events = await fetchEvents({
    kinds: [NOSTRDRAW_KIND],
    authors: [pubkey],
    limit: limit,
  });

  const cards: NostrDrawPost[] = [];
  for (const event of events) {
    const card = parseNostrDrawPost(event);
    if (card) {
      cards.push(card);
    }
  }

  // 新しい順にソート
  return cards.sort((a, b) => b.createdAt - a.createdAt);
}

// 複数著者の投稿を取得（フォロータイムライン用）
export async function fetchCardsByAuthors(pubkeys: string[], limit: number = 50): Promise<NostrDrawPostWithReactions[]> {
  if (pubkeys.length === 0) return [];

  const events = await fetchEvents({
    kinds: [NOSTRDRAW_KIND],
    authors: pubkeys,
    limit: limit,
  });

  const cards: NostrDrawPost[] = [];
  for (const event of events) {
    const card = parseNostrDrawPost(event);
    if (card) {
      cards.push(card);
    }
  }

  // 新しい順にソート
  const sortedCards = cards.sort((a, b) => b.createdAt - a.createdAt);

  // リアクション数を取得
  if (sortedCards.length === 0) return [];
  
  const eventIds = sortedCards.map(card => card.id);
  const reactionCounts = await fetchReactionCounts(eventIds);

  // リアクション数を付与
  return sortedCards.map(card => ({
    ...card,
    reactionCount: reactionCounts.get(card.id) || 0,
  }));
}

// 公開ギャラリー（宛先なしの投稿）を取得
export async function fetchPublicGalleryCards(limit: number = 50): Promise<NostrDrawPostWithReactions[]> {
  const events = await fetchEvents({
    kinds: [NOSTRDRAW_KIND], // 新旧両方のkindをサポート
    limit: limit * 2, // 宛先ありのものも含まれるので余裕を持って取得
  });

  const cards: NostrDrawPost[] = [];
  for (const event of events) {
    const card = parseNostrDrawPost(event);
    // 宛先なし（公開）のカードのみ
    if (card && !card.recipientPubkey) {
      cards.push(card);
    }
  }

  // 新しい順にソートしてlimit件数に制限
  const sortedCards = cards.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);

  // リアクション数を取得
  if (sortedCards.length === 0) return [];
  
  const eventIds = sortedCards.map(card => card.id);
  const reactionCounts = await fetchReactionCounts(eventIds);

  // リアクション数を付与
  return sortedCards.map(card => ({
    ...card,
    reactionCount: reactionCounts.get(card.id) || 0,
  }));
}

// ストリーミングでギャラリーカードを取得（リアルタイム表示用）
export function subscribeToPublicGalleryCards(
  onCard: (card: NostrDrawPost) => void,
  onEose?: () => void,
  limit: number = 50
): () => void {
  return subscribeToEvents(
    {
      kinds: [NOSTRDRAW_KIND],
      limit: limit * 2, // 宛先ありのものも含まれるので余裕を持って取得
    },
    (event) => {
      const card = parseNostrDrawPost(event);
      // 宛先なし（公開）のカードのみ
      if (card && !card.recipientPubkey) {
        onCard(card);
      }
    },
    onEose
  );
}

// ストリーミングで作者別カードを取得（リアルタイム表示用）
export function subscribeToCardsByAuthor(
  pubkey: string,
  onCard: (card: NostrDrawPost) => void,
  onEose?: () => void,
  limit: number = 50
): () => void {
  return subscribeToEvents(
    {
      kinds: [NOSTRDRAW_KIND],
      authors: [pubkey],
      limit,
    },
    (event) => {
      const card = parseNostrDrawPost(event);
      if (card) {
        onCard(card);
      }
    },
    onEose
  );
}

// ストリーミングで複数作者のカードを取得（フォロータイムライン用）
export function subscribeToCardsByAuthors(
  pubkeys: string[],
  onCard: (card: NostrDrawPost) => void,
  onEose?: () => void,
  limit: number = 50
): () => void {
  if (pubkeys.length === 0) {
    // 空の場合は即座にEOSEを呼んで終了
    onEose?.();
    return () => {};
  }
  
  return subscribeToEvents(
    {
      kinds: [NOSTRDRAW_KIND],
      authors: pubkeys,
      limit,
    },
    (event) => {
      const card = parseNostrDrawPost(event);
      if (card) {
        onCard(card);
      }
    },
    onEose
  );
}

// リアクション数付きのカード型
export interface NostrDrawPostWithReactions extends NostrDrawPost {
  reactionCount: number;
  userReacted?: boolean; // ユーザーがリアクション済みかどうか
}

// 特定のイベントIDに対するリアクション数を取得
export async function fetchReactionCounts(eventIds: string[]): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map();

  const counts = new Map<string, number>();
  
  // 大量のeventIdがある場合は分割して取得
  const batchSize = 20;
  for (let i = 0; i < eventIds.length; i += batchSize) {
    const batch = eventIds.slice(i, i + batchSize);
    
    try {
      const reactions = await fetchEvents({
        kinds: [7], // リアクション
        '#e': batch,
        limit: 500, // 十分な数を取得
      });

      for (const reaction of reactions) {
        const eTags = reaction.tags.filter(tag => tag[0] === 'e');
        // NIP-25: 最後のeタグがリアクション対象
        // 最後のeタグがbatchに含まれる場合のみカウント
        if (eTags.length > 0) {
          const lastETag = eTags[eTags.length - 1];
          const eventId = lastETag[1];
          if (eventId && batch.includes(eventId)) {
            counts.set(eventId, (counts.get(eventId) || 0) + 1);
          }
        }
      }
    } catch (error) {
      console.error('リアクション取得エラー:', error);
    }
  }

  return counts;
}

// 過去N日間の人気投稿を取得（リアクション数順）
export async function fetchPopularCards(days: number = 3, limit: number = 20): Promise<NostrDrawPostWithReactions[]> {
  const sinceTimestamp = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);

  // 過去N日間の公開投稿を取得
  const events = await fetchEvents({
    kinds: [NOSTRDRAW_KIND], // 新旧両方のkindをサポート
    since: sinceTimestamp,
    limit: 100, // 十分な数を取得
  });

  const cards: NostrDrawPost[] = [];
  for (const event of events) {
    const card = parseNostrDrawPost(event);
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
  const cardsWithReactions: NostrDrawPostWithReactions[] = cards
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
  svg: string; // 完全なSVGデータ（画像アップロード・プレビュー用）
  diffSvg?: string; // 差分SVGデータ（描き足し時の保存用）
  layers?: Layer[]; // レイヤーデータ（新バイナリフォーマット用）
  canvasSize?: { width: number; height: number }; // キャンバスサイズ
  templateId?: string | null; // テンプレートID
  message: string;
  layoutId: LayoutType;
  year?: number;
  allowExtend?: boolean; // 描き足し許可
  parentEventId?: string | null; // 描き足し元のイベントID（直接の親）
  parentPubkey?: string | null; // 描き足し元の投稿者
  rootEventId?: string | null; // スレッドのルートイベントID（最初の親）
  isPublic?: boolean; // kind 1にも投稿するか
  isExtend?: boolean; // 描き足しかどうか
  onImageUploadFailed?: (error: string) => Promise<boolean>; // 画像アップロード失敗時の確認コールバック（trueで続行）
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

  // タグを構築（検索・フィルタリングに必要な情報のみ）
  const tags: string[][] = [
    ['d', dTag],
    ['client', NOSTRDRAW_CLIENT_TAG], // アプリ識別タグ
  ];
  
  // 宛先がある場合のみpタグを追加
  if (params.recipientPubkey) {
    tags.push(['p', params.recipientPubkey]);
  }

  // 描き足し元の参照（NIP-10スレッド形式）
  if (params.parentEventId) {
    // rootとreplyを設定
    if (params.rootEventId && params.rootEventId !== params.parentEventId) {
      // ルートと直接の親が異なる場合（チェーン状の描き足し）
      tags.push(['e', params.rootEventId, '', 'root']);
      tags.push(['e', params.parentEventId, '', 'reply']);
    } else {
      // ルートがないか、親がルートの場合
      tags.push(['e', params.parentEventId, '', 'root']);
      tags.push(['e', params.parentEventId, '', 'reply']);
    }
  }
  if (params.parentPubkey) {
    tags.push(['parent_p', params.parentPubkey]);
  }

  // 描き足しの場合は差分SVGを使用、新規の場合は完全SVGを使用
  const svgToSave = params.isExtend && params.diffSvg ? params.diffSvg : params.svg;
  
  // SVGを圧縮してサイズを削減
  let svgCompressed: string;
  try {
    svgCompressed = compressSvg(svgToSave);
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
        : { svg: svgToSave }
      ),
      layoutId: params.layoutId,
      year,
      version: NOSTRDRAW_VERSION,
      isPublic: !params.recipientPubkey, // 宛先なしの場合はpublicフラグ
      allowExtend: params.allowExtend,
      parentEventId: params.parentEventId,
      isDiff: params.isExtend, // 差分保存かどうかのフラグ
    }),
  };

  const signedEvent = await signEvent(eventTemplate);
  await publishEvent(signedEvent);
  
  // kind 1（タイムライン）にも投稿する場合
  if (params.isPublic) {
    // NostrDrawで閲覧するためのURL
    const viewUrl = `${BASE_URL}/?eventid=${signedEvent.id}`;
    
    // SVGをPNGに変換してアップロード
    let imageUrl: string | null = null;
    let uploadError: string | null = null;
    
    try {
      console.log('[sendCard] Converting SVG to PNG for upload...');
      const pngBlob = await svgToPngBlob(params.svg, 800, 600);
      if (pngBlob) {
        console.log('[sendCard] Uploading image to NIP-96 server...');
        const uploadResult = await uploadWithNip96(pngBlob, signEvent);
        if (uploadResult.success && uploadResult.url) {
          imageUrl = uploadResult.url;
          console.log('[sendCard] Image uploaded successfully:', imageUrl);
        } else {
          uploadError = uploadResult.error || '画像のアップロードに失敗しました';
          console.warn('[sendCard] Image upload failed:', uploadError);
        }
      } else {
        uploadError = '画像の変換に失敗しました';
      }
    } catch (error) {
      uploadError = error instanceof Error ? error.message : '画像アップロード中にエラーが発生しました';
      console.warn('[sendCard] Failed to upload image:', error);
    }
    
    // 画像アップロードに失敗した場合、ユーザーに確認
    if (!imageUrl && uploadError) {
      if (params.onImageUploadFailed) {
        const shouldContinue = await params.onImageUploadFailed(uploadError);
        if (!shouldContinue) {
          throw new Error('画像のアップロードに失敗したため、投稿をキャンセルしました');
        }
      }
      // コールバックがない場合は警告のみで続行
    }
    
    const kind1Tags: string[][] = [
      ['client', NOSTRDRAW_CLIENT_TAG],
      ['e', signedEvent.id, '', 'mention'], // kind 31898への参照
      ['r', viewUrl], // URLタグ
    ];
    
    // 画像URLがあればimeta/imageタグを追加
    if (imageUrl) {
      kind1Tags.push(['imeta', `url ${imageUrl}`, 'm image/png']);
    }
    
    // 描き足し元の投稿者をメンション（告知用）
    if (params.parentPubkey) {
      kind1Tags.push(['p', params.parentPubkey]);
    }
    
    // コンテンツを構築（画像URLを含める）
    let kind1Content = params.message 
      ? `${params.message}\n\n${viewUrl}`
      : `NostrDrawで絵を投稿しました！\n\n${viewUrl}`;
    
    // 画像URLをコンテンツに追加（クライアントで表示されやすい）
    if (imageUrl) {
      kind1Content = `${kind1Content}\n\n${imageUrl}`;
    }
    
    const kind1EventTemplate: EventTemplate = {
      kind: 1, // テキストノート
      created_at: timestamp,
      tags: kind1Tags,
      content: kind1Content,
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

// ツリー構造を取得（すべての祖先と子孫）
export interface CardTreeNode {
  card: NostrDrawPost;
  isCurrent: boolean;
}

// すべての祖先を取得（ルートまで遡る）
export async function fetchAncestors(card: NostrDrawPost): Promise<NostrDrawPost[]> {
  const ancestors: NostrDrawPost[] = [];
  let currentCard = card;
  
  while (currentCard.parentEventId) {
    const parent = await fetchCardById(currentCard.parentEventId);
    if (!parent) break;
    ancestors.unshift(parent); // 先頭に追加（古い順）
    currentCard = parent;
  }
  
  return ancestors;
}

// すべての子孫を取得（再帰的）
export async function fetchDescendants(cardId: string): Promise<NostrDrawPost[]> {
  const children = await fetchChildCards(cardId);
  const allDescendants: NostrDrawPost[] = [...children];
  
  for (const child of children) {
    const grandchildren = await fetchDescendants(child.id);
    allDescendants.push(...grandchildren);
  }
  
  return allDescendants;
}