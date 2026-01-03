/**
 * IconButton Component
 * 
 * アイコンのみのボタンコンポーネント
 */

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Icon, type IconSize } from '../Icon';
import styles from './IconButton.module.css';

export type IconButtonVariant = 'default' | 'ghost' | 'danger';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Material Symbols のアイコン名 */
  icon: string;
  /** ボタンのバリアント */
  variant?: IconButtonVariant;
  /** ボタンのサイズ */
  size?: IconButtonSize;
  /** アイコンを塗りつぶすか */
  filled?: boolean;
  /** ローディング状態 */
  isLoading?: boolean;
  /** アクセシビリティ用のラベル (必須) */
  'aria-label': string;
}

/**
 * アイコンボタンコンポーネント
 * 
 * @example
 * <IconButton icon="close" aria-label="閉じる" />
 * <IconButton icon="favorite" variant="ghost" aria-label="いいね" />
 * <IconButton icon="delete" variant="danger" aria-label="削除" />
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon,
      variant = 'default',
      size = 'md',
      filled = false,
      isLoading = false,
      disabled,
      className = '',
      ...props
    },
    ref
  ) => {
    const iconSize: IconSize = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'md';

    return (
      <button
        ref={ref}
        className={`
          ${styles.iconButton}
          ${styles[variant]}
          ${styles[size]}
          ${isLoading ? styles.loading : ''}
          ${className}
        `}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <Icon name="progress_activity" size={iconSize} className={styles.spinner} />
        ) : (
          <Icon name={icon} size={iconSize} filled={filled} />
        )}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';

export default IconButton;

