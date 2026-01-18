/**
 * 共通カードサムネイルコンポーネント
 * Timeline, SidebarGallery, MobileCarouselなど様々な場所で使用
 * diffマージ処理も内部で行う
 */

import { memo, useState, useEffect, useRef } from 'react';
import type { NostrDrawPost } from '../../../types';
import type { NostrDrawPostWithReactions } from '../../../services/card';
import { getCardFullSvg } from '../../../services/card';
import styles from './CardThumbnail.module.css';

// SVGを安全にレンダリングするためのコンポーネント
const SvgRenderer = memo(function SvgRenderer({ svg, className }: { svg: string; className?: string }) {
  const hasExternalImage = svg.includes('<image') && svg.includes('href=');
  
  if (hasExternalImage) {
    return (
      <div 
        className={className}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }
  
  const encoded = btoa(unescape(encodeURIComponent(svg)));
  const dataUri = `data:image/svg+xml;base64,${encoded}`;
  return <img src={dataUri} alt="" className={className} />;
});

export interface CardThumbnailProps {
  /** サムネイルサイズ */
  size: 'small' | 'medium' | 'large';
  /** カードデータ */
  card: NostrDrawPost | NostrDrawPostWithReactions;
  /** 著者名 */
  authorName: string;
  /** 著者アバターURL */
  authorAvatar?: string | null;
  /** リアクション数 */
  reactionCount?: number;
  /** 投稿日時（タイムスタンプ） */
  createdAt?: number;
  /** 日付フォーマット関数 */
  formatDate?: (timestamp: number) => string;
  /** クリックハンドラ */
  onClick?: () => void;
  /** 著者クリックハンドラ */
  onAuthorClick?: () => void;
}

// マージ済みSVGのグローバルキャッシュ（コンポーネント間で共有）
const mergedSvgCache = new Map<string, string>();
const fetchingSet = new Set<string>();

export const CardThumbnail = memo(function CardThumbnail({
  size,
  card,
  authorName,
  authorAvatar,
  reactionCount,
  createdAt,
  formatDate,
  onClick,
  onAuthorClick,
}: CardThumbnailProps) {
  const sizeClass = styles[size];
  const [mergedSvg, setMergedSvg] = useState<string | null>(
    mergedSvgCache.get(card.id) || null
  );
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  // diff投稿の場合、完全なSVGを取得
  useEffect(() => {
    mountedRef.current = true;
    
    // isDiffでない、または親がない場合はスキップ
    if (!card.isDiff || !card.parentEventId) return;
    
    // キャッシュにあればそれを使用
    if (mergedSvgCache.has(card.id)) {
      setMergedSvg(mergedSvgCache.get(card.id)!);
      return;
    }
    
    // 既に取得中ならスキップ
    if (fetchingSet.has(card.id)) {
      setIsLoading(true);
      return;
    }
    
    fetchingSet.add(card.id);
    setIsLoading(true);
    
    (async () => {
      try {
        const fullSvg = await getCardFullSvg(card);
        if (fullSvg) {
          mergedSvgCache.set(card.id, fullSvg);
          if (mountedRef.current) {
            setMergedSvg(fullSvg);
          }
        }
      } catch (error) {
        console.error('Failed to get full SVG:', error);
      } finally {
        fetchingSet.delete(card.id);
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    })();
    
    return () => {
      mountedRef.current = false;
    };
  }, [card.id, card.isDiff, card.parentEventId]);

  // 表示するSVGを決定
  const displaySvg = card.isDiff && card.parentEventId ? mergedSvg : card.svg;

  const handleAuthorClick = (e: React.MouseEvent) => {
    if (onAuthorClick) {
      e.stopPropagation();
      onAuthorClick();
    }
  };

  return (
    <div 
      className={`${styles.card} ${sizeClass}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* サムネイル */}
      <div className={styles.thumbnail}>
        {isLoading ? (
          <div className={styles.loading}>
            <span className="material-symbols-outlined">hourglass_empty</span>
          </div>
        ) : displaySvg ? (
          <SvgRenderer svg={displaySvg} className={styles.thumbnailImage} />
        ) : (
          <span className={styles.placeholder}>🎨</span>
        )}
      </div>

      {/* 情報エリア */}
      <div className={styles.info}>
        {/* 著者情報 */}
        <div 
          className={styles.author}
          onClick={handleAuthorClick}
          role={onAuthorClick ? 'button' : undefined}
        >
          {authorAvatar ? (
            <img src={authorAvatar} alt="" className={styles.avatar} />
          ) : (
            <div className={styles.avatarPlaceholder}>
              <span className="material-symbols-outlined">person</span>
            </div>
          )}
          <span className={styles.authorName}>{authorName}</span>
        </div>

        {/* メタ情報（リアクション数、日付） */}
        <div className={styles.meta}>
          {reactionCount !== undefined && reactionCount > 0 && (
            <span className={styles.reactions}>
              <span 
                className="material-symbols-outlined" 
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                favorite
              </span>
              <span>{reactionCount}</span>
            </span>
          )}
          {createdAt && formatDate && (
            <span className={styles.date}>{formatDate(createdAt)}</span>
          )}
        </div>
      </div>
    </div>
  );
});
