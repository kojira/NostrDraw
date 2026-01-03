/**
 * Button Component
 * 
 * マイクロインタラクション付きのボタンコンポーネント
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconSize } from '../Icon';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** ボタンのバリアント */
  variant?: ButtonVariant;
  /** ボタンのサイズ */
  size?: ButtonSize;
  /** 左アイコン (Material Symbols name) */
  leftIcon?: string;
  /** 右アイコン (Material Symbols name) */
  rightIcon?: string;
  /** ローディング状態 */
  isLoading?: boolean;
  /** 幅を100%にする */
  fullWidth?: boolean;
  /** 子要素 */
  children?: ReactNode;
}

/**
 * ボタンコンポーネント
 * 
 * @example
 * <Button>Default</Button>
 * <Button variant="primary">Primary</Button>
 * <Button variant="secondary" leftIcon="add">Add Item</Button>
 * <Button variant="ghost" size="sm">Small Ghost</Button>
 * <Button isLoading>Loading...</Button>
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      leftIcon,
      rightIcon,
      isLoading = false,
      fullWidth = false,
      disabled,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const iconSize: IconSize = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'md';

    return (
      <button
        ref={ref}
        className={`
          ${styles.button}
          ${styles[variant]}
          ${styles[size]}
          ${fullWidth ? styles.fullWidth : ''}
          ${isLoading ? styles.loading : ''}
          ${className}
        `}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <span className={styles.spinner}>
            <Icon name="progress_activity" size={iconSize} />
          </span>
        )}
        
        {!isLoading && leftIcon && (
          <Icon name={leftIcon} size={iconSize} className={styles.leftIcon} />
        )}
        
        {children && <span className={styles.label}>{children}</span>}
        
        {!isLoading && rightIcon && (
          <Icon name={rightIcon} size={iconSize} className={styles.rightIcon} />
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;

