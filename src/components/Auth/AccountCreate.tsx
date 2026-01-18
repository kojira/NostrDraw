/**
 * アカウント作成フォームコンポーネント
 * 決定論的nsec生成による入口用アカウント作成
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './AccountCreate.module.css';

// 絵文字カテゴリ
const EMOJI_CATEGORIES = [
  {
    name: '動物',
    emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦆', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐢', '🐍', '🦎', '🦖', '🐙', '🦑', '🦐', '🦀', '🐠', '🐬', '🐳', '🐋', '🦈', '🐊']
  },
  {
    name: '食べ物',
    emojis: ['🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🧄', '🧅', '🥔', '🍠', '🍞', '🥐', '🥖', '🍕', '🍔', '🍟', '🌭', '🥪', '🌮', '🌯', '🍿', '🧀', '🥚', '🍳', '🥞']
  },
  {
    name: '自然',
    emojis: ['🌸', '💮', '🏵️', '🌹', '🥀', '🌺', '🌻', '🌼', '🌷', '🌱', '🪴', '🌲', '🌳', '🌴', '🌵', '🌾', '🌿', '☘️', '🍀', '🍁', '🍂', '🍃', '🪹', '🪺', '🍄', '🌰', '⭐', '🌟', '✨', '⚡', '☀️', '🌙', '🌈', '☁️', '❄️', '💧', '🌊', '🔥', '💎', '🌍', '🌎', '🌏', '🪐', '🌌']
  },
  {
    name: '顔',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😋', '😛', '🤪', '😜', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥', '😌', '😔', '😪', '🤤', '😴']
  },
  {
    name: 'シンボル',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '⭐', '🌟', '✨', '💫', '🔥', '💯', '✅', '❌', '⭕', '❗', '❓', '💢', '💤', '💨', '💦', '🎵', '🎶', '🔔', '🔑', '🗝️', '🔮', '🧿', '📿', '🏆', '🥇', '🎯']
  },
  {
    name: 'その他',
    emojis: ['🎨', '🎭', '🎪', '🎠', '🎡', '🎢', '🚀', '🛸', '🎁', '🎀', '🎈', '🎉', '🎊', '🎋', '🎍', '🎎', '🎏', '🎐', '🧧', '🪭', '🪅', '🪆', '🎑', '🎃', '👻', '🎄', '🎅', '🦌', '⛄', '🎆', '🎇', '🧨', '✈️', '🚁', '⛵', '🚢', '🚗', '🏎️', '🚲', '🛴', '🏍️', '🚂', '🚃', '🚄']
  }
];

interface AccountCreateProps {
  isLoading: boolean;
  error: string | null;
  deriveProgress: number;
  onCreateAccount: (
    accountName: string,
    password: string,
    extraSecret: string
  ) => Promise<boolean>;
  onCancel: () => void;
}

export function AccountCreate({
  isLoading,
  error,
  deriveProgress,
  onCreateAccount,
  onCancel,
}: AccountCreateProps) {
  const { t } = useTranslation();
  const [accountName, setAccountName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [extraSecret, setExtraSecret] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(0);

  // 絵文字を追加
  const handleEmojiSelect = (emoji: string) => {
    setExtraSecret(prev => prev + emoji);
  };

  // 追加シークレットをクリア
  const handleClearExtraSecret = () => {
    setExtraSecret('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInputError(null);

    // バリデーション
    if (!accountName.trim()) {
      setInputError(t('auth.accountNameRequired'));
      return;
    }

    if (password.length < 8) {
      setInputError(t('auth.passwordMinLength'));
      return;
    }

    if (password !== passwordConfirm) {
      setInputError(t('auth.passwordMismatch'));
      return;
    }

    if (extraSecret.length < 4) {
      setInputError(t('auth.extraSecretMinLength'));
      return;
    }

    const success = await onCreateAccount(accountName.trim(), password, extraSecret);
    if (success) {
      // 成功時は親コンポーネントで処理
    }
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>{t('auth.createAccount')}</h2>
      
      <form onSubmit={handleSubmit} className={styles.form}>
        {/* アカウント名 */}
        <div className={styles.field}>
          <label htmlFor="accountName" className={styles.label}>
            {t('auth.accountName')}
          </label>
          <input
            id="accountName"
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder={t('auth.accountNamePlaceholder')}
            className={styles.input}
            disabled={isLoading}
            autoComplete="username"
          />
          <p className={styles.hint}>{t('auth.accountNameHint')}</p>
        </div>

        {/* パスワード */}
        <div className={styles.field}>
          <label htmlFor="password" className={styles.label}>
            {t('auth.password')}
          </label>
          <div className={styles.passwordWrapper}>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.passwordPlaceholder')}
              className={styles.input}
              disabled={isLoading}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className={styles.togglePassword}
              tabIndex={-1}
            >
              <span className="material-symbols-outlined">{showPassword ? 'visibility_off' : 'visibility'}</span>
            </button>
          </div>
          <p className={styles.hint}>{t('auth.passwordHint')}</p>
        </div>

        {/* パスワード確認 */}
        <div className={styles.field}>
          <label htmlFor="passwordConfirm" className={styles.label}>
            {t('auth.passwordConfirm')}
          </label>
          <input
            id="passwordConfirm"
            type={showPassword ? 'text' : 'password'}
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            placeholder={t('auth.passwordConfirmPlaceholder')}
            className={styles.input}
            disabled={isLoading}
            autoComplete="new-password"
          />
        </div>

        {/* 追加シークレット */}
        <div className={styles.field}>
          <label htmlFor="extraSecret" className={styles.label}>
            {t('auth.extraSecret')}
          </label>
          <div className={styles.extraSecretWrapper}>
            <div className={styles.extraSecretDisplay}>
              {extraSecret ? (
                <span className={styles.extraSecretText}>{extraSecret}</span>
              ) : (
                <span className={styles.extraSecretPlaceholder}>
                  {t('auth.extraSecretPlaceholder')}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={styles.emojiPickerButton}
              disabled={isLoading}
            >
              😀
            </button>
            {extraSecret && (
              <button
                type="button"
                onClick={handleClearExtraSecret}
                className={styles.clearButton}
                disabled={isLoading}
              >
                ✕
              </button>
            )}
          </div>
          <p className={styles.hint}>{t('auth.extraSecretHint')}</p>
          
          {/* 絵文字ピッカー */}
          {showEmojiPicker && (
            <div className={styles.emojiPicker}>
              <div className={styles.emojiCategories}>
                {EMOJI_CATEGORIES.map((category, index) => (
                  <button
                    key={category.name}
                    type="button"
                    className={`${styles.categoryButton} ${selectedCategory === index ? styles.active : ''}`}
                    onClick={() => setSelectedCategory(index)}
                  >
                    {category.emojis[0]}
                  </button>
                ))}
              </div>
              <div className={styles.emojiGrid}>
                {EMOJI_CATEGORIES[selectedCategory].emojis.map((emoji, index) => (
                  <button
                    key={`${emoji}-${index}`}
                    type="button"
                    className={styles.emojiButton}
                    onClick={() => handleEmojiSelect(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <p className={styles.emojiHint}>
                {t('auth.emojiHint', { count: extraSecret.length })}
              </p>
            </div>
          )}
        </div>

        {/* エラー表示 */}
        {(inputError || error) && (
          <p className={styles.error}>{inputError || error}</p>
        )}

        {/* 進捗表示 */}
        {isLoading && deriveProgress > 0 && (
          <div className={styles.progressWrapper}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${deriveProgress}%` }}
              />
            </div>
            <p className={styles.progressText}>
              {t('auth.deriving')} ({deriveProgress}%)
            </p>
          </div>
        )}

        {/* 注意事項 */}
        <div className={styles.warning}>
          <p>{t('auth.createAccountWarning')}</p>
        </div>

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
            disabled={isLoading}
          >
            {isLoading ? t('auth.creating') : t('auth.createAccount')}
          </button>
        </div>
      </form>
    </div>
  );
}
