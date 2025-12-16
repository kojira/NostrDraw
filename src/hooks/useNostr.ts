// Nostr接続管理フック

import { useState, useEffect, useCallback } from 'react';
import type { RelayConfig, NostrProfile } from '../types';
import { DEFAULT_RELAYS } from '../types';
import { 
  setRelays, 
  addRelay, 
  removeRelay, 
  closePool 
} from '../services/relay';
import { fetchFollowees, fetchProfiles } from '../services/profile';

const RELAYS_STORAGE_KEY = 'nostr-nenga-relays';

export function useNostr() {
  const [relays, setRelaysState] = useState<RelayConfig[]>(() => {
    const stored = localStorage.getItem(RELAYS_STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return DEFAULT_RELAYS;
      }
    }
    return DEFAULT_RELAYS;
  });

  // 初期化時にサービスにリレーを設定
  useEffect(() => {
    setRelays(relays);
  }, [relays]);

  // リレーの追加
  const handleAddRelay = useCallback((relay: RelayConfig) => {
    setRelaysState(prev => {
      const exists = prev.some(r => r.url === relay.url);
      if (exists) return prev;
      const updated = [...prev, relay];
      localStorage.setItem(RELAYS_STORAGE_KEY, JSON.stringify(updated));
      addRelay(relay);
      return updated;
    });
  }, []);

  // リレーの削除
  const handleRemoveRelay = useCallback((url: string) => {
    setRelaysState(prev => {
      const updated = prev.filter(r => r.url !== url);
      localStorage.setItem(RELAYS_STORAGE_KEY, JSON.stringify(updated));
      removeRelay(url);
      return updated;
    });
  }, []);

  // リレー設定の更新
  const updateRelays = useCallback((newRelays: RelayConfig[]) => {
    setRelaysState(newRelays);
    localStorage.setItem(RELAYS_STORAGE_KEY, JSON.stringify(newRelays));
    setRelays(newRelays);
  }, []);

  // デフォルトリレーにリセット
  const resetToDefaultRelays = useCallback(() => {
    setRelaysState(DEFAULT_RELAYS);
    localStorage.setItem(RELAYS_STORAGE_KEY, JSON.stringify(DEFAULT_RELAYS));
    setRelays(DEFAULT_RELAYS);
  }, []);

  // クリーンアップ
  useEffect(() => {
    return () => {
      closePool();
    };
  }, []);

  return {
    relays,
    addRelay: handleAddRelay,
    removeRelay: handleRemoveRelay,
    updateRelays,
    resetToDefaultRelays,
  };
}

const FOLLOWEES_CACHE_KEY = 'nostr-nenga-followees';

// キャッシュからフォロイーを読み込む
function loadFolloweesFromCache(pubkey: string): NostrProfile[] | null {
  try {
    const cached = localStorage.getItem(`${FOLLOWEES_CACHE_KEY}-${pubkey}`);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // キャッシュ読み込み失敗
  }
  return null;
}

// フォロイーをキャッシュに保存
function saveFolloweesToCache(pubkey: string, followees: NostrProfile[]) {
  try {
    localStorage.setItem(`${FOLLOWEES_CACHE_KEY}-${pubkey}`, JSON.stringify(followees));
  } catch {
    // キャッシュ保存失敗（容量オーバーなど）
  }
}

export function useFollowees(pubkey: string | null) {
  const [followees, setFollowees] = useState<NostrProfile[]>(() => {
    // 初期値としてキャッシュから読み込む
    if (pubkey) {
      return loadFolloweesFromCache(pubkey) || [];
    }
    return [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // ネットワークからフォロイーを取得（更新ボタン用）
  const loadFollowees = useCallback(async () => {
    if (!pubkey) {
      setFollowees([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // フォロイーのpubkeyリストを取得
      const followeePubkeys = await fetchFollowees(pubkey);
      
      if (followeePubkeys.length === 0) {
        setFollowees([]);
        saveFolloweesToCache(pubkey, []);
        return;
      }

      // プロフィールを取得
      const profiles = await fetchProfiles(followeePubkeys);
      
      // プロフィールが取得できなかった場合は最低限の情報で表示
      const followeeList: NostrProfile[] = followeePubkeys.map(pk => {
        const profile = profiles.get(pk);
        if (profile) {
          return profile;
        }
        return {
          pubkey: pk,
          npub: '', // 後で設定される
          name: undefined,
          display_name: undefined,
        };
      });

      setFollowees(followeeList);
      saveFolloweesToCache(pubkey, followeeList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'フォロイーの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [pubkey]);

  // pubkeyが変わった時にキャッシュから読み込む（なければ取得）
  useEffect(() => {
    if (!pubkey) {
      setFollowees([]);
      setIsInitialized(false);
      return;
    }

    const cached = loadFolloweesFromCache(pubkey);
    if (cached && cached.length > 0) {
      setFollowees(cached);
      setIsInitialized(true);
    } else if (!isInitialized) {
      // キャッシュがない場合のみ自動取得
      loadFollowees().then(() => setIsInitialized(true));
    }
  }, [pubkey, isInitialized, loadFollowees]);

  return {
    followees,
    isLoading,
    error,
    refresh: loadFollowees,
  };
}

