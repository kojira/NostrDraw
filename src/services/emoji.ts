// NIP-30 カスタム絵文字サービス

import type { Filter, Event } from 'nostr-tools';
import { fetchEvents } from './relay';

// カスタム絵文字の型
export interface CustomEmoji {
  shortcode: string;
  url: string;
}

// 絵文字リストの型
export interface EmojiList {
  id: string;
  name: string;
  pubkey: string;
  emojis: CustomEmoji[];
}

// kind 10030 (Emoji List) からカスタム絵文字を取得
export async function fetchUserEmojiLists(pubkey: string): Promise<EmojiList[]> {
  const filter: Filter = {
    kinds: [10030],
    authors: [pubkey],
  };

  const events = await fetchEvents(filter);
  return events.map(parseEmojiListEvent).filter((list): list is EmojiList => list !== null);
}

// kind 0 (Profile) からカスタム絵文字を取得（プロフィールに設定されている絵文字）
export async function fetchProfileEmojis(pubkey: string): Promise<CustomEmoji[]> {
  const filter: Filter = {
    kinds: [0],
    authors: [pubkey],
  };

  const events = await fetchEvents(filter);
  if (events.length === 0) return [];

  // 最新のプロフィールを使用
  const latestProfile = events.sort((a, b) => b.created_at - a.created_at)[0];
  return parseEmojiTags(latestProfile.tags);
}

// 複数ユーザーの絵文字リストを一括取得
export async function fetchMultipleUserEmojiLists(pubkeys: string[]): Promise<EmojiList[]> {
  if (pubkeys.length === 0) return [];

  const filter: Filter = {
    kinds: [10030],
    authors: pubkeys,
  };

  const events = await fetchEvents(filter);
  return events.map(parseEmojiListEvent).filter((list): list is EmojiList => list !== null);
}

// 人気の絵文字パック（公開されているもの）を取得
export async function fetchPopularEmojiPacks(limit: number = 20): Promise<EmojiList[]> {
  // kind 30030 (Emoji Pack) - 公開絵文字パック
  const filter: Filter = {
    kinds: [30030],
    limit,
  };

  const events = await fetchEvents(filter);
  return events.map(parseEmojiPackEvent).filter((list): list is EmojiList => list !== null);
}

// イベントから絵文字リストをパース（kind 10030）
function parseEmojiListEvent(event: Event): EmojiList | null {
  try {
    const emojis = parseEmojiTags(event.tags);
    if (emojis.length === 0) return null;

    // d タグから名前を取得
    const dTag = event.tags.find(tag => tag[0] === 'd');
    const name = dTag?.[1] || 'カスタム絵文字';

    return {
      id: event.id,
      name,
      pubkey: event.pubkey,
      emojis,
    };
  } catch {
    return null;
  }
}

// イベントから絵文字パックをパース（kind 30030）
function parseEmojiPackEvent(event: Event): EmojiList | null {
  try {
    const emojis = parseEmojiTags(event.tags);
    if (emojis.length === 0) return null;

    // d タグからパック名を取得
    const dTag = event.tags.find(tag => tag[0] === 'd');
    const name = dTag?.[1] || '絵文字パック';

    return {
      id: event.id,
      name,
      pubkey: event.pubkey,
      emojis,
    };
  } catch {
    return null;
  }
}

// タグから絵文字を抽出
function parseEmojiTags(tags: string[][]): CustomEmoji[] {
  const emojis: CustomEmoji[] = [];

  for (const tag of tags) {
    // ["emoji", "shortcode", "url"] 形式
    if (tag[0] === 'emoji' && tag[1] && tag[2]) {
      emojis.push({
        shortcode: tag[1],
        url: tag[2],
      });
    }
  }

  return emojis;
}

// 絵文字URLをスタンプ用のSVGに変換（画像をSVG内に埋め込む）
export function emojiToStampSvg(emoji: CustomEmoji, size: number = 100): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <image href="${emoji.url}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
}

