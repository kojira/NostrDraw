/**
 * パスワードログインフォームコンポーネント
 * 保存されたnsecをパスワードで復号してログイン
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './PasswordLogin.module.css';

interface PasswordLoginProps {
  storedNpub: string | null;
  isLoading: boolean;
  error: string | null;
  onLogin: (password: string) => Promise<boolean>;
  onCancel: () => void;
  onForgotPassword?: () => void;
}

export function PasswordLogin({
  storedNpub,
  isLoading,
  error,
  onLogin,
  onCancel,
  onForgotPassword,
}: PasswordLoginProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInputError(null);

    if (!password) {
      setInputError(t('auth.passwordRequired'));
      return;
    }

    const success = await onLogin(password);
    if (!success) {
      // エラーは親コンポーネントから伝播
    }
  };

  // npubを短縮表示
  const shortenNpub = (npub: string) => {
    if (npub.length <= 20) return npub;
    return `${npub.slice(0, 10)}...${npub.slice(-8)}`;
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>{t('auth.loginWithPassword')}</h2>
      
      {/* 保存されているアカウント情報 */}
      {storedNpub && (
        <div className={styles.accountInfo}>
          <span className={styles.accountLabel}>{t('auth.savedAccount')}:</span>
          <span className={styles.npub}>{shortenNpub(storedNpub)}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        {/* パスワード */}
        <div className={styles.field}>
          <label htmlFor="loginPassword" className={styles.label}>
            {t('auth.password')}
          </label>
          <div className={styles.passwordWrapper}>
            <input
              id="loginPassword"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.passwordPlaceholder')}
              className={styles.input}
              disabled={isLoading}
              autoComplete="current-password"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className={styles.togglePassword}
              tabIndex={-1}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
        </div>

        {/* エラー表示 */}
        {(inputError || error) && (
          <p className={styles.error}>{inputError || error}</p>
        )}

        {/* ボタン */}
        <div className={styles.actions}>
          <button
            type="button"
            onClick={onCancel}
            className={styles.cancelButton}
            disabled={isLoading}
          >
            {t('auth.cancel')}
          </button>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={isLoading || !password}
          >
            {isLoading ? t('auth.loggingIn') : t('auth.login')}
          </button>
        </div>

        {/* パスワードを忘れた場合 */}
        {onForgotPassword && (
          <button
            type="button"
            onClick={onForgotPassword}
            className={styles.forgotPassword}
            disabled={isLoading}
          >
            {t('auth.forgotPassword')}
          </button>
        )}
      </form>
    </div>
  );
}
