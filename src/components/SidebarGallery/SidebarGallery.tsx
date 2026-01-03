// サイドバーギャラリーコンポーネント - 人気/新着の作品を表示

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { NewYearCard, NostrProfile } from '../../types';
import type { Event, EventTemplate } from 'nostr-tools';
import type { NewYearCardWithReactions } from '../../services/card';
import { fetchProfile, pubkeyToNpub } from '../../services/profile';
import { CardFlip } from '../CardViewer/CardFlip';
import { Spinner } from '../common/Spinner';
import styles from './SidebarGallery.module.css';

// SVGを安全にレンダリングするためのコンポーネント
function SvgRenderer({ svg, className }: { svg: string; className?: string }) {
  const hasExternalImage = svg.includes('<image') && svg.includes('href=');
  
  if (hasExternalImage) {
    return (
      <div 
        className={className}
        dangerouslySetInnerHTML={{ __html: svg }}
        style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
      />
    );
  }
  
  const encoded = btoa(unescape(encodeURIComponent(svg)));
  const dataUri = `data:image/svg+xml;base64,${encoded}`;
  return <img src={dataUri} alt="" className={className} />;
}

interface SidebarGalleryProps {
  type: 'popular' | 'recent';
  cards: (NewYearCard | NewYearCardWithReactions)[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onViewAll?: () => void;
  userPubkey?: string | null;
  signEvent?: (event: EventTemplate) => Promise<Event>;
  onExtend?: (card: NewYearCard) => void;
}

export function SidebarGallery({
  type,
  cards,
  isLoading,
  error,
  onRefresh,
  onViewAll,
  userPubkey,
  signEvent,
  onExtend,
}: SidebarGalleryProps) {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(new Map());
  const [selectedCard, setSelectedCard] = useState<NewYearCard | null>(null);
  const [senderProfile, setSenderProfile] = useState<NostrProfile | null>(null);

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

  const handleSelectCard = (card: NewYearCard) => {
    setSelectedCard(card);
  };

  const handleCloseCard = () => {
    setSelectedCard(null);
  };

  // 親子カードナビゲーション
  const handleNavigateToCard = (card: NewYearCard) => {
    setSelectedCard(card);
  };

  // リアクション数を取得（NewYearCardWithReactionsの場合）
  const getReactionCount = (card: NewYearCard | NewYearCardWithReactions): number | undefined => {
    if ('reactionCount' in card) {
      return card.reactionCount;
    }
    return undefined;
  };

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <div 
          className={`${styles.titleGroup} ${onViewAll ? styles.clickable : ''}`}
          onClick={onViewAll}
          role={onViewAll ? 'button' : undefined}
          tabIndex={onViewAll ? 0 : undefined}
        >
          <h3 className={styles.title}>{title}</h3>
          <span className={styles.subtitle}>{subtitle}</span>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className={styles.refreshButton}
          title={t('viewer.refresh')}
        >
          🔄
        </button>
      </div>

      <div className={styles.content}>
        {isLoading && (
          <div className={styles.loading}>
            <Spinner size="md" />
            <span>{t('card.loading')}</span>
          </div>
        )}

        {error && (
          <div className={styles.error}>{error}</div>
        )}

        {!isLoading && !error && cards.length === 0 && (
          <div className={styles.empty}>{t('viewer.noReceived')}</div>
        )}

        {!isLoading && !error && cards.length > 0 && (
          <div className={styles.list}>
            {cards.map((card) => {
              const picture = getProfilePicture(card.pubkey);
              const name = getProfileName(card.pubkey);
              const reactionCount = getReactionCount(card);

              return (
                <div
                  key={card.id}
                  className={styles.item}
                  onClick={() => handleSelectCard(card)}
                >
                  <div className={styles.thumbnail}>
                    {card.svg ? (
                      <SvgRenderer svg={card.svg} className={styles.thumbnailImage} />
                    ) : (
                      <span className={styles.placeholderEmoji}>🎨</span>
                    )}
                  </div>
                  <div className={styles.info}>
                    <div className={styles.author}>
                      {picture && (
                        <img src={picture} alt="" className={styles.avatar} />
                      )}
                      <span className={styles.name}>{name}</span>
                    </div>
                    {reactionCount !== undefined && reactionCount > 0 && (
                      <span className={styles.reactions}>❤️ {reactionCount}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
              onNavigateToCard={handleNavigateToCard}
            />
          </div>
        </div>
      )}
    </div>
  );
}

