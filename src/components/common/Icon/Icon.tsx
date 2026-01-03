/**
 * Icon Component
 * 
 * Material Symbols アイコンのラッパーコンポーネント
 * https://fonts.google.com/icons
 */

import styles from './Icon.module.css';

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface IconProps {
  /** Material Symbols のアイコン名 (例: 'home', 'settings', 'favorite') */
  name: string;
  /** アイコンサイズ */
  size?: IconSize;
  /** 塗りつぶしスタイル (0: outlined, 1: filled) */
  filled?: boolean;
  /** カスタムクラス名 */
  className?: string;
  /** aria-label */
  'aria-label'?: string;
  /** aria-hidden */
  'aria-hidden'?: boolean;
}

/**
 * Material Symbols アイコンコンポーネント
 * 
 * @example
 * <Icon name="home" />
 * <Icon name="favorite" size="lg" filled />
 * <Icon name="settings" size="sm" />
 */
export function Icon({
  name,
  size = 'md',
  filled = false,
  className = '',
  'aria-label': ariaLabel,
  'aria-hidden': ariaHidden = true,
}: IconProps) {
  const sizeClass = styles[`size-${size}`];
  const fillClass = filled ? styles.filled : '';

  return (
    <span
      className={`material-symbols-outlined ${styles.icon} ${sizeClass} ${fillClass} ${className}`}
      aria-label={ariaLabel}
      aria-hidden={ariaHidden}
      role={ariaLabel ? 'img' : undefined}
    >
      {name}
    </span>
  );
}

export default Icon;

