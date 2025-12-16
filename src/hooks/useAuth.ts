// 認証状態管理フック

import { useState, useCallback, useEffect } from 'react';
import { type Event, type EventTemplate } from 'nostr-tools';
import type { AuthState, RelayConfig } from '../types';
import { npubToPubkey, pubkeyToNpub } from '../services/profile';

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: EventTemplate): Promise<Event>;
      getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>;
    };
  }
}

const AUTH_STORAGE_KEY = 'nostr-nenga-auth';

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    isLoggedIn: false,
    pubkey: null,
    npub: null,
    isNip07: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNip07Available, setIsNip07Available] = useState(false);
  const [nip07Checked, setNip07Checked] = useState(false);

  // NIP-07拡張機能の検出（遅延ロード対応）
  useEffect(() => {
    const checkNip07 = () => {
      if (typeof window !== 'undefined' && window.nostr) {
        setIsNip07Available(true);
        return true;
      }
      return false;
    };

    // 即時チェック
    if (checkNip07()) {
      setNip07Checked(true);
      return;
    }

    // 拡張機能の遅延ロードに対応するため、少し待ってから再チェック
    const timeouts = [100, 500, 1000, 2000];
    const timers: ReturnType<typeof setTimeout>[] = [];
    let found = false;

    timeouts.forEach((delay, index) => {
      const timer = setTimeout(() => {
        if (checkNip07()) {
          found = true;
          // 見つかったら他のタイマーをクリア
          timers.forEach(clearTimeout);
          setNip07Checked(true);
        } else if (index === timeouts.length - 1 && !found) {
          // 最後のタイムアウトでも見つからなかった場合
          setNip07Checked(true);
        }
      }, delay);
      timers.push(timer);
    });

    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  // 初期化時にローカルストレージから認証状態を復元
  // NIP-07拡張の検出が完了してから実行
  useEffect(() => {
    if (!nip07Checked) return;
    // すでにログイン済みの場合は復元しない
    if (authState.isLoggedIn) return;

    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // NIP-07の場合は自動的に再接続を試みる
        if (parsed.isNip07 && isNip07Available && window.nostr) {
          // NIP-07で再ログイン
          window.nostr.getPublicKey().then((pubkey) => {
            const npub = pubkeyToNpub(pubkey);
            const newState: AuthState = {
              isLoggedIn: true,
              pubkey,
              npub,
              isNip07: true,
            };
            setAuthState(newState);
            // ストレージも更新して確実にisNip07: trueを保持
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newState));
          }).catch(() => {
            // NIP-07ログインに失敗した場合は通常ログインにフォールバック
            if (parsed.pubkey && parsed.npub) {
              setAuthState({
                isLoggedIn: true,
                pubkey: parsed.pubkey,
                npub: parsed.npub,
                isNip07: false,
              });
            }
          });
        } else if (parsed.isNip07 && !isNip07Available) {
          // NIP-07が保存されているが拡張がまだ利用できない場合は待つ
          // （このケースはisNip07Availableがtrueになった時に再実行される）
          return;
        } else if (parsed.pubkey && parsed.npub) {
          setAuthState({
            isLoggedIn: true,
            pubkey: parsed.pubkey,
            npub: parsed.npub,
            isNip07: false,
          });
        }
      } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }
  }, [nip07Checked, isNip07Available, authState.isLoggedIn]);

  // NIP-07でログイン
  const loginWithNip07 = useCallback(async () => {
    if (!window.nostr) {
      setError('NIP-07拡張機能が見つかりません');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const pubkey = await window.nostr.getPublicKey();
      const npub = pubkeyToNpub(pubkey);
      
      const newState: AuthState = {
        isLoggedIn: true,
        pubkey,
        npub,
        isNip07: true,
      };
      
      setAuthState(newState);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newState));
      
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // npubでログイン
  const loginWithNpub = useCallback((npubInput: string) => {
    setError(null);
    
    const trimmed = npubInput.trim();
    
    // npubの検証
    const pubkey = npubToPubkey(trimmed);
    if (!pubkey) {
      setError('無効なnpubです');
      return false;
    }

    const newState: AuthState = {
      isLoggedIn: true,
      pubkey,
      npub: trimmed,
      isNip07: false,
    };
    
    setAuthState(newState);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newState));
    
    return true;
  }, []);

  // ログアウト
  const logout = useCallback(() => {
    setAuthState({
      isLoggedIn: false,
      pubkey: null,
      npub: null,
      isNip07: false,
    });
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }, []);

  // NIP-07でイベントに署名
  const signEvent = useCallback(async (eventTemplate: EventTemplate): Promise<Event> => {
    if (!authState.isNip07 || !window.nostr) {
      throw new Error('NIP-07ログインが必要です');
    }
    
    return await window.nostr.signEvent(eventTemplate);
  }, [authState.isNip07]);

  // NIP-07からリレー設定を取得
  const getRelaysFromNip07 = useCallback(async (): Promise<RelayConfig[] | null> => {
    if (!window.nostr?.getRelays) {
      return null;
    }

    try {
      const relays = await window.nostr.getRelays();
      return Object.entries(relays).map(([url, config]) => ({
        url,
        read: config.read,
        write: config.write,
      }));
    } catch {
      return null;
    }
  }, []);

  return {
    authState,
    isLoading,
    error,
    isNip07Available,
    loginWithNip07,
    loginWithNpub,
    logout,
    signEvent,
    getRelaysFromNip07,
  };
}

