// モバイル向けカルーセルコンポーネント - 横スワイプで作品を閲覧

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { NostrDrawPost, NostrProfile } from '../../types';
import type { Event, EventTemplate } from 'nostr-tools';
import type { NostrDrawPostWithReactions } from '../../services/card';
import { fetchProfile, pubkeyToNpub } from '../../services/profile';
import { CardFlip } from '../CardViewer/CardFlip';
import { Spinner } from '../common/Spinner';
import { CardThumbnail } from '../common/CardThumbnail';
import styles from './MobileCarousel.module.css';

interface MobileCarouselProps {
  type: 'popular' | 'recent';
  cards: (NostrDrawPost | NostrDrawPostWithReactions)[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onViewAll?: () => void;
  userPubkey?: string | null;
  signEvent?: (event: EventTemplate) => Promise<Event>;
  onExtend?: (card: NostrDrawPost) => void;
}

export function MobileCarousel({
  type,
  cards,
  isLoading,
  error,
  onRefresh,
  onViewAll,
  userPubkey,
  signEvent,
  onExtend,
}: MobileCarouselProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(new Map());
  const [selectedCard, setSelectedCard] = useState<NostrDrawPost | null>(null);
  const [senderProfile, setSenderProfile] = useState<NostrProfile | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const title = type === 'popular' ? t('sidebar.popular') : t('sidebar.recent');
  const subtitle = type === 'popular' ? t('sidebar.popularSub') : t('sidebar.recentSub');

  // プロフィールを取得
  useEffect(() => {
    const pubkeysToFetch = new Set<string>();
    cards.forEach(card => {
      pubkeysToFetch.add(card.pubkey);
    });

    pubkeysToFetch.forEach(async (pubkey) => {
      if (!profiles.has(pubkey)) {
        const profile = await fetchProfile(pubkey);
        if (profile) {
          setProfiles(prev => new Map(prev).set(pubkey, profile));
        }
      }
    });
  }, [cards]);

  // スクロール位置を監視してインデックスを更新
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      const itemWidth = container.firstElementChild?.clientWidth || 150;
      const newIndex = Math.round(scrollLeft / (itemWidth + 12)); // 12 = gap
      setCurrentIndex(Math.min(newIndex, cards.length - 1));
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [cards.length]);

  // 選択されたカードの送信者プロフィールを取得
  useEffect(() => {
    if (!selectedCard) {
      setSenderProfile(null);
      return;
    }

    const loadProfile = async () => {
      const sender = await fetchProfile(selectedCard.pubkey);
      setSenderProfile(sender);
    };

    loadProfile();
  }, [selectedCard]);

  const getProfileName = (pubkey: string) => {
    const profile = profiles.get(pubkey);
    if (profile?.display_name) return profile.display_name;
    if (profile?.name) return profile.name;
    return pubkeyToNpub(pubkey).slice(0, 8) + '...';
  };

  const getProfilePicture = (pubkey: string) => {
    return profiles.get(pubkey)?.picture;
  };

  const handleSelectCard = (card: NostrDrawPost) => {
    setSelectedCard(card);
  };

  const handleCloseCard = () => {
    setSelectedCard(null);
  };

  // リアクション数を取得
  const getReactionCount = (card: NostrDrawPost | NostrDrawPostWithReactions): number | undefined => {
    if ('reactionCount' in card) {
      return card.reactionCount;
    }
    return undefined;
  };

  if (cards.length === 0 && !isLoading && !error) {
    return null;
  }

  return (
    <div className={styles.carousel}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <h3 className={styles.title}>{title}</h3>
          <span className={styles.subtitle}>{subtitle}</span>
        </div>
        <div className={styles.actions}>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className={styles.refreshButton}
            title={t('viewer.refresh')}
          >
            🔄
          </button>
          {onViewAll && (
            <button onClick={onViewAll} className={styles.viewAllButton}>
              {t('gallery.viewAll')} →
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className={styles.loading}>
          <Spinner size="md" />
          <span>{t('card.loading')}</span>
        </div>
      )}

      {error && (
        <div className={styles.error}>{error}</div>
      )}

      {!isLoading && !error && cards.length > 0 && (
        <>
          <div className={styles.scrollContainer} ref={scrollRef}>
            {cards.map((card) => {
              const picture = getProfilePicture(card.pubkey);
              const name = getProfileName(card.pubkey);
              const reactionCount = getReactionCount(card);

              return (
                <div key={card.id} className={styles.itemWrapper}>
                  <CardThumbnail
                    size="small"
                    card={card}
                    authorName={name}
                    authorAvatar={picture}
                    reactionCount={reactionCount}
                    onClick={() => handleSelectCard(card)}
                  />
                </div>
              );
            })}
          </div>

          {/* インジケーター */}
          {cards.length > 1 && (
            <div className={styles.indicators}>
              {cards.map((_, index) => (
                <span
                  key={index}
                  className={`${styles.indicator} ${index === currentIndex ? styles.active : ''}`}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* カード詳細モーダル */}
      {selectedCard && (
        <div className={styles.modal} onClick={handleCloseCard}>
          <div onClick={(e) => e.stopPropagation()}>
            <CardFlip
              card={selectedCard}
              senderProfile={senderProfile}
              recipientProfile={null}
              onClose={handleCloseCard}
              userPubkey={userPubkey}
              signEvent={signEvent}
              onExtend={onExtend}
            />
          </div>
        </div>
      )}
    </div>
  );
}
