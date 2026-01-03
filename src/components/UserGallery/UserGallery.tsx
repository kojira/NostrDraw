// ユーザーギャラリーページ - 特定ユーザーの公開投稿一覧

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { NewYearCard, NostrProfile } from '../../types';
import type { Event, EventTemplate } from 'nostr-tools';
import { fetchCardsByAuthor, sendReaction, hasUserReacted, fetchReactionCounts } from '../../services/card';
import { fetchProfile, npubToPubkey, pubkeyToNpub } from '../../services/profile';
import { CardFlip } from '../CardViewer/CardFlip';
import styles from './UserGallery.module.css';

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

interface UserGalleryProps {
  npub: string;
  userPubkey?: string | null;
  signEvent?: (event: EventTemplate) => Promise<Event>;
  onExtend?: (card: NewYearCard) => void;
  onBack: () => void;
}

// npubコピー状態
type CopyState = 'idle' | 'copied';

export function UserGallery({
  npub,
  userPubkey,
  signEvent,
  onExtend,
  onBack,
}: UserGalleryProps) {
  const { t } = useTranslation();
  const [cards, setCards] = useState<NewYearCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<NostrProfile | null>(null);
  const [selectedCard, setSelectedCard] = useState<NewYearCard | null>(null);
  const [senderProfile, setSenderProfile] = useState<NostrProfile | null>(null);
  const [limit, setLimit] = useState(20);
  
  // リアクション状態を管理
  const [userReactions, setUserReactions] = useState<Set<string>>(new Set());
  const [reactionCounts, setReactionCounts] = useState<Map<string, number>>(new Map());
  const [reactingCards, setReactingCards] = useState<Set<string>>(new Set());

  // npubからpubkeyを取得（無効なnpubの場合はnullになる）
  const pubkey = npub.startsWith('npub') ? npubToPubkey(npub) : npub;
  
  // pubkeyが有効な場合のみnpubを生成（無効な場合は空文字）
  const fullNpub = pubkey ? (() => {
    try {
      return pubkeyToNpub(pubkey);
    } catch {
      return '';
    }
  })() : '';
  
  // npubコピー状態
  const [copyState, setCopyState] = useState<CopyState>('idle');
  
  // 真ん中を省略したnpub表示（先頭12文字 + ... + 末尾8文字）
  const truncatedNpub = fullNpub.length > 24 
    ? `${fullNpub.slice(0, 12)}...${fullNpub.slice(-8)}`
    : fullNpub;
  
  // npubをコピー
  const handleCopyNpub = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fullNpub);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch (error) {
      console.error('コピーに失敗:', error);
    }
  }, [fullNpub]);

  // プロフィールを取得
  useEffect(() => {
    if (pubkey) {
      fetchProfile(pubkey).then((p) => {
        if (p) setProfile(p);
      });
    }
  }, [pubkey]);

  // カードを取得
  const fetchCards = useCallback(async () => {
    if (!pubkey) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const fetchedCards = await fetchCardsByAuthor(pubkey, limit);
      // 宛先がない（公開）カードのみ表示
      const publicCards = fetchedCards.filter(card => !card.recipientPubkey);
      setCards(publicCards);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cards');
    } finally {
      setIsLoading(false);
    }
  }, [pubkey, limit]);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  // リアクション状態を取得
  useEffect(() => {
    const loadReactionStates = async () => {
      if (cards.length === 0) return;
      
      const eventIds = cards.map(card => card.id);
      
      // リアクション数を取得
      const counts = await fetchReactionCounts(eventIds);
      setReactionCounts(counts);
      
      // ユーザーがリアクション済みかチェック
      if (userPubkey) {
        const reacted = new Set<string>();
        await Promise.all(
          eventIds.map(async (eventId) => {
            const hasReacted = await hasUserReacted(eventId, userPubkey);
            if (hasReacted) {
              reacted.add(eventId);
            }
          })
        );
        setUserReactions(reacted);
      }
    };
    
    loadReactionStates();
  }, [cards, userPubkey]);

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

  const handleSelectCard = (card: NewYearCard) => {
    setSelectedCard(card);
  };

  const handleCloseCard = () => {
    setSelectedCard(null);
  };

  const handleLoadMore = () => {
    setLimit(prev => prev + 20);
  };

  // リアクションを送信
  const handleReaction = useCallback(async (e: React.MouseEvent, card: NewYearCard) => {
    e.stopPropagation();
    
    if (!signEvent || !userPubkey) return;
    if (userReactions.has(card.id)) return;
    if (reactingCards.has(card.id)) return;
    
    setReactingCards(prev => new Set(prev).add(card.id));
    
    try {
      await sendReaction(card.id, card.pubkey, '❤️', signEvent);
      setUserReactions(prev => new Set(prev).add(card.id));
      setReactionCounts(prev => {
        const newCounts = new Map(prev);
        newCounts.set(card.id, (prev.get(card.id) || 0) + 1);
        return newCounts;
      });
    } catch (error) {
      console.error('リアクション送信失敗:', error);
    } finally {
      setReactingCards(prev => {
        const newSet = new Set(prev);
        newSet.delete(card.id);
        return newSet;
      });
    }
  }, [signEvent, userPubkey, userReactions, reactingCards]);

  // リアクション数を取得
  const getReactionCount = (cardId: string): number => {
    return reactionCounts.get(cardId) || 0;
  };

  // 日時フォーマット（2026/1/1 10:00:00 形式）
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  };

  // 表示名（プロファイルがない場合はnpubを省略表示、それも無効なら「不明なユーザー」）
  const displayName = profile?.display_name || profile?.name || (fullNpub ? fullNpub.slice(0, 12) + '...' : t('gallery.unknownUser'));

  return (
    <div className={styles.userGallery}>
      {/* パンくずリスト */}
      <nav className={styles.breadcrumb}>
        <button onClick={onBack} className={styles.breadcrumbLink}>
          {t('nav.home')}
        </button>
        <span className={styles.breadcrumbSeparator}>›</span>
        <span className={styles.breadcrumbCurrent}>{displayName}</span>
      </nav>

      {/* ユーザー情報 */}
      <div className={styles.userInfo}>
        {profile?.picture && (
          <img src={profile.picture} alt="" className={styles.userAvatar} />
        )}
        <div className={styles.userDetails}>
          <h1 className={styles.userName}>{displayName}</h1>
          <div className={styles.npubRow}>
            <p className={styles.userNpubFull}>{fullNpub}</p>
            <p className={styles.userNpubTruncated}>{truncatedNpub}</p>
            <button 
              className={`${styles.copyButton} ${copyState === 'copied' ? styles.copied : ''}`}
              onClick={handleCopyNpub}
              title={copyState === 'copied' ? 'コピーしました' : 'npubをコピー'}
            >
              {copyState === 'copied' ? (
                <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor">
                  <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor">
                  <path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z"/>
                </svg>
              )}
            </button>
          </div>
          {profile?.about && (
            <p className={styles.userAbout}>{profile.about}</p>
          )}
        </div>
      </div>

      <h2 className={styles.sectionTitle}>
        {displayName}{t('gallery.userGallery')}
      </h2>

      {/* コンテンツ */}
      <div className={styles.content}>
        {isLoading && cards.length === 0 && (
          <div className={styles.loading}>{t('card.loading')}</div>
        )}

        {error && (
          <div className={styles.error}>{error}</div>
        )}

        {!isLoading && !error && cards.length === 0 && (
          <div className={styles.empty}>{t('gallery.noResults')}</div>
        )}

        {cards.length > 0 && (
          <>
            <div className={styles.grid}>
              {cards.map((card) => (
                <div key={card.id} className={styles.item}>
                  <div 
                    className={styles.thumbnail}
                    onClick={() => handleSelectCard(card)}
                  >
                    {card.svg ? (
                      <SvgRenderer svg={card.svg} className={styles.thumbnailImage} />
                    ) : (
                      <span className={styles.placeholderEmoji}>🎨</span>
                    )}
                  </div>
                  <div className={styles.info}>
                    <div className={styles.meta}>
                      <button
                        className={`${styles.reactionButton} ${userReactions.has(card.id) ? styles.reacted : ''}`}
                        onClick={(e) => handleReaction(e, card)}
                        disabled={!signEvent || !userPubkey || userReactions.has(card.id) || reactingCards.has(card.id)}
                        title={userReactions.has(card.id) ? t('reaction.liked') : t('reaction.like')}
                      >
                        <span>{userReactions.has(card.id) ? '❤️' : '🤍'}</span>
                        <span>{getReactionCount(card.id)}</span>
                      </button>
                      <span className={styles.date}>
                        {formatDate(card.createdAt)}
                      </span>
                    </div>
                    {card.message && (
                      <p className={styles.message}>
                        {card.message.slice(0, 30)}
                        {card.message.length > 30 ? '...' : ''}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {!isLoading && cards.length >= limit && (
              <div className={styles.loadMoreContainer}>
                <button onClick={handleLoadMore} className={styles.loadMoreButton}>
                  {t('gallery.loadMore')}
                </button>
              </div>
            )}

            {isLoading && cards.length > 0 && (
              <div className={styles.loadingMore}>{t('card.loading')}</div>
            )}
          </>
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
              onNavigateToCard={setSelectedCard}
            />
          </div>
        </div>
      )}
    </div>
  );
}

