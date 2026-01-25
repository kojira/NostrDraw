// 年賀状データ管理フック

import { useState, useCallback, useEffect, useRef } from 'react';
import type { NostrDrawPost, LayoutType } from '../types';
import { 
  fetchReceivedCards, 
  fetchSentCards, 
  sendCard, 
  subscribeToPublicGalleryCards,
  subscribeToCardsByAuthors,
  fetchMorePublicGalleryCards,
  fetchMoreCardsByAuthors,
  mergePostTags,
  fetchReactionCounts,
  hasUserReacted,
  type SendCardParams,
  type NostrDrawPostWithReactions,
} from '../services/card';
import type { Event, EventTemplate } from 'nostr-tools';

export function useReceivedCards(pubkey: string | null) {
  const [cards, setCards] = useState<NostrDrawPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCards = useCallback(async () => {
    if (!pubkey) {
      setCards([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const receivedCards = await fetchReceivedCards(pubkey);
      setCards(receivedCards);
    } catch (err) {
      setError(err instanceof Error ? err.message : '年賀状の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [pubkey]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  return {
    cards,
    count: cards.length,
    isLoading,
    error,
    refresh: loadCards,
  };
}

export function useSentCards(pubkey: string | null) {
  const [cards, setCards] = useState<NostrDrawPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCards = useCallback(async () => {
    if (!pubkey) {
      setCards([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const sentCards = await fetchSentCards(pubkey);
      setCards(sentCards);
    } catch (err) {
      setError(err instanceof Error ? err.message : '送信済み年賀状の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [pubkey]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  return {
    cards,
    count: cards.length,
    isLoading,
    error,
    refresh: loadCards,
  };
}

// リアクション数を取得して更新するヘルパー（Promiseベース）
// 一度だけリアクション数を取得して更新
async function fetchAndUpdateReactions(
  cards: NostrDrawPost[],
  userPubkey: string | null | undefined,
  setCards: React.Dispatch<React.SetStateAction<NostrDrawPostWithReactions[]>>
): Promise<void> {
  if (cards.length === 0) return;
  
  console.log('[fetchAndUpdateReactions] starting for', cards.length, 'cards');
  const cardIds = cards.map(c => c.id);
  const userReactedSet = new Set<string>();
  
  // ユーザーのリアクション状態を取得
  if (userPubkey) {
    await Promise.all(
      cardIds.map(async (cardId) => {
        const reacted = await hasUserReacted(cardId, userPubkey);
        if (reacted) {
          userReactedSet.add(cardId);
        }
      })
    );
  }
  
  // リアクション数を一度だけ取得
  console.log('[fetchAndUpdateReactions] fetching reaction counts');
  const reactions = await fetchReactionCounts(cardIds);
  console.log('[fetchAndUpdateReactions] got reactions:', reactions.size);
  
  // カードを更新
  setCards(prevCards => {
    const updatedCards = prevCards.map(card => ({
      ...card,
      reactionCount: reactions.get(card.id) || card.reactionCount,
      userReacted: userReactedSet.has(card.id) || card.userReacted,
    }));
    return updatedCards;
  });
}

// 公開ギャラリー（みんなの作品・新着）を取得
export function usePublicGalleryCards(userPubkey?: string | null) {
  const [cards, setCards] = useState<NostrDrawPostWithReactions[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const allCardsRef = useRef<NostrDrawPost[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const userPubkeyRef = useRef(userPubkey);
  
  // userPubkeyの変更を追跡
  useEffect(() => {
    userPubkeyRef.current = userPubkey;
  }, [userPubkey]);

  const loadCards = useCallback(() => {
    // 既存の購読をクリーンアップ
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }
    
    setIsLoading(true);
    setError(null);
    setCards([]);
    setHasMore(true);
    allCardsRef.current = [];
    seenIdsRef.current = new Set();

    const handleCard = (card: NostrDrawPost) => {
      // 重複チェック
      if (seenIdsRef.current.has(card.id)) return;
      seenIdsRef.current.add(card.id);
      
      // 公開カードのみ（宛先なし）
      if (card.recipientPubkey) return;
      
      allCardsRef.current.push(card);
      
      // 関数形式でsetCardsを呼び出し、既存のリアクション数を保持する
      setCards(prevCards => {
        const reactionMap = new Map(prevCards.map(c => [c.id, { reactionCount: c.reactionCount, userReacted: c.userReacted }]));
        const sortedCards = [...allCardsRef.current]
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(c => ({
            ...c,
            reactionCount: reactionMap.get(c.id)?.reactionCount ?? 0,
            userReacted: reactionMap.get(c.id)?.userReacted ?? false,
          }));
        return sortedCards;
      });
    };

    const handleEose = async () => {
      // 別kindで管理されているタグをマージ
      if (allCardsRef.current.length > 0) {
        try {
          const mergedCards = await mergePostTags(allCardsRef.current);
          allCardsRef.current = mergedCards;
          // タグをマージしたカードで更新
          setCards(prevCards => {
            const reactionMap = new Map(prevCards.map(c => [c.id, { reactionCount: c.reactionCount, userReacted: c.userReacted }]));
            return mergedCards
              .sort((a, b) => b.createdAt - a.createdAt)
              .map(c => ({
                ...c,
                reactionCount: reactionMap.get(c.id)?.reactionCount ?? 0,
                userReacted: reactionMap.get(c.id)?.userReacted ?? false,
              }));
          });
        } catch (err) {
          console.error('[usePublicGalleryCards] Failed to merge tags:', err);
        }
      }
      
      // EOSE後にリアクション数を一度だけ取得
      if (allCardsRef.current.length > 0) {
        fetchAndUpdateReactions(allCardsRef.current, userPubkeyRef.current, setCards);
      }
      setIsLoading(false);
    };

    try {
      unsubscribeRef.current = subscribeToPublicGalleryCards(handleCard, handleEose, 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : '作品の取得に失敗しました');
      setIsLoading(false);
    }
  }, []);

  // 無限スクロール：追加読み込み
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || allCardsRef.current.length === 0) return;
    
    setIsLoadingMore(true);
    
    try {
      const oldestCard = allCardsRef.current.reduce((oldest, card) => 
        card.createdAt < oldest.createdAt ? card : oldest
      );
      
      const moreCards = await fetchMorePublicGalleryCards(
        oldestCard.createdAt,
        20,
        seenIdsRef.current
      );
      
      if (moreCards.length === 0) {
        setHasMore(false);
      } else {
        for (const card of moreCards) {
          seenIdsRef.current.add(card.id);
          allCardsRef.current.push(card);
        }
        
        // 追加カードのリアクション数を取得
        fetchAndUpdateReactions(allCardsRef.current, userPubkeyRef.current, setCards);
      }
    } catch (err) {
      console.error('追加読み込みエラー:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore]);

  useEffect(() => {
    loadCards();
    
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [loadCards]);

  return {
    cards,
    count: cards.length,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    refresh: loadCards,
    loadMore,
  };
}

// 人気投稿（過去N日間でリアクション多い順）を取得
export function usePopularCards(days: number = 3) {
  const [cards, setCards] = useState<NostrDrawPostWithReactions[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const allCardsRef = useRef<NostrDrawPost[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const loadCards = useCallback(() => {
    // 既存の購読をクリーンアップ
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    
    setIsLoading(true);
    setError(null);
    setCards([]);
    allCardsRef.current = [];
    seenIdsRef.current = new Set();

    const sinceTimestamp = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);

    const handleCard = (card: NostrDrawPost) => {
      // 重複チェック
      if (seenIdsRef.current.has(card.id)) return;
      seenIdsRef.current.add(card.id);
      
      // 公開カードのみ（宛先なし）
      if (card.recipientPubkey) return;
      
      // 期間フィルタ
      if (card.createdAt < sinceTimestamp) return;
      
      allCardsRef.current.push(card);
    };

    const handleEose = async () => {
      // 別kindで管理されているタグをマージ
      if (allCardsRef.current.length > 0) {
        try {
          const mergedCards = await mergePostTags(allCardsRef.current);
          allCardsRef.current = mergedCards;
        } catch (err) {
          console.error('[usePopularCards] Failed to merge tags:', err);
        }
      }
      
      // EOSE後にリアクション数を一度だけ取得して人気順にソート
      if (allCardsRef.current.length > 0) {
        const cardIds = allCardsRef.current.map(c => c.id);
        const reactions = await fetchReactionCounts(cardIds);
        
        const sortedCards = [...allCardsRef.current]
          .map(c => ({
            ...c,
            reactionCount: reactions.get(c.id) || 0,
            userReacted: false,
          }))
          .sort((a, b) => b.reactionCount - a.reactionCount || b.createdAt - a.createdAt)
          .slice(0, 20);
        
        setCards(sortedCards);
      }
      setIsLoading(false);
    };

    try {
      unsubscribeRef.current = subscribeToPublicGalleryCards(handleCard, handleEose, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : '人気作品の取得に失敗しました');
      setIsLoading(false);
    }
  }, [days]);

  useEffect(() => {
    loadCards();
    
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [loadCards]);

  return {
    cards,
    count: cards.length,
    isLoading,
    error,
    refresh: loadCards,
  };
}

// フォロー中のユーザーの投稿を取得
export function useFollowCards(followees: string[], userPubkey?: string | null) {
  const [cards, setCards] = useState<NostrDrawPostWithReactions[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const allCardsRef = useRef<NostrDrawPost[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const followeesRef = useRef<string[]>(followees);
  const userPubkeyRef = useRef(userPubkey);

  // followeesの変更を追跡
  useEffect(() => {
    followeesRef.current = followees;
  }, [followees]);
  
  // userPubkeyの変更を追跡
  useEffect(() => {
    userPubkeyRef.current = userPubkey;
  }, [userPubkey]);

  const loadCards = useCallback(() => {
    // 既存の購読をクリーンアップ
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    
    // フォロイー + 自分自身のpubkeyを含める
    const authors = userPubkey 
      ? [...new Set([...followees, userPubkey])]
      : followees;
    
    if (authors.length === 0) {
      setCards([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setCards([]);
    setHasMore(true);
    allCardsRef.current = [];
    seenIdsRef.current = new Set();

    const handleCard = (card: NostrDrawPost) => {
      // 重複チェック
      if (seenIdsRef.current.has(card.id)) return;
      seenIdsRef.current.add(card.id);
      
      allCardsRef.current.push(card);
      
      // 関数形式でsetCardsを呼び出し、既存のリアクション数を保持する
      setCards(prevCards => {
        const reactionMap = new Map(prevCards.map(c => [c.id, { reactionCount: c.reactionCount, userReacted: c.userReacted }]));
        const sortedCards = [...allCardsRef.current]
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(c => ({
            ...c,
            reactionCount: reactionMap.get(c.id)?.reactionCount ?? 0,
            userReacted: reactionMap.get(c.id)?.userReacted ?? false,
          }));
        return sortedCards;
      });
    };

    const handleEose = async () => {
      // 別kindで管理されているタグをマージ
      if (allCardsRef.current.length > 0) {
        try {
          const mergedCards = await mergePostTags(allCardsRef.current);
          allCardsRef.current = mergedCards;
          // タグをマージしたカードで更新
          setCards(prevCards => {
            const reactionMap = new Map(prevCards.map(c => [c.id, { reactionCount: c.reactionCount, userReacted: c.userReacted }]));
            return mergedCards
              .sort((a, b) => b.createdAt - a.createdAt)
              .map(c => ({
                ...c,
                reactionCount: reactionMap.get(c.id)?.reactionCount ?? 0,
                userReacted: reactionMap.get(c.id)?.userReacted ?? false,
              }));
          });
        } catch (err) {
          console.error('[useFollowCards] Failed to merge tags:', err);
        }
      }
      
      // EOSE後にリアクション数を一度だけ取得
      if (allCardsRef.current.length > 0) {
        fetchAndUpdateReactions(allCardsRef.current, userPubkeyRef.current, setCards);
      }
      setIsLoading(false);
    };

    try {
      unsubscribeRef.current = subscribeToCardsByAuthors(authors, handleCard, handleEose, 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'フォロー中のユーザーの投稿取得に失敗しました');
      setIsLoading(false);
    }
  }, [followees, userPubkey]);

  // 無限スクロール：追加読み込み
  const loadMore = useCallback(async () => {
    // フォロイー + 自分自身のpubkeyを含める
    const authors = userPubkeyRef.current
      ? [...new Set([...followeesRef.current, userPubkeyRef.current])]
      : followeesRef.current;
    
    if (isLoadingMore || !hasMore || allCardsRef.current.length === 0 || authors.length === 0) return;
    
    setIsLoadingMore(true);
    
    try {
      const oldestCard = allCardsRef.current.reduce((oldest, card) => 
        card.createdAt < oldest.createdAt ? card : oldest
      );
      
      const moreCards = await fetchMoreCardsByAuthors(
        authors,
        oldestCard.createdAt,
        20,
        seenIdsRef.current
      );
      
      if (moreCards.length === 0) {
        setHasMore(false);
      } else {
        for (const card of moreCards) {
          seenIdsRef.current.add(card.id);
          allCardsRef.current.push(card);
        }
        
        // 追加カードのリアクション数を取得
        fetchAndUpdateReactions(allCardsRef.current, userPubkeyRef.current, setCards);
      }
    } catch (err) {
      console.error('追加読み込みエラー:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore]);

  useEffect(() => {
    loadCards();
    
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [loadCards]);

  return {
    cards,
    count: cards.length,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    refresh: loadCards,
    loadMore,
  };
}

export function useSendCard(signEvent: (event: EventTemplate) => Promise<Event>) {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEventId, setLastEventId] = useState<string | null>(null);

  const send = useCallback(async (params: SendCardParams): Promise<string | null> => {
    setIsSending(true);
    setError(null);
    setLastEventId(null);

    try {
      const event = await sendCard(params, signEvent);
      setLastEventId(event.id);
      return event.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : '送信に失敗しました');
      return null;
    } finally {
      setIsSending(false);
    }
  }, [signEvent]);

  return {
    send,
    isSending,
    error,
    lastEventId,
  };
}

// 年賀状エディタの状態管理
export interface CardEditorState {
  recipientPubkey: string | null;
  svg: string | null; // SVGデータ
  message: string;
  layoutId: LayoutType;
}

export function useCardEditor() {
  const [state, setState] = useState<CardEditorState>({
    recipientPubkey: null,
    svg: null,
    message: '',
    layoutId: 'vertical',
  });

  const setRecipient = useCallback((pubkey: string | null) => {
    setState(prev => ({ ...prev, recipientPubkey: pubkey }));
  }, []);

  const setSvg = useCallback((svg: string | null) => {
    setState(prev => ({ ...prev, svg }));
  }, []);

  const setMessage = useCallback((message: string) => {
    setState(prev => ({ ...prev, message }));
  }, []);

  const setLayout = useCallback((layoutId: LayoutType) => {
    setState(prev => ({ ...prev, layoutId }));
  }, []);

  const reset = useCallback(() => {
    setState({
      recipientPubkey: null,
      svg: null,
      message: '',
      layoutId: 'vertical',
    });
  }, []);

  // SVGがあれば有効（宛先は任意）
  const isValid = !!state.svg;

  return {
    state,
    setRecipient,
    setSvg,
    setMessage,
    setLayout,
    reset,
    isValid,
  };
}

