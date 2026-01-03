// ギャラリーページ - 公開投稿の一覧表示

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { NewYearCard, NostrProfile } from '../../types';
import type { Event, EventTemplate } from 'nostr-tools';
import type { NewYearCardWithReactions } from '../../services/card';
import { sendReaction, hasUserReacted, fetchReactionCounts, subscribeToPublicGalleryCards, subscribeToCardsByAuthor } from '../../services/card';
import { fetchProfile, pubkeyToNpub, npubToPubkey } from '../../services/profile';
import { CardFlip } from '../CardViewer/CardFlip';
import { Spinner } from '../common/Spinner';
import styles from './Gallery.module.css';

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

interface GalleryProps {
  initialTab?: string;
  initialPeriod?: string;
  initialAuthor?: string;
  userPubkey?: string | null;
  signEvent?: (event: EventTemplate) => Promise<Event>;
  onExtend?: (card: NewYearCard) => void;
  onBack: () => void;
  onUserClick?: (npub: string) => void;
  // UserGalleryから使う場合のオプション
  showBreadcrumb?: boolean;
  showAuthorFilter?: boolean;
}

type TabType = 'popular' | 'recent';
type PeriodType = 'all' | 'day' | 'week' | 'month';
type SortOrderType = 'desc' | 'asc';

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

export function Gallery({
  initialTab = 'popular',
  initialPeriod = 'week',
  initialAuthor,
  userPubkey,
  signEvent,
  onExtend,
  onBack,
  onUserClick,
  showBreadcrumb = true,
  showAuthorFilter = true,
}: GalleryProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>(initialTab as TabType || 'popular');
  const [period, setPeriod] = useState<PeriodType>(initialPeriod as PeriodType || 'week');
  const [sortOrder, setSortOrder] = useState<SortOrderType>('desc');
  const [authorFilter, setAuthorFilter] = useState<string>(initialAuthor || '');
  const [cards, setCards] = useState<(NewYearCard | NewYearCardWithReactions)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(new Map());
  const [selectedCard, setSelectedCard] = useState<NewYearCard | null>(null);
  const [senderProfile, setSenderProfile] = useState<NostrProfile | null>(null);
  const [displayLimit, setDisplayLimit] = useState(20);
  const displayLimitRef = useRef(20); // コールバック内で最新の値を参照するためのref
  
  // 購読用の固定数（表示用と分離）
  const FETCH_LIMIT = 100;
  
  // 全受信カードを保持（再購読なしで「もっと見る」を実現）
  const allReceivedCardsRef = useRef<NewYearCard[]>([]);
  const reactionCountsRef = useRef<Map<string, number>>(new Map());
  
  // EOSE完了フラグ（EOSE後はhandleCardでcardsを更新しない）
  const eoseReceivedRef = useRef(false);
  
  // 重複チェック用のSet（refで保持）
  const seenIdsRef = useRef<Set<string>>(new Set());
  
  // リアクション状態を管理
  const [userReactions, setUserReactions] = useState<Set<string>>(new Set());
  const [reactionCounts, setReactionCounts] = useState<Map<string, number>>(new Map());
  const [reactingCards, setReactingCards] = useState<Set<string>>(new Set());

  // 期間をdays数に変換
  const periodToDays = useCallback((p: PeriodType): number => {
    switch (p) {
      case 'day': return 1;
      case 'week': return 7;
      case 'month': return 30;
      default: return 365; // all
    }
  }, []);

  // displayLimitが変わったらrefも更新
  useEffect(() => {
    displayLimitRef.current = displayLimit;
  }, [displayLimit]);

  // ストリーミングでカードを取得（リアルタイム表示）
  useEffect(() => {
    setIsLoading(true);
    setError(null);
    setCards([]);
    setDisplayLimit(20); // フィルタ変更時は表示数をリセット
    displayLimitRef.current = 20;
    allReceivedCardsRef.current = [];
    reactionCountsRef.current = new Map();
    eoseReceivedRef.current = false; // EOSE完了フラグをリセット
    seenIdsRef.current = new Set(); // 重複チェック用のSetをリセット
    
    const days = periodToDays(period);
    const since = period !== 'all' ? Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60) : 0;
    
    // 著者フィルタ用のpubkeyを計算
    let authorPubkey = authorFilter;
    if (authorFilter && authorFilter.startsWith('npub')) {
      const converted = npubToPubkey(authorFilter);
      if (converted) {
        authorPubkey = converted;
      }
    }
    
    const handleCard = (card: NewYearCard) => {
      // 重複チェック
      if (seenIdsRef.current.has(card.id)) return;
      seenIdsRef.current.add(card.id);
      
      // 公開カードのみ
      if (card.recipientPubkey) return;
      
      // 期間フィルタ
      if (since > 0 && card.createdAt < since) return;
      
      allReceivedCardsRef.current.push(card);
      
      // EOSE完了後は表示を更新しない（「もっと見る」で増やした表示数を維持するため）
      if (eoseReceivedRef.current) return;
      
      // EOSE前はリアルタイムで表示を更新（ソートして最初の20件だけ表示）
      const sortedCards = [...allReceivedCardsRef.current].sort((a, b) => 
        sortOrder === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
      ).slice(0, 20); // 初期表示は20件
      
      setCards(sortedCards);
    };
    
    const handleEose = async () => {
      eoseReceivedRef.current = true; // EOSE完了をマーク
      setIsLoading(false);
      
      // EOSE後にリアクション数を取得してソート
      if (activeTab === 'popular' && allReceivedCardsRef.current.length > 0) {
        try {
          const cardIds = allReceivedCardsRef.current.map(c => c.id);
          const reactions = await fetchReactionCounts(cardIds);
          
          reactionCountsRef.current = reactions;
          
          // リアクション数でソート（第一キー：リアクション数、第二キー：日付）
          const currentLimit = displayLimitRef.current;
          const sortedByReaction = [...allReceivedCardsRef.current].sort((a, b) => {
            const aCount = reactions.get(a.id) || 0;
            const bCount = reactions.get(b.id) || 0;
            if (aCount !== bCount) {
              return bCount - aCount;
            }
            return sortOrder === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt;
          }).slice(0, currentLimit);
          
          setCards(sortedByReaction);
          
          // リアクション数をステートに保存
          setReactionCounts(reactions);
        } catch (err) {
          console.error('Failed to fetch reaction counts:', err);
        }
      }
    };
    
    // ストリーミング購読を開始
    let unsubscribe: () => void;
    
    if (authorPubkey) {
      unsubscribe = subscribeToCardsByAuthor(authorPubkey, handleCard, handleEose, FETCH_LIMIT);
    } else {
      unsubscribe = subscribeToPublicGalleryCards(handleCard, handleEose, FETCH_LIMIT);
    }
    
    // クリーンアップ
    return () => {
      unsubscribe();
    };
  }, [activeTab, period, sortOrder, authorFilter, periodToDays]);

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

  // リアクション状態を取得
  useEffect(() => {
    const loadReactionStates = async () => {
      if (cards.length === 0) return;
      
      const eventIds = cards.map(card => card.id);
      
      // リアクション数を取得（NewYearCardWithReactionsでない場合）
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

  // ツリー内のカードへナビゲート
  const handleNavigateToCard = useCallback((card: NewYearCard) => {
    setSelectedCard(card);
  }, []);

  const handleLoadMore = useCallback(() => {
    const newLimit = displayLimit + 20;
    setDisplayLimit(newLimit);
    
    // 既に取得済みのカードから追加表示（再購読しない）
    if (activeTab === 'popular') {
      const reactions = reactionCountsRef.current;
      const sortedCards = [...allReceivedCardsRef.current].sort((a, b) => {
        const aCount = reactions.get(a.id) || 0;
        const bCount = reactions.get(b.id) || 0;
        if (aCount !== bCount) {
          return bCount - aCount;
        }
        return sortOrder === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt;
      }).slice(0, newLimit);
      setCards(sortedCards);
    } else {
      const sortedCards = [...allReceivedCardsRef.current].sort((a, b) => 
        sortOrder === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
      ).slice(0, newLimit);
      setCards(sortedCards);
    }
  }, [displayLimit, activeTab, sortOrder]);

  // 一覧からリアクションを送信
  const handleReaction = useCallback(async (e: React.MouseEvent, card: NewYearCard) => {
    e.stopPropagation(); // カード選択を防ぐ
    
    if (!signEvent || !userPubkey) return;
    if (userReactions.has(card.id)) return; // 既にリアクション済み
    if (reactingCards.has(card.id)) return; // リアクション中
    
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

  const handleAuthorClick = (pubkey: string) => {
    if (onUserClick) {
      onUserClick(pubkeyToNpub(pubkey));
    }
  };

  // リアクション数を取得
  const getReactionCount = (card: NewYearCard | NewYearCardWithReactions): number => {
    // stateから取得（リアルタイム更新用）
    if (reactionCounts.has(card.id)) {
      return reactionCounts.get(card.id) || 0;
    }
    // NewYearCardWithReactionsから取得
    if ('reactionCount' in card) {
      return card.reactionCount;
    }
    return 0;
  };

  return (
    <div className={styles.gallery}>
      {/* パンくずリスト */}
      {showBreadcrumb && (
        <nav className={styles.breadcrumb}>
          <button onClick={onBack} className={styles.breadcrumbLink}>
            {t('nav.home')}
          </button>
          <span className={styles.breadcrumbSeparator}>›</span>
          <span className={styles.breadcrumbCurrent}>{t('nav.gallery')}</span>
        </nav>
      )}

      {/* タブ */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'popular' ? styles.active : ''}`}
          onClick={() => setActiveTab('popular')}
        >
          🔥 {t('gallery.popular')}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'recent' ? styles.active : ''}`}
          onClick={() => setActiveTab('recent')}
        >
          🆕 {t('gallery.recent')}
        </button>
      </div>

      {/* フィルター */}
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>{t('gallery.period')}:</label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodType)}
            className={styles.filterSelect}
          >
            <option value="all">{t('gallery.allPeriod')}</option>
            <option value="day">{t('gallery.lastDay')}</option>
            <option value="week">{t('gallery.lastWeek')}</option>
            <option value="month">{t('gallery.lastMonth')}</option>
          </select>
        </div>
        
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>{t('gallery.sortOrder')}:</label>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrderType)}
            className={styles.filterSelect}
          >
            <option value="desc">{t('gallery.sortDesc')}</option>
            <option value="asc">{t('gallery.sortAsc')}</option>
          </select>
        </div>
        
        {showAuthorFilter && (
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>{t('gallery.author')}:</label>
            <input
              type="text"
              value={authorFilter}
              onChange={(e) => setAuthorFilter(e.target.value)}
              placeholder="npub1..."
              className={styles.filterInput}
            />
            {authorFilter && (
              <button 
                onClick={() => setAuthorFilter('')}
                className={styles.clearButton}
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>

      {/* コンテンツ */}
      <div className={styles.content}>
        {isLoading && cards.length === 0 && (
          <div className={styles.loading}>
            <Spinner size="lg" />
            <span>{t('card.loading')}</span>
          </div>
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
              {cards.map((card) => {
                const picture = getProfilePicture(card.pubkey);
                const name = getProfileName(card.pubkey);
                const reactionCount = getReactionCount(card);

                return (
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
                      <div 
                        className={styles.author}
                        onClick={() => handleAuthorClick(card.pubkey)}
                      >
                        {picture && (
                          <img src={picture} alt="" className={styles.avatar} />
                        )}
                        <span className={styles.name}>{name}</span>
                      </div>
                      <div className={styles.meta}>
                        <button
                          className={`${styles.reactionButton} ${userReactions.has(card.id) ? styles.reacted : ''}`}
                          onClick={(e) => handleReaction(e, card)}
                          disabled={!signEvent || !userPubkey || userReactions.has(card.id) || reactingCards.has(card.id)}
                          title={userReactions.has(card.id) ? t('reaction.liked') : t('reaction.like')}
                        >
                          <span>{userReactions.has(card.id) ? '❤️' : '🤍'}</span>
                          <span>{reactionCount}</span>
                        </button>
                        <span className={styles.date}>
                          {formatDate(card.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!isLoading && cards.length >= displayLimit && allReceivedCardsRef.current.length > displayLimit && (
              <div className={styles.loadMoreContainer}>
                <button onClick={handleLoadMore} className={styles.loadMoreButton}>
                  {t('gallery.loadMore')}
                </button>
              </div>
            )}

            {isLoading && cards.length > 0 && (
              <div className={styles.loadingMore}>
                <Spinner size="sm" />
                <span>{t('card.loading')}</span>
              </div>
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
              onNavigateToCard={handleNavigateToCard}
            />
          </div>
        </div>
      )}
    </div>
  );
}