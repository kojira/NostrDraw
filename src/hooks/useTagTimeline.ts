// タグタイムライン取得フック

import { useState, useCallback, useEffect, useRef } from 'react';
import type { NostrDrawPost } from '../types';
import {
  subscribeToCardsByTags,
  fetchMoreCardsByTags,
  fetchReactionCounts,
  mergePostTags,
  type NostrDrawPostWithReactions,
} from '../services/card';

interface UseTagTimelineOptions {
  tags: string[];
  enabled?: boolean;
}

interface UseTagTimelineResult {
  cards: NostrDrawPostWithReactions[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => void;
}

const INITIAL_LIMIT = 50;
const LOAD_MORE_LIMIT = 20;
const DISPLAY_LIMIT = 20;

// カードIDリストを安定した文字列に変換
function getCardIdsKey(cards: { id: string }[]): string {
  return cards.map(c => c.id).join(',');
}

export function useTagTimeline({
  tags,
  enabled = true,
}: UseTagTimelineOptions): UseTagTimelineResult {
  const [cards, setCards] = useState<NostrDrawPostWithReactions[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [displayCount, setDisplayCount] = useState(DISPLAY_LIMIT);
  
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const isLoadingMoreRef = useRef(false);
  const oldestTimestampRef = useRef<number | null>(null);
  // リアクション取得済みのカードIDを追跡
  const fetchedReactionIdsRef = useRef<Set<string>>(new Set());

  // カードの追加（重複防止）
  const addCard = useCallback((card: NostrDrawPost) => {
    if (seenIdsRef.current.has(card.id)) return;
    seenIdsRef.current.add(card.id);
    
    // 最古のタイムスタンプを更新
    if (!oldestTimestampRef.current || card.createdAt < oldestTimestampRef.current) {
      oldestTimestampRef.current = card.createdAt;
    }
    
    setCards(prev => {
      // 重複チェック
      if (prev.some(c => c.id === card.id)) return prev;
      
      // 新しいカードを追加してソート
      const newCards = [...prev, { ...card, reactionCount: 0, userReacted: false }];
      newCards.sort((a, b) => b.createdAt - a.createdAt);
      return newCards;
    });
  }, []);

  // 初期読み込み
  const loadCards = useCallback(() => {
    if (!enabled || tags.length === 0) {
      setCards([]);
      setIsLoading(false);
      return;
    }

    // 既存のサブスクリプションをクリーンアップ
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    setIsLoading(true);
    setError(null);
    seenIdsRef.current.clear();
    oldestTimestampRef.current = null;
    fetchedReactionIdsRef.current.clear();
    setCards([]);
    setHasMore(true);
    setDisplayCount(DISPLAY_LIMIT);

    try {
      unsubscribeRef.current = subscribeToCardsByTags(
        tags,
        addCard,
        async () => {
          // 別kindで管理されているタグをマージ
          setCards(prevCards => {
            if (prevCards.length > 0) {
              // 非同期でタグをマージ
              mergePostTags(prevCards).then(mergedCards => {
                setCards(mergedCards.map(c => ({
                  ...c,
                  reactionCount: prevCards.find(p => p.id === c.id)?.reactionCount ?? 0,
                  userReacted: prevCards.find(p => p.id === c.id)?.userReacted ?? false,
                })).sort((a, b) => b.createdAt - a.createdAt));
              }).catch(err => {
                console.error('[useTagTimeline] Failed to merge tags:', err);
              });
            }
            return prevCards;
          });
          setIsLoading(false);
        },
        INITIAL_LIMIT
      );
    } catch (err) {
      console.error('[useTagTimeline] Failed to subscribe:', err);
      setError(err instanceof Error ? err.message : '読み込みに失敗しました');
      setIsLoading(false);
    }
  }, [tags, enabled, addCard]);

  // タグが変更されたら再読み込み
  useEffect(() => {
    loadCards();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [loadCards]);

  // リアクション数の取得（カードIDが変わった時に実行）
  const displayedCards = cards.slice(0, displayCount);
  const cardIdsKey = getCardIdsKey(displayedCards);
  useEffect(() => {
    if (isLoading || displayedCards.length === 0) return;
    
    // 未取得のカードIDのみ抽出
    const newCardIds = displayedCards
      .filter(c => !fetchedReactionIdsRef.current.has(c.id))
      .map(c => c.id);
    
    if (newCardIds.length === 0) return;
    
    let cancelled = false;
    
    const fetchReactions = async () => {
      try {
        const counts = await fetchReactionCounts(newCardIds);
        
        if (cancelled) return;
        
        // 取得済みとしてマーク
        newCardIds.forEach(id => fetchedReactionIdsRef.current.add(id));
        
        setCards(prev => prev.map(card => {
          const count = counts.get(card.id);
          if (count !== undefined) {
            return { ...card, reactionCount: count };
          }
          return card;
        }));
      } catch (err) {
        console.error('[useTagTimeline] Failed to fetch reactions:', err);
      }
    };
    
    fetchReactions();
    
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardIdsKey, isLoading]);

  // 追加読み込み
  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMore || !oldestTimestampRef.current) return;
    
    // まず表示数を増やす
    if (displayCount < cards.length) {
      setDisplayCount(prev => Math.min(prev + DISPLAY_LIMIT, cards.length));
      return;
    }

    isLoadingMoreRef.current = true;

    try {
      const moreCards = await fetchMoreCardsByTags(
        tags,
        oldestTimestampRef.current - 1,
        LOAD_MORE_LIMIT,
        seenIdsRef.current
      );

      if (moreCards.length === 0) {
        setHasMore(false);
      } else {
        for (const card of moreCards) {
          addCard(card);
        }
        setDisplayCount(prev => prev + LOAD_MORE_LIMIT);
      }
    } catch (err) {
      console.error('[useTagTimeline] Failed to load more:', err);
      setError(err instanceof Error ? err.message : '追加読み込みに失敗しました');
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [tags, hasMore, cards.length, displayCount, addCard]);

  // リフレッシュ
  const refresh = useCallback(() => {
    loadCards();
  }, [loadCards]);

  return {
    cards: cards.slice(0, displayCount),
    isLoading,
    error,
    hasMore: hasMore || displayCount < cards.length,
    loadMore,
    refresh,
  };
}
