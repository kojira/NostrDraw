// 認証コンポーネント

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthState } from '../../types';
import styles from './Auth.module.css';

interface AuthProps {
  authState: AuthState;
  isNip07Available: boolean;
  isLoading: boolean;
  error: string | null;
  onLoginWithNip07: () => Promise<boolean>;
  onLoginWithNpub: (npub: string) => boolean;
  onLogout: () => void;
}

export function Auth({
  authState,
  isNip07Available,
  isLoading,
  error,
  onLoginWithNip07,
  onLoginWithNpub,
  onLogout,
}: AuthProps) {
  const { t } = useTranslation();
  const [npubInput, setNpubInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  const handleNpubSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setInputError(null);
    
    if (!npubInput.trim()) {
      setInputError('npubを入力してください');
      return;
    }
    
    if (!npubInput.startsWith('npub1')) {
      setInputError('npubはnpub1で始まる必要があります');
      return;
    }
    
    const success = onLoginWithNpub(npubInput);
    if (!success) {
      setInputError('無効なnpubです');
    }
  };

  if (authState.isLoggedIn) {
    return (
      <div className={styles.loggedIn}>
        <div className={styles.userInfo}>
          <span className={styles.label}>{t('auth.login')}:</span>
          <span className={styles.npub} title={authState.npub || ''}>
            {authState.npub?.slice(0, 12)}...{authState.npub?.slice(-8)}
          </span>
          {authState.isNip07 && (
            <span className={styles.badge}>NIP-07</span>
          )}
        </div>
        <button onClick={onLogout} className={styles.logoutButton}>
          {t('auth.logout')}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.auth}>
      <h2 className={styles.title}>{t('auth.login')}</h2>
      
      {/* NIP-07ログイン */}
      <div className={styles.section}>
        <button
          onClick={onLoginWithNip07}
          disabled={!isNip07Available || isLoading}
          className={styles.nip07Button}
        >
          {isLoading ? '...' : t('auth.loginWithNip07')}
        </button>
        {!isNip07Available && (
          <p className={styles.hint}>
            NIP-07 extension not installed (nos2x, Alby, etc.)
          </p>
        )}
      </div>

      <div className={styles.divider}>
        <span>or</span>
      </div>

      {/* npub入力 */}
      <form onSubmit={handleNpubSubmit} className={styles.section}>
        <label htmlFor="npub-input" className={styles.label}>
          {t('auth.loginWithNpub')} {t('auth.npubHint')}
        </label>
        <div className={styles.inputGroup}>
          <input
            id="npub-input"
            type="text"
            value={npubInput}
            onChange={(e) => setNpubInput(e.target.value)}
            placeholder={t('auth.npubPlaceholder')}
            className={styles.input}
          />
          <button type="submit" className={styles.submitButton}>
            {t('auth.login')}
          </button>
        </div>
        {(error || inputError) && (
          <p className={styles.error}>{inputError || error}</p>
        )}
      </form>
    </div>
  );
}

