// 共通カード表示コンポーネント
// Timeline.tsxのカード表示部分をそのまま抽出

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { NostrDrawPost, NostrProfile } from '../../../types';
import type { NostrDrawPostWithReactions } from '../../../services/card';
import { sendReaction, getCardFullSvg } from '../../../services/card';
import { pubkeyToNpub } from '../../../services/profile';
import { BASE_URL } from '../../../config';
import type { EventTemplate, Event } from 'nostr-tools';
import { Icon } from '../Icon';
import { Spinner } from '../Spinner';
import { TagDisplay } from '../TagDisplay';
import styles from './CardItem.module.css';

// SVGを安全にレンダリングするためのコンポーネント
// dangerouslySetInnerHTMLを使用してフォントを正しく表示
// ※ Timeline.tsxと完全に同じ実装
function SvgRenderer({ svg, className }: { svg: string; className?: string }) {
  return (
    <div 
      className={className}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export interface CardItemProps {
  card: NostrDrawPost | NostrDrawPostWithReactions;
  profile?: NostrProfile | null;
  userPubkey?: string | null;
  signEvent?: (event: EventTemplate) => Promise<Event>;
  onCardClick?: (card: NostrDrawPost) => void;
  onAuthorClick?: (pubkey: string) => void;
  onExtend?: (card: NostrDrawPost) => void;
  // タグ関連
  followedTags?: string[];
  onTagClick?: (tag: string) => void;
  onFollowTag?: (tag: string) => void;
  onUnfollowTag?: (tag: string) => void;
  // 合成済みSVG（差分カード用、外部で管理する場合）
  mergedSvg?: string;
  onMergedSvgLoaded?: (cardId: string, svg: string) => void;
}

export function CardItem({
  card,
  profile,
  userPubkey,
  signEvent,
  onCardClick,
  onAuthorClick,
  onExtend,
  followedTags = [],
  onTagClick,
  onFollowTag,
  onUnfollowTag,
  mergedSvg: externalMergedSvg,
  onMergedSvgLoaded,
}: CardItemProps) {
  const { t } = useTranslation();
  
  // 状態管理 - Timeline.tsxと同じ
  const [isReacting, setIsReacting] = useState(false);
  const [localReacted, setLocalReacted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mergedSvg, setMergedSvg] = useState<string | null>(externalMergedSvg || null);
  const fetchingRef = useRef(false);

  // プロフィール情報
  const getProfileName = (): string => {
    if (profile?.display_name) return profile.display_name;
    if (profile?.name) return profile.name;
    return pubkeyToNpub(card.pubkey).slice(0, 12) + '...';
  };

  const getProfilePicture = (): string | null => {
    return profile?.picture || null;
  };

  // リアクション数
  const getReactionCount = (): number => {
    if ('reactionCount' in card) return card.reactionCount;
    return 0;
  };

  // リアクション済み状態
  const getUserReacted = (): boolean => {
    if (localReacted) return true;
    if ('userReacted' in card && card.userReacted === true) return true;
    return false;
  };

  // 差分カードの完全なSVGを取得
  useEffect(() => {
    if (externalMergedSvg) {
      setMergedSvg(externalMergedSvg);
      return;
    }
    
    if (!card.isDiff || !card.parentEventId || fetchingRef.current || mergedSvg) return;
    
    fetchingRef.current = true;
    
    getCardFullSvg(card).then(fullSvg => {
      setMergedSvg(fullSvg);
      onMergedSvgLoaded?.(card.id, fullSvg);
    }).catch(error => {
      console.error('Failed to get full SVG:', error);
    });
  }, [card, externalMergedSvg, mergedSvg, onMergedSvgLoaded]);

  // リアクション送信 - Timeline.tsxと同じロジック
  const handleReaction = useCallback(async () => {
    if (!signEvent || !userPubkey) return;
    if (getUserReacted() || isReacting) return;
    
    setIsReacting(true);
    try {
      await sendReaction(card.id, card.pubkey, '❤️', signEvent);
      setLocalReacted(true);
    } catch (error) {
      console.error('リアクション送信エラー:', error);
    } finally {
      setIsReacting(false);
    }
  }, [signEvent, userPubkey, card.id, card.pubkey, isReacting]);

  // シェア - Timeline.tsxと同じロジック
  const handleShare = useCallback(async () => {
    const url = `${BASE_URL}/?eventid=${card.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('URLのコピーに失敗:', error);
    }
  }, [card.id]);

  // 日付フォーマット - Timeline.tsxと同じ
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  };

  // 著者クリック
  const handleAuthorClick = () => {
    onAuthorClick?.(card.pubkey);
  };

  const picture = getProfilePicture();
  const name = getProfileName();
  const reactionCount = getReactionCount();
  const userReacted = getUserReacted();

  // Timeline.tsxのカード表示部分をそのままコピー
  return (
    <div className={styles.post}>
      {/* ヘッダー（著者情報） */}
      <div 
        className={styles.postHeader}
        onClick={handleAuthorClick}
      >
        {picture ? (
          <img src={picture} alt="" className={styles.avatar} />
        ) : (
          <div className={styles.avatarPlaceholder}>
            <Icon name="person" size="md" />
          </div>
        )}
        <div className={styles.authorInfo}>
          <span className={styles.authorName}>{name}</span>
          <span className={styles.postTime}>{formatDate(card.createdAt)}</span>
        </div>
      </div>

      {/* 画像 */}
      <div 
        className={`${styles.postImage} ${onCardClick ? styles.clickable : ''}`}
        onClick={() => onCardClick?.(card)}
      >
        {(() => {
          // isDiffの場合は合成完了まで待機
          if (card.isDiff && card.parentEventId) {
            if (mergedSvg) {
              return <SvgRenderer svg={mergedSvg} className={styles.svg} />;
            }
            // 合成完了まではローディング表示
            return (
              <div className={styles.placeholder}>
                <Spinner size="md" />
              </div>
            );
          }
          // 通常のカード
          return card.svg ? (
            <SvgRenderer svg={card.svg} className={styles.svg} />
          ) : (
            <div className={styles.placeholder}>🎨</div>
          );
        })()}
      </div>

      {/* フッター（リアクション・描き足し） */}
      <div className={styles.postFooter}>
        <div className={styles.footerActions}>
          <button
            className={`${styles.reactionButton} ${userReacted ? styles.reacted : ''}`}
            onClick={handleReaction}
            disabled={!signEvent || !userPubkey || userReacted || isReacting}
            title={userReacted ? t('viewer.reacted') : t('viewer.reaction')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px', fontVariationSettings: (isReacting || userReacted) ? "'FILL' 1" : "'FILL' 0", color: '#e94560' }}>favorite</span> {reactionCount + (localReacted && !('userReacted' in card && card.userReacted) ? 1 : 0)}
          </button>
          <button
            className={`${styles.shareButton} ${copied ? styles.copied : ''}`}
            onClick={handleShare}
            title={t('timeline.share')}
          >
            {copied ? (
              <svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor">
                <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor">
                <path d="M720-80q-50 0-85-35t-35-85q0-7 1-14.5t3-13.5L322-392q-17 15-38 23.5t-44 8.5q-50 0-85-35t-35-85q0-50 35-85t85-35q23 0 44 8.5t38 23.5l282-164q-2-6-3-13.5t-1-14.5q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35q-23 0-44-8.5T602-672L320-508q2 6 3 13.5t1 14.5q0 7-1 14.5t-3 13.5l282 164q17-15 38-23.5t44-8.5q50 0 85 35t35 85q0 50-35 85t-85 35Z"/>
              </svg>
            )}
          </button>
          {card.allowExtend && onExtend && (
            <button
              className={styles.extendButton}
              onClick={() => onExtend(card)}
              title={t('viewer.extend')}
            >
              <svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor">
                <path d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 32.5-156t88-127Q256-817 330-848.5T488-880q80 0 151 27.5t124.5 76q53.5 48.5 85 115T880-518q0 115-70 176.5T640-280h-74q-9 0-12.5 5t-3.5 11q0 12 15 34.5t15 51.5q0 50-27.5 74T480-80Zm0-400Zm-220 40q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm120-160q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm200 0q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm120 160q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17ZM480-160q9 0 14.5-5t5.5-13q0-14-15-33t-15-57q0-42 29-67t71-25h70q66 0 113-38.5T800-518q0-121-92.5-201.5T488-800q-136 0-232 93t-96 227q0 133 93.5 226.5T480-160Z"/>
              </svg>
            </button>
          )}
        </div>
        {/* タグ表示 */}
        {card.tags && card.tags.length > 0 && (
          <div className={styles.cardTags}>
            <TagDisplay
              tags={card.tags}
              followedTags={followedTags}
              onTagClick={onTagClick}
              showFollowButton={!!onFollowTag && !!onUnfollowTag}
              onFollowToggle={(tag, isFollowed) => {
                if (isFollowed) {
                  onUnfollowTag?.(tag);
                } else {
                  onFollowTag?.(tag);
                }
              }}
              size="small"
              compact
            />
          </div>
        )}
        {card.message && (
          <span className={styles.message}>{card.message}</span>
        )}
      </div>
    </div>
  );
}
