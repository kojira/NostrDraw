// 未読通知数フック

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Event, EventTemplate } from 'nostr-tools';
import {
  fetchLastReadTimestamp,
  updateLastReadTimestamp,
  countUnreadNotifications,
} from '../services/notificationRead';

interface UseUnreadCountOptions {
  /** ユーザーの公開鍵 */
  userPubkey: string | null;
  /** イベント署名関数 */
  signEvent?: (event: EventTemplate) => Promise<Event>;
  /** 自動更新間隔（ミリ秒）、0で無効 */
  refreshInterval?: number;
}

interface UseUnreadCountResult {
  /** 未読通知数 */
  unreadCount: number;
  /** 読み込み中 */
  isLoading: boolean;
  /** エラー */
  error: string | null;
  /** 既読にする */
  markAsRead: () => Promise<void>;
  /** 手動リフレッシュ */
  refresh: () => void;
}

export function useUnreadCount({
  userPubkey,
  signEvent,
  refreshInterval = 60000, // デフォルト1分
}: UseUnreadCountOptions): UseUnreadCountResult {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastReadRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 未読数を取得
  const fetchUnreadCount = useCallback(async () => {
    if (!userPubkey) {
      setUnreadCount(0);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 最終確認時刻を取得（キャッシュがあればそれを使う）
      if (lastReadRef.current === null) {
        lastReadRef.current = await fetchLastReadTimestamp(userPubkey);
      }

      // 未読数をカウント
      const count = await countUnreadNotifications(userPubkey, lastReadRef.current);
      setUnreadCount(count);
    } catch (err) {
      console.error('[useUnreadCount] Failed to fetch unread count:', err);
      setError(err instanceof Error ? err.message : '読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [userPubkey]);

  // 既読にする
  const markAsRead = useCallback(async () => {
    if (!userPubkey || !signEvent) {
      return;
    }

    try {
      const result = await updateLastReadTimestamp(signEvent);
      if (result.success && result.timestamp) {
        lastReadRef.current = result.timestamp;
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('[useUnreadCount] Failed to mark as read:', err);
    }
  }, [userPubkey, signEvent]);

  // 手動リフレッシュ
  const refresh = useCallback(() => {
    // 最終確認時刻のキャッシュをクリアして再取得
    lastReadRef.current = null;
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  // 初期取得
  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  // 定期更新
  useEffect(() => {
    if (refreshInterval > 0 && userPubkey) {
      intervalRef.current = setInterval(() => {
        fetchUnreadCount();
      }, refreshInterval);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [refreshInterval, userPubkey, fetchUnreadCount]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    unreadCount,
    isLoading,
    error,
    markAsRead,
    refresh,
  };
}
