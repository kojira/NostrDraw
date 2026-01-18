// 認証コンポーネント

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthState } from '../../types';
import { AccountCreate } from './AccountCreate';
import { PasswordLogin } from './PasswordLogin';
import styles from './Auth.module.css';

type AuthView = 'main' | 'createAccount' | 'passwordLogin';

interface AuthProps {
  authState: AuthState;
  isNip07Available: boolean;
  isLoading: boolean;
  error: string | null;
  deriveProgress: number;
  hasStoredAccount: () => boolean;
  getStoredNpub: () => string | null;
  onLoginWithNip07: () => Promise<boolean>;
  onLoginWithNpub: (npub: string) => boolean;
  onLoginWithPassword: (password: string) => Promise<boolean>;
  onCreateAccount: (
    accountName: string,
    password: string,
    extraSecret: string
  ) => Promise<boolean>;
  onLogout: () => void;
  onDeleteAccount?: () => void;
}

export function Auth({
  authState,
  isNip07Available,
  isLoading,
  error,
  deriveProgress,
  hasStoredAccount,
  getStoredNpub,
  onLoginWithNip07,
  onLoginWithNpub,
  onLoginWithPassword,
  onCreateAccount,
  onLogout,
  onDeleteAccount,
}: AuthProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<AuthView>('main');
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

  const handleCreateAccount = async (
    accountName: string,
    password: string,
    extraSecret: string
  ) => {
    const success = await onCreateAccount(accountName, password, extraSecret);
    if (success) {
      setView('main');
    }
    return success;
  };

  const handlePasswordLogin = async (password: string) => {
    const success = await onLoginWithPassword(password);
    if (success) {
      setView('main');
    }
    return success;
  };

  // ログイン済み
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
          {authState.isNsecLogin && (
            <span className={styles.badge}>{t('auth.passwordLogin')}</span>
          )}
          {authState.isEntranceKey && (
            <span className={styles.entranceBadge}>{t('auth.entranceKey')}</span>
          )}
        </div>
        <button onClick={onLogout} className={styles.logoutButton}>
          {t('auth.logout')}
        </button>
      </div>
    );
  }

  // アカウント作成画面
  if (view === 'createAccount') {
    return (
      <AccountCreate
        isLoading={isLoading}
        error={error}
        deriveProgress={deriveProgress}
        onCreateAccount={handleCreateAccount}
        onCancel={() => setView('main')}
      />
    );
  }

  // パスワードログイン画面
  if (view === 'passwordLogin') {
    return (
      <PasswordLogin
        storedNpub={getStoredNpub()}
        isLoading={isLoading}
        error={error}
        onLogin={handlePasswordLogin}
        onCancel={() => setView('main')}
        onForgotPassword={onDeleteAccount ? () => {
          if (confirm(t('auth.deleteAccountConfirm'))) {
            onDeleteAccount();
            setView('main');
          }
        } : undefined}
      />
    );
  }

  // メイン画面
  const storedAccount = hasStoredAccount();

  return (
    <div className={styles.auth}>
      <h2 className={styles.title}>{t('auth.login')}</h2>
      
      {/* 保存されたアカウントがある場合 */}
      {storedAccount && (
        <>
          <div className={styles.section}>
            <button
              onClick={() => setView('passwordLogin')}
              disabled={isLoading}
              className={styles.nip07Button}
            >
              {t('auth.loginWithPassword')}
            </button>
            <p className={styles.hint}>
              {t('auth.savedAccountHint')} ({getStoredNpub()?.slice(0, 12)}...)
            </p>
          </div>

          <div className={styles.divider}>
            <span>or</span>
          </div>
        </>
      )}

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

      {/* アカウント作成 */}
      <div className={styles.section}>
        <button
          onClick={() => setView('createAccount')}
          disabled={isLoading}
          className={styles.createAccountButton}
        >
          {t('auth.createAccount')}
        </button>
        <p className={styles.hint}>{t('auth.createAccountHint')}</p>
      </div>

      <div className={styles.divider}>
        <span>or</span>
      </div>

      {/* npub入力（閲覧のみ） */}
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
