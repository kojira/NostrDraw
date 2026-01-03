/**
 * Skeleton Component
 * 
 * ローディング中のプレースホルダーコンポーネント
 */

import styles from './Skeleton.module.css';

export type SkeletonVariant = 'text' | 'circular' | 'rectangular' | 'rounded';

export interface SkeletonProps {
  /** スケルトンの形状 */
  variant?: SkeletonVariant;
  /** 幅 (CSS値) */
  width?: string | number;
  /** 高さ (CSS値) */
  height?: string | number;
  /** アニメーションを無効化 */
  animation?: boolean;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * スケルトンコンポーネント
 * 
 * @example
 * <Skeleton variant="text" />
 * <Skeleton variant="circular" width={40} height={40} />
 * <Skeleton variant="rectangular" width="100%" height={200} />
 * <Skeleton variant="rounded" width={300} height={100} />
 */
export function Skeleton({
  variant = 'text',
  width,
  height,
  animation = true,
  className = '',
}: SkeletonProps) {
  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  return (
    <div
      className={`
        ${styles.skeleton}
        ${styles[variant]}
        ${animation ? styles.animate : ''}
        ${className}
      `}
      style={style}
      aria-hidden="true"
    />
  );
}

export default Skeleton;

