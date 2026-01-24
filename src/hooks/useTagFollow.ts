// タグフォロー管理フック

import { useState, useEffect, useCallback } from 'react';
import type { Event, EventTemplate } from 'nostr-tools';
import {
  fetchFollowedTags,
  followTag,
  unfollowTag,
  clearTagFollowCache,
} from '../services/tagFollow';

interface UseTagFollowOptions {
  pubkey?: string | null;
  signEvent?: (event: EventTemplate) => Promise<Event>;
}

interface UseTagFollowResult {
  followedTags: string[];
  isLoading: boolean;
  error: string | null;
  followTagAction: (tag: string) => Promise<boolean>;
  unfollowTagAction: (tag: string) => Promise<boolean>;
  isFollowing: (tag: string) => boolean;
  refresh: () => Promise<void>;
}

export function useTagFollow({
  pubkey,
  signEvent,
}: UseTagFollowOptions): UseTagFollowResult {
  const [followedTags, setFollowedTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // フォロー中のタグを読み込み
  const loadFollowedTags = useCallback(async () => {
    if (!pubkey) {
      setFollowedTags([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const tags = await fetchFollowedTags(pubkey);
      setFollowedTags(tags);
    } catch (err) {
      console.error('[useTagFollow] Failed to load followed tags:', err);
      setError(err instanceof Error ? err.message : '読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [pubkey]);

  // 初期読み込み
  useEffect(() => {
    loadFollowedTags();
  }, [loadFollowedTags]);

  // タグをフォロー
  const followTagAction = useCallback(async (tag: string): Promise<boolean> => {
    if (!pubkey || !signEvent) {
      setError('ログインが必要です');
      return false;
    }

    // 楽観的更新
    setFollowedTags(prev => 
      prev.includes(tag) ? prev : [...prev, tag]
    );

    try {
      const result = await followTag(tag, pubkey, signEvent);
      if (!result.success) {
        // 失敗時はロールバック
        setFollowedTags(prev => prev.filter(t => t !== tag));
        setError(result.error || 'フォローに失敗しました');
        return false;
      }
      return true;
    } catch (err) {
      // エラー時はロールバック
      setFollowedTags(prev => prev.filter(t => t !== tag));
      setError(err instanceof Error ? err.message : 'フォローに失敗しました');
      return false;
    }
  }, [pubkey, signEvent]);

  // タグのフォローを解除
  const unfollowTagAction = useCallback(async (tag: string): Promise<boolean> => {
    if (!pubkey || !signEvent) {
      setError('ログインが必要です');
      return false;
    }

    // 楽観的更新
    const originalTags = [...followedTags];
    setFollowedTags(prev => prev.filter(t => t !== tag));

    try {
      const result = await unfollowTag(tag, pubkey, signEvent);
      if (!result.success) {
        // 失敗時はロールバック
        setFollowedTags(originalTags);
        setError(result.error || 'フォロー解除に失敗しました');
        return false;
      }
      return true;
    } catch (err) {
      // エラー時はロールバック
      setFollowedTags(originalTags);
      setError(err instanceof Error ? err.message : 'フォロー解除に失敗しました');
      return false;
    }
  }, [pubkey, signEvent, followedTags]);

  // タグがフォローされているかチェック
  const isFollowing = useCallback((tag: string): boolean => {
    return followedTags.includes(tag);
  }, [followedTags]);

  // 再読み込み
  const refresh = useCallback(async () => {
    if (pubkey) {
      clearTagFollowCache(pubkey);
    }
    await loadFollowedTags();
  }, [pubkey, loadFollowedTags]);

  return {
    followedTags,
    isLoading,
    error,
    followTagAction,
    unfollowTagAction,
    isFollowing,
    refresh,
  };
}
