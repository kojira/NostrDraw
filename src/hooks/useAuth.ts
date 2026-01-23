// 認証状態管理フック

import { useState, useCallback, useEffect, useRef } from 'react';
import { type Event, type EventTemplate, finalizeEvent } from 'nostr-tools';
import type { AuthState, RelayConfig } from '../types';
import { npubToPubkey, pubkeyToNpub } from '../services/profile';
import { deriveNsec, derivePublicKeyFromNsec, nsecToSecretKey, type DeriveProgressCallback } from '../services/keyDerivation';
import {
  saveEncryptedNsec,
  loadDecryptedNsec,
  hasStoredAccount,
  getStoredNpub,
  clearStoredNsec,
  isStoredEntranceKey,
} from '../services/keyStorage';

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
const SESSION_PASSWORD_KEY = 'nostr-nenga-session-pw';
const SESSION_EXPIRY_DAYS = 3; // パスワード保持期間（日）

// 有効期限付きでパスワードを取得
function getStoredPassword(): string | null {
  if (typeof window === 'undefined') return null;
  
  const stored = localStorage.getItem(SESSION_PASSWORD_KEY);
  if (!stored) return null;
  
  try {
    const { password, expiry } = JSON.parse(stored);
    if (Date.now() > expiry) {
      // 有効期限切れ
      localStorage.removeItem(SESSION_PASSWORD_KEY);
      return null;
    }
    return password;
  } catch {
    localStorage.removeItem(SESSION_PASSWORD_KEY);
    return null;
  }
}

// 有効期限付きでパスワードを保存
function storePassword(password: string): void {
  const expiry = Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  localStorage.setItem(SESSION_PASSWORD_KEY, JSON.stringify({ password, expiry }));
}

// パスワードを削除
function clearStoredPassword(): void {
  localStorage.removeItem(SESSION_PASSWORD_KEY);
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    isLoggedIn: false,
    pubkey: null,
    npub: null,
    isNip07: false,
    isNsecLogin: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNip07Available, setIsNip07Available] = useState(false);
  const [nip07Checked, setNip07Checked] = useState(false);
  const [deriveProgress, setDeriveProgress] = useState(0);

  // パスワードをメモリに保持（localStorageから復元）
  const passwordRef = useRef<string | null>(getStoredPassword());

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
              isNsecLogin: false,
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
                isNsecLogin: false,
              });
            }
          });
        } else if (parsed.isNip07 && !isNip07Available) {
          // NIP-07が保存されているが拡張がまだ利用できない場合は待つ
          // （このケースはisNip07Availableがtrueになった時に再実行される）
          return;
        } else if (parsed.pubkey && parsed.npub) {
          // nsecログインの場合、セッションストレージにパスワードがあれば再認証不要
          const hasSessionPassword = passwordRef.current !== null;
          const needsReauth = (parsed.isNsecLogin || false) && !hasSessionPassword;
          
          // 再認証が必要な場合はログアウト状態にする（UIの一貫性のため）
          if (needsReauth) {
            setAuthState({
              isLoggedIn: false,
              pubkey: parsed.pubkey, // 再ログイン用に保持
              npub: parsed.npub,
              isNip07: false,
              isNsecLogin: parsed.isNsecLogin || false,
              isEntranceKey: parsed.isEntranceKey,
              needsReauth: true,
            });
          } else {
            setAuthState({
              isLoggedIn: true,
              pubkey: parsed.pubkey,
              npub: parsed.npub,
              isNip07: false,
              isNsecLogin: parsed.isNsecLogin || false,
              isEntranceKey: parsed.isEntranceKey,
              needsReauth: false,
            });
          }
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
        isNsecLogin: false,
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

  // npubでログイン（閲覧のみ）
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
      isNsecLogin: false,
    };
    
    setAuthState(newState);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newState));
    
    return true;
  }, []);

  // アカウント作成（決定論的nsec生成）
  const createAccount = useCallback(async (
    accountName: string,
    password: string,
    extraSecret: string,
    onProgress?: DeriveProgressCallback
  ): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    setDeriveProgress(0);

    try {
      // 進捗コールバックをラップ
      const progressCallback = (progress: number) => {
        setDeriveProgress(progress);
        onProgress?.(progress);
      };

      // nsecを生成
      const nsec = await deriveNsec(accountName, password, extraSecret, progressCallback);
      
      // 公開鍵を導出
      const { pubkey, npub } = derivePublicKeyFromNsec(nsec);

      // nsecを暗号化して保存
      await saveEncryptedNsec(nsec, password, npub, true);

      // パスワードを保持（3日間有効）
      passwordRef.current = password;
      storePassword(password);

      // 認証状態を更新
      const newState: AuthState = {
        isLoggedIn: true,
        pubkey,
        npub,
        isNip07: false,
        isNsecLogin: true,
        isEntranceKey: true,
        needsReauth: false, // 新規作成時は再認証不要
        needsProfileSetup: true, // プロフィール設定が必要
      };

      setAuthState(newState);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newState));

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'アカウント作成に失敗しました');
      return false;
    } finally {
      setIsLoading(false);
      setDeriveProgress(0);
    }
  }, []);

  // パスワードでログイン（保存されたnsecを復号）
  const loginWithPassword = useCallback(async (password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      // 保存されたnsecを復号
      const result = await loadDecryptedNsec(password);
      
      if (!result) {
        setError('パスワードが間違っているか、保存されたアカウントがありません');
        return false;
      }

      const { nsec, npub, isEntranceKey } = result;

      // 公開鍵を確認
      const { pubkey } = derivePublicKeyFromNsec(nsec);

      // パスワードを保持（3日間有効）
      passwordRef.current = password;
      storePassword(password);

      // 認証状態を更新（再認証完了）
      const newState: AuthState = {
        isLoggedIn: true,
        pubkey,
        npub,
        isNip07: false,
        isNsecLogin: true,
        isEntranceKey,
        needsReauth: false, // 再認証完了
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

  // ログアウト
  const logout = useCallback(() => {
    // パスワードをクリア
    passwordRef.current = null;
    clearStoredPassword();

    setAuthState({
      isLoggedIn: false,
      pubkey: null,
      npub: null,
      isNip07: false,
      isNsecLogin: false,
    });
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }, []);

  // アカウント削除（nsecも削除）
  const deleteAccount = useCallback(() => {
    passwordRef.current = null;
    clearStoredPassword();
    clearStoredNsec();
    setAuthState({
      isLoggedIn: false,
      pubkey: null,
      npub: null,
      isNip07: false,
      isNsecLogin: false,
    });
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }, []);

  // イベントに署名
  const signEvent = useCallback(async (eventTemplate: EventTemplate): Promise<Event> => {
    // NIP-07の場合
    if (authState.isNip07 && window.nostr) {
      return await window.nostr.signEvent(eventTemplate);
    }
    
    // パスワードログインの場合：署名時にのみnsecを復号
    if (authState.isNsecLogin && passwordRef.current) {
      const result = await loadDecryptedNsec(passwordRef.current);
      if (!result) {
        throw new Error('nsecの復号に失敗しました');
      }
      // nsecを使って署名し、スコープを抜けると自動的に破棄される
      const secretKey = nsecToSecretKey(result.nsec);
      return finalizeEvent(eventTemplate, secretKey);
    }

    throw new Error('署名するには NIP-07 またはパスワードログインが必要です');
  }, [authState.isNip07, authState.isNsecLogin]);

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

  // 署名可能かどうか（再認証が必要な場合は署名不可）
  const canSign = authState.isLoggedIn && (authState.isNip07 || (authState.isNsecLogin && !authState.needsReauth));

  // プロフィール設定完了
  const completeProfileSetup = useCallback(() => {
    const newState: AuthState = {
      ...authState,
      needsProfileSetup: false,
    };
    setAuthState(newState);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newState));
  }, [authState]);

  return {
    authState,
    isLoading,
    error,
    isNip07Available,
    deriveProgress,
    canSign,
    loginWithNip07,
    loginWithNpub,
    createAccount,
    loginWithPassword,
    logout,
    deleteAccount,
    signEvent,
    getRelaysFromNip07,
    completeProfileSetup,
    // ユーティリティ
    hasStoredAccount,
    getStoredNpub,
    isStoredEntranceKey,
  };
}
