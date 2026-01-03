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
// NIP-30に従い、直接の絵文字タグと参照されている絵文字パック（kind 30030）の両方を取得
export async function fetchUserEmojiLists(pubkey: string): Promise<EmojiList[]> {
  const filter: Filter = {
    kinds: [10030],
    authors: [pubkey],
  };

  console.log('[Emoji] Fetching kind 10030 for user:', pubkey.slice(0, 8) + '...');
  const events = await fetchEvents(filter);
  console.log('[Emoji] Found', events.length, 'kind 10030 events');
  
  const lists: EmojiList[] = [];
  
  // 直接の絵文字を持つリストを追加
  for (const event of events) {
    const parsed = parseEmojiListEvent(event);
    if (parsed) {
      console.log('[Emoji] Parsed emoji list with', parsed.emojis.length, 'direct emojis');
      lists.push(parsed);
    }
  }
  
  // "a"タグから参照されている絵文字パック（kind 30030）を取得
  const packRefs: { pubkey: string; identifier: string }[] = [];
  
  for (const event of events) {
    for (const tag of event.tags) {
      // aタグ: ["a", "30030:pubkey:identifier", ...]
      if (tag[0] === 'a' && tag[1]) {
        const parts = tag[1].split(':');
        if (parts[0] === '30030' && parts[1] && parts[2]) {
          packRefs.push({
            pubkey: parts[1],
            identifier: parts[2],
          });
        }
      }
    }
  }
  
  console.log('[Emoji] Found', packRefs.length, '"a" tag references to emoji packs');
  
  // 参照されている絵文字パックを一括で取得
  if (packRefs.length > 0) {
    const fetchedPacks = await fetchEmojiPacksByRefs(packRefs);
    lists.push(...fetchedPacks);
  }
  
  return lists;
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

// 絵文字パックの参照リストから一括取得
async function fetchEmojiPacksByRefs(refs: { pubkey: string; identifier: string }[]): Promise<EmojiList[]> {
  if (refs.length === 0) return [];
  
  console.log('[Emoji] Fetching emoji packs by refs:', refs.length, 'references');
  
  // pubkeyごとにグループ化して効率的にクエリ
  const packsByPubkey = new Map<string, string[]>();
  for (const ref of refs) {
    const existing = packsByPubkey.get(ref.pubkey) || [];
    existing.push(ref.identifier);
    packsByPubkey.set(ref.pubkey, existing);
  }
  
  console.log('[Emoji] Grouped by', packsByPubkey.size, 'authors');
  
  const allPacks: EmojiList[] = [];
  
  // 各pubkeyに対してクエリを実行
  for (const [pubkey, identifiers] of packsByPubkey) {
    const filter: Filter = {
      kinds: [30030],
      authors: [pubkey],
      '#d': identifiers,
    };
    
    try {
      const events = await fetchEvents(filter);
      console.log('[Emoji] Fetched', events.length, 'events for author', pubkey.slice(0, 8) + '...');
      const parsed = events.map(parseEmojiPackEvent).filter((list): list is EmojiList => list !== null);
      allPacks.push(...parsed);
    } catch (error) {
      console.error(`Failed to fetch emoji packs for ${pubkey}:`, error);
    }
  }
  
  console.log('[Emoji] Total packs fetched:', allPacks.length);
  return allPacks;
}

// ブックマークしている絵文字パックを取得 (NIP-51)
// kind 10003 (Public Bookmarks) と kind 30001 (Lists) から絵文字パックへの参照を取得
export async function fetchBookmarkedEmojiPacks(pubkey: string): Promise<EmojiList[]> {
  // kind 10003: Public Bookmarks
  // kind 30001: Lists (emoji type)
  const filter: Filter = {
    kinds: [10003, 30001],
    authors: [pubkey],
  };

  const events = await fetchEvents(filter);
  
  // aタグから絵文字パック（kind 30030）への参照を抽出
  const emojiPackRefs: { pubkey: string; identifier: string }[] = [];
  
  for (const event of events) {
    // kind 30001の場合、dタグが"emoji"のものだけを対象にする
    if (event.kind === 30001) {
      const dTag = event.tags.find(tag => tag[0] === 'd');
      if (dTag?.[1] !== 'emoji') continue;
    }
    
    for (const tag of event.tags) {
      // aタグ: ["a", "30030:pubkey:identifier", ...]
      if (tag[0] === 'a' && tag[1]) {
        const parts = tag[1].split(':');
        if (parts[0] === '30030' && parts[1] && parts[2]) {
          emojiPackRefs.push({
            pubkey: parts[1],
            identifier: parts[2],
          });
        }
      }
    }
  }

  if (emojiPackRefs.length === 0) return [];

  // 一括で絵文字パックを取得（最適化）
  return fetchEmojiPacksByRefs(emojiPackRefs);
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

