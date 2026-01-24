// 人気タグ集計フック

import { useState, useCallback, useEffect, useRef } from 'react';
import type { TagStats } from '../types';
import { NOSTRDRAW_KIND } from '../types';
import { subscribeToEvents } from '../services/relay';
import { getCachedEventsByFilter } from '../services/eventCache';

interface UsePopularTagsOptions {
  /** 集計期間（日数） */
  days?: number;
  /** 取得するタグの最大数 */
  limit?: number;
  /** 自動更新を有効にするか */
  enabled?: boolean;
}

interface UsePopularTagsResult {
  tags: TagStats[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

const DEFAULT_DAYS = 7;
const DEFAULT_LIMIT = 20;

// タグ集計用のキャッシュ
const tagStatsCache: {
  tags: TagStats[];
  timestamp: number;
  days: number;
} | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5分

export function usePopularTags({
  days = DEFAULT_DAYS,
  limit = DEFAULT_LIMIT,
  enabled = true,
}: UsePopularTagsOptions = {}): UsePopularTagsResult {
  const [tags, setTags] = useState<TagStats[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const tagCountsRef = useRef<Map<string, number>>(new Map());
  const processedIdsRef = useRef<Set<string>>(new Set());

  // イベントからタグを抽出して集計
  const processEvent = useCallback((event: { id: string; tags: string[][] }) => {
    if (processedIdsRef.current.has(event.id)) return;
    processedIdsRef.current.add(event.id);
    
    for (const tag of event.tags) {
      if (tag[0] === 't' && tag[1]) {
        const tagValue = tag[1];
        const currentCount = tagCountsRef.current.get(tagValue) || 0;
        tagCountsRef.current.set(tagValue, currentCount + 1);
      }
    }
  }, []);

  // 集計結果をソートしてstateに反映
  const updateTagStats = useCallback(() => {
    const sortedTags: TagStats[] = Array.from(tagCountsRef.current.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
    
    setTags(sortedTags);
  }, [limit]);

  // タグを集計
  const loadTags = useCallback(() => {
    if (!enabled) {
      setTags([]);
      return;
    }

    // キャッシュをチェック
    if (
      tagStatsCache &&
      tagStatsCache.days === days &&
      Date.now() - tagStatsCache.timestamp < CACHE_TTL
    ) {
      setTags(tagStatsCache.tags.slice(0, limit));
      return;
    }

    // 既存のサブスクリプションをクリーンアップ
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    setIsLoading(true);
    setError(null);
    tagCountsRef.current.clear();
    processedIdsRef.current.clear();

    const since = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);

    try {
      // まずキャッシュから取得
      const cachedEvents = getCachedEventsByFilter({
        kinds: [NOSTRDRAW_KIND],
        since,
        limit: 500,
      });

      for (const event of cachedEvents) {
        processEvent(event);
      }
      updateTagStats();

      // リレーからストリーミングで取得
      unsubscribeRef.current = subscribeToEvents(
        {
          kinds: [NOSTRDRAW_KIND],
          since,
          limit: 500,
        },
        (event) => {
          processEvent(event);
        },
        () => {
          updateTagStats();
          setIsLoading(false);
        }
      );
    } catch (err) {
      console.error('[usePopularTags] Failed to load tags:', err);
      setError(err instanceof Error ? err.message : '読み込みに失敗しました');
      setIsLoading(false);
    }
  }, [days, limit, enabled, processEvent, updateTagStats]);

  // 初期読み込み
  useEffect(() => {
    loadTags();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [loadTags]);

  // リフレッシュ
  const refresh = useCallback(() => {
    loadTags();
  }, [loadTags]);

  return {
    tags,
    isLoading,
    error,
    refresh,
  };
}
