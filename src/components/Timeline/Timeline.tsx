// タイムラインコンポーネント - フォロー/グローバルタブ切り替え

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { NewYearCard, NostrProfile } from '../../types';
import type { Event, EventTemplate } from 'nostr-tools';
import type { NewYearCardWithReactions } from '../../services/card';
import { fetchProfile, pubkeyToNpub } from '../../services/profile';
import { CardFlip } from '../CardViewer/CardFlip';
import styles from './Timeline.module.css';

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

interface TimelineProps {
  followCards: (NewYearCard | NewYearCardWithReactions)[];
  globalCards: (NewYearCard | NewYearCardWithReactions)[];
  isLoadingFollow: boolean;
  isLoadingGlobal: boolean;
  errorFollow: string | null;
  errorGlobal: string | null;
  onRefreshFollow: () => void;
  onRefreshGlobal: () => void;
  userPubkey?: string | null;
  signEvent?: (event: EventTemplate) => Promise<Event>;
  onExtend?: (card: NewYearCard) => void;
  onUserClick?: (npub: string) => void;
  onCreatePost?: () => void;
}

type TabType = 'follow' | 'global';

export function Timeline({
  followCards,
  globalCards,
  isLoadingFollow,
  isLoadingGlobal,
  errorFollow,
  errorGlobal,
  onRefreshFollow,
  onRefreshGlobal,
  userPubkey,
  signEvent,
  onExtend,
  onUserClick,
  onCreatePost,
}: TimelineProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('global');
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(new Map());
  const [selectedCard, setSelectedCard] = useState<NewYearCard | null>(null);
  const [senderProfile, setSenderProfile] = useState<NostrProfile | null>(null);

  const cards = activeTab === 'follow' ? followCards : globalCards;
  const isLoading = activeTab === 'follow' ? isLoadingFollow : isLoadingGlobal;
  const error = activeTab === 'follow' ? errorFollow : errorGlobal;
  const onRefresh = activeTab === 'follow' ? onRefreshFollow : onRefreshGlobal;

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
    return pubkeyToNpub(pubkey).slice(0, 12) + '...';
  };

  const getProfilePicture = (pubkey: string) => {
    const profile = profiles.get(pubkey);
    return profile?.picture || null;
  };

  const handleCardClick = (card: NewYearCard) => {
    setSelectedCard(card);
  };

  const handleCloseModal = () => {
    setSelectedCard(null);
  };

  const handleAuthorClick = (pubkey: string) => {
    if (onUserClick) {
      const npub = pubkeyToNpub(pubkey);
      onUserClick(npub);
    }
  };

  const getReactionCount = (card: NewYearCard | NewYearCardWithReactions): number => {
    if ('reactionCount' in card) {
      return card.reactionCount;
    }
    return 0;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return t('timeline.justNow');
    if (hours < 24) return t('timeline.hoursAgo', { count: hours });
    if (days < 7) return t('timeline.daysAgo', { count: days });
    return date.toLocaleDateString();
  };

  return (
    <div className={styles.timeline}>
      {/* タブ切り替え */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'follow' ? styles.active : ''}`}
          onClick={() => setActiveTab('follow')}
          disabled={!userPubkey}
        >
          👥 {t('timeline.follow')}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'global' ? styles.active : ''}`}
          onClick={() => setActiveTab('global')}
        >
          🌐 {t('timeline.global')}
        </button>
        <button
          className={styles.refreshButton}
          onClick={onRefresh}
          disabled={isLoading}
        >
          🔄
        </button>
      </div>

      {/* ログイン促し（フォロータブでログインしていない場合） */}
      {activeTab === 'follow' && !userPubkey && (
        <div className={styles.loginPrompt}>
          <p>{t('timeline.loginToSeeFollow')}</p>
        </div>
      )}

      {/* ローディング */}
      {isLoading && (
        <div className={styles.loading}>
          <span className={styles.spinner}>⏳</span>
          {t('timeline.loading')}
        </div>
      )}

      {/* エラー */}
      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}

      {/* 投稿一覧 */}
      {!isLoading && !error && (
        <div className={styles.posts}>
          {cards.length === 0 ? (
            <div className={styles.empty}>
              <p>{activeTab === 'follow' ? t('timeline.noFollowPosts') : t('timeline.noPosts')}</p>
            </div>
          ) : (
            cards.map(card => {
              const picture = getProfilePicture(card.pubkey);
              const name = getProfileName(card.pubkey);
              const reactionCount = getReactionCount(card);

              return (
                <div key={card.id} className={styles.post}>
                  {/* ヘッダー（著者情報） */}
                  <div 
                    className={styles.postHeader}
                    onClick={() => handleAuthorClick(card.pubkey)}
                  >
                    {picture ? (
                      <img src={picture} alt="" className={styles.avatar} />
                    ) : (
                      <div className={styles.avatarPlaceholder}>👤</div>
                    )}
                    <div className={styles.authorInfo}>
                      <span className={styles.authorName}>{name}</span>
                      <span className={styles.postTime}>{formatDate(card.createdAt)}</span>
                    </div>
                  </div>

                  {/* 画像 */}
                  <div 
                    className={styles.postImage}
                    onClick={() => handleCardClick(card)}
                  >
                    {card.svg ? (
                      <SvgRenderer svg={card.svg} className={styles.svg} />
                    ) : (
                      <div className={styles.placeholder}>🎨</div>
                    )}
                  </div>

                  {/* フッター（リアクション） */}
                  <div className={styles.postFooter}>
                    <span className={styles.reactions}>
                      ❤️ {reactionCount}
                    </span>
                    {card.message && (
                      <span className={styles.message}>{card.message}</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* FABボタン */}
      {onCreatePost && (
        <button 
          className={styles.fab}
          onClick={onCreatePost}
          title={t('timeline.createPost')}
        >
          ✏️
        </button>
      )}

      {/* カード詳細モーダル */}
      {selectedCard && (
        <div className={styles.modal} onClick={handleCloseModal}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <CardFlip
              card={selectedCard}
              senderProfile={senderProfile}
              onClose={handleCloseModal}
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

