// 人気タグ集計フック

import { useState, useCallback, useEffect, useRef } from 'react';
import type { TagStats } from '../types';
import { NOSTRDRAW_KIND, POST_TAGS_KIND } from '../types';
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
  const unsubscribeRef2 = useRef<(() => void) | null>(null);
  const tagCountsRef = useRef<Map<string, number>>(new Map());
  const processedIdsRef = useRef<Set<string>>(new Set());
  // POST_TAGS_KINDの場合、参照先の投稿IDごとに処理済みかを追跡
  const processedPostTagsRef = useRef<Set<string>>(new Set());

  // 投稿イベントからタグを抽出して集計
  const processPostEvent = useCallback((event: { id: string; tags: string[][] }) => {
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

  // POST_TAGS_KINDイベントからタグを抽出して集計
  const processTagEvent = useCallback((event: { id: string; tags: string[][] }) => {
    // dタグ（参照先の投稿ID）を取得
    const dTag = event.tags.find(t => t[0] === 'd')?.[1];
    if (!dTag) return;
    
    // 同じ投稿に対して既に処理済みなら古いものを削除して新しいものを追加
    // （より新しいタグイベントが優先される）
    if (processedPostTagsRef.current.has(dTag)) return;
    processedPostTagsRef.current.add(dTag);
    
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
    if (unsubscribeRef2.current) {
      unsubscribeRef2.current();
      unsubscribeRef2.current = null;
    }

    setIsLoading(true);
    setError(null);
    tagCountsRef.current.clear();
    processedIdsRef.current.clear();
    processedPostTagsRef.current.clear();

    const since = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
    let completedStreams = 0;
    const totalStreams = 2;

    const checkCompletion = () => {
      completedStreams++;
      if (completedStreams >= totalStreams) {
        updateTagStats();
        setIsLoading(false);
      }
    };

    try {
      // 1. 投稿イベントからタグを取得
      const cachedPostEvents = getCachedEventsByFilter({
        kinds: [NOSTRDRAW_KIND],
        since,
        limit: 500,
      });

      for (const event of cachedPostEvents) {
        processPostEvent(event);
      }

      // 2. POST_TAGS_KINDからタグを取得
      const cachedTagEvents = getCachedEventsByFilter({
        kinds: [POST_TAGS_KIND],
        since,
        limit: 500,
      });

      for (const event of cachedTagEvents) {
        processTagEvent(event);
      }
      
      updateTagStats();

      // リレーからストリーミングで取得（投稿イベント）
      unsubscribeRef.current = subscribeToEvents(
        {
          kinds: [NOSTRDRAW_KIND],
          since,
          limit: 500,
        },
        (event) => {
          processPostEvent(event);
        },
        checkCompletion
      );

      // リレーからストリーミングで取得（タグイベント）
      unsubscribeRef2.current = subscribeToEvents(
        {
          kinds: [POST_TAGS_KIND],
          since,
          limit: 500,
        },
        (event) => {
          processTagEvent(event);
        },
        checkCompletion
      );
    } catch (err) {
      console.error('[usePopularTags] Failed to load tags:', err);
      setError(err instanceof Error ? err.message : '読み込みに失敗しました');
      setIsLoading(false);
    }
  }, [days, limit, enabled, processPostEvent, processTagEvent, updateTagStats]);

  // 初期読み込み
  useEffect(() => {
    loadTags();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      if (unsubscribeRef2.current) {
        unsubscribeRef2.current();
        unsubscribeRef2.current = null;
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
