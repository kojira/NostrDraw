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

// リアクション数を取得して更新するヘルパー（ストリーミング対応）
// リアクション1つ受信するごとにUIが更新される
function streamAndUpdateReactions(
  cards: NostrDrawPost[],
  userPubkey: string | null | undefined,
  setCards: React.Dispatch<React.SetStateAction<NostrDrawPostWithReactions[]>>
): () => void {
  if (cards.length === 0) return () => {};
  
  console.log('[streamAndUpdateReactions] starting for', cards.length, 'cards');
  const cardIds = cards.map(c => c.id);
  const userReactedSet = new Set<string>();
  let unsubscribe: (() => void) | null = null;
  
  // ユーザーのリアクション状態を取得（バックグラウンドで）
  if (userPubkey) {
    import('../services/card').then(({ hasUserReacted }) => {
      Promise.all(
        cardIds.map(async (cardId) => {
          const reacted = await hasUserReacted(cardId, userPubkey);
          if (reacted) {
            userReactedSet.add(cardId);
          }
        })
      );
    });
  }
  
  // リアクション数をストリーミングで取得
  import('../services/card').then(({ streamReactionCounts }) => {
    console.log('[streamAndUpdateReactions] calling streamReactionCounts');
    unsubscribe = streamReactionCounts(
      cardIds,
      (reactions) => {
        console.log('[streamAndUpdateReactions] onUpdate called, reactions size:', reactions.size);
        // 関数形式でsetCardsを呼び出し、最新のカード一覧を参照する
        setCards(prevCards => {
          const updatedCards = prevCards.map(card => ({
            ...card,
            reactionCount: reactions.get(card.id) || card.reactionCount,
            userReacted: userReactedSet.has(card.id) || card.userReacted,
          }));
          const totalReactions = updatedCards.reduce((sum, c) => sum + c.reactionCount, 0);
          console.log('[streamAndUpdateReactions] updating cards, total reactions:', totalReactions);
          return updatedCards;
        });
      }
    );
  });
  
  return () => {
    if (unsubscribe) {
      unsubscribe();
    }
  };
}

// 公開ギャラリー（みんなの作品・新着）を取得 - ストリーミング対応
export function usePublicGalleryCards(userPubkey?: string | null) {
  const [cards, setCards] = useState<NostrDrawPostWithReactions[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const allCardsRef = useRef<NostrDrawPost[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const reactionUnsubscribeRef = useRef<(() => void) | null>(null);
  const userPubkeyRef = useRef(userPubkey);
  const reactionsStartedRef = useRef(false);
  
  // userPubkeyの変更を追跡
  useEffect(() => {
    userPubkeyRef.current = userPubkey;
  }, [userPubkey]);

  const loadCards = useCallback(() => {
    // 既存の購読をクリーンアップ
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }
    if (reactionUnsubscribeRef.current) {
      reactionUnsubscribeRef.current();
    }
    
    setIsLoading(true);
    setError(null);
    setCards([]);
    setHasMore(true);
    allCardsRef.current = [];
    seenIdsRef.current = new Set();
    reactionsStartedRef.current = false;

    let cardBatchTimeout: ReturnType<typeof setTimeout> | null = null;
    
    const handleCard = (card: NostrDrawPost) => {
      // 重複チェック
      if (seenIdsRef.current.has(card.id)) return;
      seenIdsRef.current.add(card.id);
      
      // 公開カードのみ（宛先なし）
      if (card.recipientPubkey) return;
      
      allCardsRef.current.push(card);
      
      // 関数形式でsetCardsを呼び出し、既存のリアクション数を保持する
      setCards(prevCards => {
        // 既存のカードのリアクション数をMapで保持
        const reactionMap = new Map(prevCards.map(c => [c.id, { reactionCount: c.reactionCount, userReacted: c.userReacted }]));
        // allCardsRef.currentをソートして新しいカード一覧を作成
        const sortedCards = [...allCardsRef.current]
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(c => ({
            ...c,
            reactionCount: reactionMap.get(c.id)?.reactionCount ?? 0,
            userReacted: reactionMap.get(c.id)?.userReacted ?? false,
          }));
        return sortedCards;
      });
      
      // カードが追加されたら、少し待ってからリアクション取得開始
      if (!reactionsStartedRef.current) {
        if (cardBatchTimeout) clearTimeout(cardBatchTimeout);
        cardBatchTimeout = setTimeout(() => {
          if (!reactionsStartedRef.current && allCardsRef.current.length > 0) {
            reactionsStartedRef.current = true;
            // ストリーミングでリアクション取得（1つずつUIに反映）
            reactionUnsubscribeRef.current = streamAndUpdateReactions(
              allCardsRef.current,
              userPubkeyRef.current,
              setCards
            );
          }
        }, 50);
      }
    };

    const handleEose = () => {
      // EOSE後、まだリアクション取得が開始されていなければ開始
      if (!reactionsStartedRef.current && allCardsRef.current.length > 0) {
        reactionsStartedRef.current = true;
        reactionUnsubscribeRef.current = streamAndUpdateReactions(
          allCardsRef.current,
          userPubkeyRef.current,
          setCards
        );
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
      // 最も古いカードのcreatedAtを取得
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
        // 追加されたカードをrefに追加
        for (const card of moreCards) {
          seenIdsRef.current.add(card.id);
          allCardsRef.current.push(card);
        }
        
        // 既存のリアクション購読を解除して再開始
        if (reactionUnsubscribeRef.current) {
          reactionUnsubscribeRef.current();
        }
        reactionUnsubscribeRef.current = streamAndUpdateReactions(
          allCardsRef.current,
          userPubkeyRef.current,
          setCards
        );
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
      if (reactionUnsubscribeRef.current) {
        reactionUnsubscribeRef.current();
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

// 人気投稿（過去N日間でリアクション多い順）を取得 - ストリーミング対応
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
      
      // 日時でソートして表示更新（EOSE前は仮表示）
      const sortedCards = [...allCardsRef.current]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 20)
        .map(c => ({ ...c, reactionCount: 0 }));
      setCards(sortedCards);
    };

    const handleEose = async () => {
      // EOSE後にリアクション数を取得してソート
      if (allCardsRef.current.length > 0) {
        try {
          const { fetchReactionCounts } = await import('../services/card');
          const cardIds = allCardsRef.current.map(c => c.id);
          const reactions = await fetchReactionCounts(cardIds);
          
          // リアクション数でソート
          const sortedByReaction = [...allCardsRef.current]
            .map(card => ({
              ...card,
              reactionCount: reactions.get(card.id) || 0,
            }))
            .sort((a, b) => b.reactionCount - a.reactionCount)
            .slice(0, 20);
          
          setCards(sortedByReaction);
        } catch (err) {
          console.error('Failed to fetch reaction counts:', err);
        }
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

// フォロー中のユーザーの投稿を取得 - ストリーミング対応
export function useFollowCards(followees: string[], userPubkey?: string | null) {
  const [cards, setCards] = useState<NostrDrawPostWithReactions[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const allCardsRef = useRef<NostrDrawPost[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const reactionUnsubscribeRef = useRef<(() => void) | null>(null);
  const followeesRef = useRef<string[]>(followees);
  const userPubkeyRef = useRef(userPubkey);
  const reactionsStartedRef = useRef(false);

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
    if (reactionUnsubscribeRef.current) {
      reactionUnsubscribeRef.current();
      reactionUnsubscribeRef.current = null;
    }
    
    if (followees.length === 0) {
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
    reactionsStartedRef.current = false;

    let cardBatchTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleCard = (card: NostrDrawPost) => {
      // 重複チェック
      if (seenIdsRef.current.has(card.id)) return;
      seenIdsRef.current.add(card.id);
      
      allCardsRef.current.push(card);
      
      // 関数形式でsetCardsを呼び出し、既存のリアクション数を保持する
      setCards(prevCards => {
        // 既存のカードのリアクション数をMapで保持
        const reactionMap = new Map(prevCards.map(c => [c.id, { reactionCount: c.reactionCount, userReacted: c.userReacted }]));
        // allCardsRef.currentをソートして新しいカード一覧を作成
        const sortedCards = [...allCardsRef.current]
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(c => ({
            ...c,
            reactionCount: reactionMap.get(c.id)?.reactionCount ?? 0,
            userReacted: reactionMap.get(c.id)?.userReacted ?? false,
          }));
        return sortedCards;
      });
      
      // カードが追加されたら、少し待ってからリアクション取得開始
      if (!reactionsStartedRef.current) {
        if (cardBatchTimeout) clearTimeout(cardBatchTimeout);
        cardBatchTimeout = setTimeout(() => {
          if (!reactionsStartedRef.current && allCardsRef.current.length > 0) {
            reactionsStartedRef.current = true;
            reactionUnsubscribeRef.current = streamAndUpdateReactions(
              allCardsRef.current,
              userPubkeyRef.current,
              setCards
            );
          }
        }, 50);
      }
    };

    const handleEose = () => {
      // EOSE後、まだリアクション取得が開始されていなければ開始
      if (!reactionsStartedRef.current && allCardsRef.current.length > 0) {
        reactionsStartedRef.current = true;
        reactionUnsubscribeRef.current = streamAndUpdateReactions(
          allCardsRef.current,
          userPubkeyRef.current,
          setCards
        );
      }
      setIsLoading(false);
    };

    try {
      unsubscribeRef.current = subscribeToCardsByAuthors(followees, handleCard, handleEose, 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'フォロー中のユーザーの投稿取得に失敗しました');
      setIsLoading(false);
    }
  }, [followees]);

  // 無限スクロール：追加読み込み
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || allCardsRef.current.length === 0 || followeesRef.current.length === 0) return;
    
    setIsLoadingMore(true);
    
    try {
      // 最も古いカードのcreatedAtを取得
      const oldestCard = allCardsRef.current.reduce((oldest, card) => 
        card.createdAt < oldest.createdAt ? card : oldest
      );
      
      const moreCards = await fetchMoreCardsByAuthors(
        followeesRef.current,
        oldestCard.createdAt,
        20,
        seenIdsRef.current
      );
      
      if (moreCards.length === 0) {
        setHasMore(false);
      } else {
        // 追加されたカードをrefに追加
        for (const card of moreCards) {
          seenIdsRef.current.add(card.id);
          allCardsRef.current.push(card);
        }
        
        // 既存のリアクション購読を解除して再開始
        if (reactionUnsubscribeRef.current) {
          reactionUnsubscribeRef.current();
        }
        reactionUnsubscribeRef.current = streamAndUpdateReactions(
          allCardsRef.current,
          userPubkeyRef.current,
          setCards
        );
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
      if (reactionUnsubscribeRef.current) {
        reactionUnsubscribeRef.current();
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

