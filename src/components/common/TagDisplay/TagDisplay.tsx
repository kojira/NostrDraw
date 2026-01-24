// タグ表示コンポーネント
// 投稿に付与されたタグを表示し、クリックでフォロー/フィルター

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './TagDisplay.module.css';

interface TagDisplayProps {
  /** 表示するタグ */
  tags: string[];
  /** タグがクリックされたときのコールバック */
  onTagClick?: (tag: string) => void;
  /** フォロー中のタグ */
  followedTags?: string[];
  /** フォローボタンを表示するか */
  showFollowButton?: boolean;
  /** フォロー/アンフォローのコールバック */
  onFollowToggle?: (tag: string, isFollowed: boolean) => void;
  /** サイズ */
  size?: 'small' | 'medium' | 'large';
  /** 最大表示数（0で無制限） */
  maxDisplay?: number;
  /** コンパクト表示（アイコンなし） */
  compact?: boolean;
}

export function TagDisplay({
  tags,
  onTagClick,
  followedTags = [],
  showFollowButton = false,
  onFollowToggle,
  size = 'medium',
  maxDisplay = 0,
  compact = false,
}: TagDisplayProps) {
  const { t } = useTranslation();

  const handleTagClick = useCallback((tag: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onTagClick?.(tag);
  }, [onTagClick]);

  const handleFollowClick = useCallback((tag: string, isFollowed: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    onFollowToggle?.(tag, isFollowed);
  }, [onFollowToggle]);

  if (!tags || tags.length === 0) return null;

  const displayTags = maxDisplay > 0 ? tags.slice(0, maxDisplay) : tags;
  const hiddenCount = maxDisplay > 0 ? Math.max(0, tags.length - maxDisplay) : 0;

  return (
    <div className={`${styles.container} ${styles[size]} ${compact ? styles.compact : ''}`}>
      {!compact && <span className={styles.icon}>🏷️</span>}
      <div className={styles.tags}>
        {displayTags.map(tag => {
          const isFollowed = followedTags.includes(tag);
          return (
            <span
              key={tag}
              className={`${styles.tag} ${isFollowed ? styles.followed : ''} ${onTagClick ? styles.clickable : ''}`}
              onClick={onTagClick ? (e) => handleTagClick(tag, e) : undefined}
              title={onTagClick ? t('tags.clickToFilter', 'クリックでフィルター') : undefined}
            >
              {tag}
              {showFollowButton && onFollowToggle && (
                <button
                  type="button"
                  className={styles.followButton}
                  onClick={(e) => handleFollowClick(tag, isFollowed, e)}
                  title={isFollowed ? t('tags.unfollow', 'フォロー解除') : t('tags.follow', 'フォロー')}
                >
                  {isFollowed ? '✓' : '+'}
                </button>
              )}
            </span>
          );
        })}
        {hiddenCount > 0 && (
          <span className={styles.more}>
            +{hiddenCount}
          </span>
        )}
      </div>
    </div>
  );
}
