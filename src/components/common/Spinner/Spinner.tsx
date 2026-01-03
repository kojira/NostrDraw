/**
 * Spinner Component
 * 
 * ローディングスピナーコンポーネント
 */

import styles from './Spinner.module.css';

export type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';

export interface SpinnerProps {
  /** スピナーのサイズ */
  size?: SpinnerSize;
  /** 色 (CSSカスタムプロパティ名) */
  color?: 'accent' | 'primary' | 'secondary' | 'inherit';
  /** カスタムクラス名 */
  className?: string;
  /** ラベル (スクリーンリーダー用) */
  label?: string;
}

/**
 * スピナーコンポーネント
 * 
 * @example
 * <Spinner />
 * <Spinner size="lg" />
 * <Spinner color="secondary" />
 */
export function Spinner({
  size = 'md',
  color = 'accent',
  className = '',
  label = '読み込み中',
}: SpinnerProps) {
  return (
    <div
      className={`${styles.spinner} ${styles[size]} ${styles[color]} ${className}`}
      role="status"
      aria-label={label}
    >
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle
          className={styles.track}
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          className={styles.arc}
          d="M12 2a10 10 0 0 1 10 10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <span className={styles.srOnly}>{label}</span>
    </div>
  );
}

export default Spinner;

