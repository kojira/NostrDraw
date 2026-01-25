// ギャラリーページ - 公開投稿の一覧表示

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { NostrDrawPost, NostrProfile } from '../../types';
import { PRESET_TAGS } from '../../types';
import type { Event, EventTemplate } from 'nostr-tools';
import type { NostrDrawPostWithReactions } from '../../services/card';
import { fetchReactionCounts, subscribeToPublicGalleryCards, subscribeToCardsByAuthor, fetchMorePublicGalleryCards, fetchMoreCardsByAuthors, getCardFullSvg, mergePostTags } from '../../services/card';
import { fetchProfile, pubkeyToNpub, npubToPubkey } from '../../services/profile';
import { fetchPublicPalettes, fetchPalettesByAuthor, type ColorPalette, addFavoritePalette, removeFavoritePalette, isFavoritePalette, loadPalettesFromLocal, savePalettesToLocal, generatePaletteId, deletePaletteFromNostr, saveFavoritePalettesToNostr, getFavoritePaletteIds, fetchPalettePopularityCounts, PRESET_PALETTES, isPresetPalette } from '../../services/palette';
import { CardFlip } from '../CardViewer/CardFlip';
import { Spinner } from '../common/Spinner';
import { CardItem } from '../common/CardItem';
import styles from './Gallery.module.css';

interface GalleryProps {
  initialTab?: string;
  initialPeriod?: string;
  initialAuthor?: string;
  userPubkey?: string | null;
  signEvent?: (event: EventTemplate) => Promise<Event>;
  onExtend?: (card: NostrDrawPost) => void;
  onBack: () => void;
  onUserClick?: (npub: string) => void;
  // UserGalleryから使う場合のオプション
  showBreadcrumb?: boolean;
  showAuthorFilter?: boolean;
}

type TabType = 'popular' | 'recent' | 'palettes';
type PeriodType = 'all' | 'day' | 'week' | 'month';
type SortOrderType = 'desc' | 'asc';

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
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [cards, setCards] = useState<(NostrDrawPost | NostrDrawPostWithReactions)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(new Map());
  const [selectedCard, setSelectedCard] = useState<NostrDrawPost | null>(null);
  const [senderProfile, setSenderProfile] = useState<NostrProfile | null>(null);
  const [displayLimit, setDisplayLimit] = useState(20);
  const displayLimitRef = useRef(20); // コールバック内で最新の値を参照するためのref
  
  // 購読用の固定数（表示用と分離）
  const FETCH_LIMIT = 100;
  
  // 全受信カードを保持（再購読なしで「もっと見る」を実現）
  const allReceivedCardsRef = useRef<NostrDrawPost[]>([]);
  const reactionCountsRef = useRef<Map<string, number>>(new Map());
  
  // EOSE完了フラグ（EOSE後はhandleCardでcardsを更新しない）
  const eoseReceivedRef = useRef(false);
  
  // 重複チェック用のSet（refで保持）
  const seenIdsRef = useRef<Set<string>>(new Set());
  
  // 無限スクロール用のref
  const loadMoreRef = useRef<HTMLDivElement>(null);
  
  // 著者フィルタのpubkeyを保持
  const authorPubkeyRef = useRef<string>('');
  
  // 差分保存されたカードの合成済みSVGを管理
  const [mergedSvgs, setMergedSvgs] = useState<Map<string, string>>(new Map());
  const fetchingDiffRef = useRef<Set<string>>(new Set());

  // パレット関連の状態
  const [palettes, setPalettes] = useState<ColorPalette[]>([]);
  const [palettesLoading, setPalettesLoading] = useState(false);
  const [favoritePalettes, setFavoritePalettes] = useState<Set<string>>(new Set());
  const [paletteReactions, setPaletteReactions] = useState<Map<string, number>>(new Map());
  const [paletteSortOrder, setPaletteSortOrder] = useState<'popular' | 'newest'>('popular');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [deletingPaletteId, setDeletingPaletteId] = useState<string | null>(null);

  // 期間をdays数に変換
  const periodToDays = useCallback((p: PeriodType): number => {
    switch (p) {
      case 'day': return 1;
      case 'week': return 7;
      case 'month': return 30;
      default: return 365; // all
    }
  }, []);

  // パレットタブの場合、パレットを取得
  useEffect(() => {
    if (activeTab !== 'palettes') return;
    
    setPalettesLoading(true);
    
    const loadPalettes = async () => {
      try {
        let fetchedPalettes: ColorPalette[];
        if (authorFilter) {
          let authorPubkey = authorFilter;
          if (authorFilter.startsWith('npub')) {
            const converted = npubToPubkey(authorFilter);
            if (converted) authorPubkey = converted;
          }
          fetchedPalettes = await fetchPalettesByAuthor(authorPubkey);
        } else {
          fetchedPalettes = await fetchPublicPalettes(100);
        }
        setPalettes(fetchedPalettes);
        
        // お気に入り状態を初期化（プリセット含む）
        const favorites = new Set<string>();
        // ユーザーパレット
        fetchedPalettes.forEach(p => {
          if (p.eventId && isFavoritePalette(p.eventId, userPubkey || undefined)) {
            favorites.add(p.eventId);
          }
        });
        // プリセットパレット
        PRESET_PALETTES.forEach(p => {
          if (isFavoritePalette(p.id, userPubkey || undefined)) {
            favorites.add(p.id);
          }
        });
        setFavoritePalettes(favorites);
        
        // パレットの人気度（お気に入りリストに含まれている数）を取得
        const popularityCounts = await fetchPalettePopularityCounts();
        setPaletteReactions(popularityCounts);
      } catch (err) {
        console.error('パレット取得エラー:', err);
      } finally {
        setPalettesLoading(false);
      }
    };
    
    loadPalettes();
  }, [activeTab, authorFilter]);

  // displayLimitが変わったらrefも更新
  useEffect(() => {
    displayLimitRef.current = displayLimit;
  }, [displayLimit]);

  // ストリーミングでカードを取得（リアルタイム表示）
  useEffect(() => {
    let cancelled = false;
    
    setIsLoading(true);
    setError(null);
    setCards([]);
    setDisplayLimit(20); // フィルタ変更時は表示数をリセット
    setHasMore(true); // 追加読み込み可能にリセット
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
    authorPubkeyRef.current = authorPubkey;
    
    const handleCard = (card: NostrDrawPost) => {
      if (cancelled) return;
      
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
      
      // 人気タブの場合はEOSE後にリアクション数でソートするため、EOSE前は表示を更新しない
      if (activeTab === 'popular') return;
      
      // 新着タブの場合のみ、EOSE前にリアルタイムで表示を更新（ソートして最初の20件だけ表示）
      const sortedCards = [...allReceivedCardsRef.current].sort((a, b) => 
        sortOrder === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
      ).slice(0, 20); // 初期表示は20件
      
      setCards(sortedCards);
    };
    
    const handleEose = async () => {
      if (cancelled) return;
      
      eoseReceivedRef.current = true; // EOSE完了をマーク
      
      // 別kindで管理されているタグをマージ
      if (allReceivedCardsRef.current.length > 0) {
        try {
          const mergedCards = await mergePostTags(allReceivedCardsRef.current);
          if (cancelled) return;
          allReceivedCardsRef.current = mergedCards;
        } catch (err) {
          console.error('[Gallery] Failed to merge tags:', err);
        }
      }
      
      if (cancelled) return;
      
      const currentLimit = displayLimitRef.current;
      
      // EOSE後にリアクション数を一度だけ取得してソート
      if (activeTab === 'popular' && allReceivedCardsRef.current.length > 0) {
        const cardIds = allReceivedCardsRef.current.map(c => c.id);
        
        // リアクション数を一度だけ取得
        const reactions = await fetchReactionCounts(cardIds);
        if (cancelled) return;
        
        reactionCountsRef.current = reactions;
        
        // リアクション数でソート（第一キー：リアクション数、第二キー：日付）
        const sortedByReaction = [...allReceivedCardsRef.current].sort((a, b) => {
          const aCount = reactions.get(a.id) || 0;
          const bCount = reactions.get(b.id) || 0;
          if (aCount !== bCount) {
            return bCount - aCount;
          }
          return sortOrder === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt;
        }).slice(0, currentLimit);
        
        setCards(sortedByReaction);
      } else if (activeTab === 'recent' && allReceivedCardsRef.current.length > 0) {
        // 新着タブの場合、日付でソートして表示
        const sortedCards = [...allReceivedCardsRef.current].sort((a, b) => 
          sortOrder === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
        ).slice(0, currentLimit);
        setCards(sortedCards);
      }
      
      setIsLoading(false);
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
      cancelled = true;
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

  // 差分保存されたカードの完全なSVGを取得
  useEffect(() => {
    cards.forEach(async (card) => {
      // isDiffでない、または親がない場合はスキップ
      if (!card.isDiff || !card.parentEventId) return;
      // 既に取得中または取得済みならスキップ
      if (fetchingDiffRef.current.has(card.id) || mergedSvgs.has(card.id)) return;
      
      fetchingDiffRef.current.add(card.id);
      
      try {
        // カードの完全なSVG（差分チェーン全体をマージ済み）を取得
        const fullSvg = await getCardFullSvg(card);
        setMergedSvgs(prev => new Map(prev).set(card.id, fullSvg));
      } catch (error) {
        console.error('Failed to get full SVG:', error);
      }
    });
  }, [cards, mergedSvgs]);

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

  // タグでフィルタリングされたカード
  const filteredCards = useMemo(() => {
    if (tagFilters.length === 0) {
      return cards;
    }
    return cards.filter(card => {
      if (!card.tags || card.tags.length === 0) return false;
      // いずれかのフィルタータグがカードのタグに含まれていればtrue
      return tagFilters.some(filterTag => card.tags?.includes(filterTag));
    });
  }, [cards, tagFilters]);

  const handleSelectCard = (card: NostrDrawPost) => {
    setSelectedCard(card);
  };

  const handleCloseCard = () => {
    setSelectedCard(null);
  };

  // ツリー内のカードへナビゲート
  const handleNavigateToCard = useCallback((card: NostrDrawPost) => {
    setSelectedCard(card);
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    
    const newLimit = displayLimit + 20;
    setDisplayLimit(newLimit);
    
    // 既に取得済みのカードで足りる場合はそれを表示
    if (allReceivedCardsRef.current.length >= newLimit) {
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
      return;
    }
    
    // 足りない場合はリレーから追加取得
    setIsLoadingMore(true);
    
    try {
      // 最も古いカードのcreatedAtを取得
      const oldestCard = allReceivedCardsRef.current.reduce((oldest, card) => 
        card.createdAt < oldest.createdAt ? card : oldest
      , allReceivedCardsRef.current[0]);
      
      if (!oldestCard) {
        setHasMore(false);
        return;
      }
      
      let moreCards: NostrDrawPost[];
      if (authorPubkeyRef.current) {
        moreCards = await fetchMoreCardsByAuthors(
          [authorPubkeyRef.current],
          oldestCard.createdAt,
          30,
          seenIdsRef.current
        );
      } else {
        moreCards = await fetchMorePublicGalleryCards(
          oldestCard.createdAt,
          30,
          seenIdsRef.current
        );
      }
      
      if (moreCards.length === 0) {
        setHasMore(false);
      } else {
        // 公開カードのみフィルタ
        const publicCards = moreCards.filter(card => !card.recipientPubkey);
        
        // 追加されたカードをrefに追加
        for (const card of publicCards) {
          seenIdsRef.current.add(card.id);
          allReceivedCardsRef.current.push(card);
        }
        
        // ソートして表示更新
        if (activeTab === 'popular') {
          // 人気タブの場合は新しいカードのリアクション数を取得
          const newCardIds = publicCards.map(c => c.id);
          if (newCardIds.length > 0) {
            const newReactions = await fetchReactionCounts(newCardIds);
            newReactions.forEach((count, id) => {
              reactionCountsRef.current.set(id, count);
            });
          }
          
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
      }
    } catch (err) {
      console.error('追加読み込みエラー:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [displayLimit, activeTab, sortOrder, isLoadingMore, hasMore]);

  // 無限スクロール用のIntersection Observer
  useEffect(() => {
    if (!hasMore || isLoadingMore || isLoading) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      { threshold: 0.1 }
    );
    
    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }
    
    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMore, isLoadingMore, isLoading, handleLoadMore]);

  // 一覧からリアクションを送信
  const handleAuthorClick = (pubkey: string) => {
    if (onUserClick) {
      onUserClick(pubkeyToNpub(pubkey));
    }
  };

  // パレットのお気に入り切り替え（お気に入り追加時は自動インポート）
  const handleToggleFavorite = useCallback(async (palette: ColorPalette) => {
    // プリセットパレットはidを使用、ユーザーパレットはeventIdを使用
    const paletteKey = isPresetPalette(palette.id) ? palette.id : palette.eventId;
    if (!paletteKey) return;
    
    let newFavoriteIds: string[];
    const pubkey = userPubkey || undefined;
    
    if (favoritePalettes.has(paletteKey)) {
      // お気に入りから削除
      removeFavoritePalette(paletteKey, pubkey);
      setFavoritePalettes(prev => {
        const newSet = new Set(prev);
        newSet.delete(paletteKey);
        return newSet;
      });
      newFavoriteIds = getFavoritePaletteIds(pubkey).filter(id => id !== paletteKey);
      
      // 人気度を即時更新（-1）- プリセット以外のみ
      if (!isPresetPalette(palette.id)) {
        setPaletteReactions(prev => {
          const newMap = new Map(prev);
          const current = newMap.get(paletteKey) || 0;
          if (current > 0) {
            newMap.set(paletteKey, current - 1);
          }
          return newMap;
        });
      }
    } else {
      // お気に入りに追加
      addFavoritePalette(paletteKey, pubkey);
      setFavoritePalettes(prev => new Set(prev).add(paletteKey));
      newFavoriteIds = [...getFavoritePaletteIds(pubkey)];
      
      // 人気度を即時更新（+1）- プリセット以外のみ
      if (!isPresetPalette(palette.id)) {
        setPaletteReactions(prev => {
          const newMap = new Map(prev);
          newMap.set(paletteKey, (newMap.get(paletteKey) || 0) + 1);
          return newMap;
        });
      }
      
      // 自動インポート（プリセットパレットはインポートしない - 常に利用可能なため）
      if (!isPresetPalette(palette.id)) {
        const localPalettes = loadPalettesFromLocal(userPubkey || undefined);
        const existsLocally = localPalettes.some(p => p.eventId === paletteKey);
        if (!existsLocally) {
          const newPalette: ColorPalette = {
            id: generatePaletteId(),
            name: palette.name,
            colors: palette.colors.slice(0, 64),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            eventId: paletteKey,
          };
          localPalettes.push(newPalette);
          savePalettesToLocal(localPalettes, userPubkey || undefined);
        }
      }
    }
    
    // Nostrにもお気に入りリストを保存
    if (signEvent) {
      saveFavoritePalettesToNostr(newFavoriteIds, signEvent).catch(err => {
        console.error('Failed to save favorites to Nostr:', err);
      });
    }
  }, [favoritePalettes, userPubkey, signEvent]);

  // パレットを削除
  const handleDeletePalette = useCallback(async (palette: ColorPalette) => {
    if (!signEvent || !palette.eventId) return;
    
    // 確認ダイアログ
    if (!confirm(t('gallery.confirmDeletePalette'))) return;
    
    setDeletingPaletteId(palette.eventId);
    
    try {
      const success = await deletePaletteFromNostr(palette.id, signEvent);
      if (success) {
        // パレットをリストから削除
        setPalettes(prev => prev.filter(p => p.eventId !== palette.eventId));
        setToastMessage(t('gallery.paletteDeleted'));
        setTimeout(() => setToastMessage(null), 2000);
      }
    } catch (error) {
      console.error('Failed to delete palette:', error);
    } finally {
      setDeletingPaletteId(null);
    }
  }, [signEvent, t]);

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
        <button
          className={`${styles.tab} ${activeTab === 'palettes' ? styles.active : ''}`}
          onClick={() => setActiveTab('palettes')}
        >
          🎨 {t('gallery.palettes')}
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
        
        {/* タグフィルター */}
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>{t('tags.filter', 'タグ')}:</label>
          <div className={styles.tagFilterContainer}>
            {tagFilters.map(tag => (
              <span key={tag} className={styles.tagFilterChip}>
                {tag}
                <button 
                  onClick={() => setTagFilters(prev => prev.filter(t => t !== tag))}
                  className={styles.tagFilterRemove}
                >
                  ×
                </button>
              </span>
            ))}
            <div className={styles.tagFilterDropdownWrapper}>
              <button 
                className={styles.addTagFilterButton}
                onClick={() => setShowTagDropdown(!showTagDropdown)}
              >
                + {t('tags.add', '追加')}
              </button>
              {showTagDropdown && (
                <div className={styles.tagFilterDropdown}>
                  {PRESET_TAGS.filter(tag => !tagFilters.includes(tag)).map(tag => (
                    <button
                      key={tag}
                      className={styles.tagFilterOption}
                      onClick={() => {
                        setTagFilters(prev => [...prev, tag]);
                        setShowTagDropdown(false);
                      }}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* コンテンツ */}
      <div className={styles.content}>
        {/* パレットタブの場合 */}
        {activeTab === 'palettes' ? (
          <>
            {/* プリセットパレットセクション */}
            <div className={styles.paletteSection}>
              <h3 className={styles.paletteSectionTitle}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>palette</span>
                {t('gallery.presetPalettes')}
              </h3>
              <div className={styles.paletteGrid}>
                {PRESET_PALETTES.map((palette) => {
                  const isFavorite = favoritePalettes.has(palette.id);
                  
                  return (
                    <div key={palette.id} className={`${styles.paletteItem} ${styles.presetPaletteItem}`}>
                      <div className={styles.paletteHeader}>
                        <div className={styles.paletteNameWithAvatar}>
                          <span className={styles.presetBadge}>{t('gallery.preset')}</span>
                          <span className={styles.paletteName}>{palette.name}</span>
                        </div>
                        <div className={styles.paletteActions}>
                          <button
                            className={`${styles.paletteActionButton} ${isFavorite ? styles.favorited : ''}`}
                            onClick={() => handleToggleFavorite(palette)}
                            title={isFavorite ? t('gallery.removeFromFavorites') : t('gallery.addToFavorites')}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '18px', fontVariationSettings: isFavorite ? "'FILL' 1" : "'FILL' 0" }}>
                              star
                            </span>
                          </button>
                        </div>
                      </div>
                      <div className={styles.paletteColors}>
                        {palette.colors.map((color, idx) => (
                          <div
                            key={idx}
                            className={palette.colors.length > 32 ? styles.paletteColorSwatchSmall : styles.paletteColorSwatch}
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                      </div>
                      <div className={styles.paletteAuthor}>
                        <span className={styles.paletteColorCount}>
                          {t('gallery.colorsCount', { count: palette.colors.length })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* みんなのパレットセクション */}
            <div className={styles.paletteSection}>
              <h3 className={styles.paletteSectionTitle}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>group</span>
                {t('gallery.userPalettes')}
              </h3>

            {palettesLoading && (
              <div className={styles.loading}>
                <Spinner size="lg" />
                <span>{t('card.loading')}</span>
              </div>
            )}

            {!palettesLoading && palettes.length === 0 && (
              <div className={styles.empty}>{t('gallery.noPalettes')}</div>
            )}

            {palettes.length > 0 && (
              <>
                <div className={styles.paletteSortBar}>
                  <button
                    className={`${styles.sortButton} ${paletteSortOrder === 'popular' ? styles.active : ''}`}
                    onClick={() => setPaletteSortOrder('popular')}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>favorite</span>
                    {t('gallery.sortByPopular')}
                  </button>
                  <button
                    className={`${styles.sortButton} ${paletteSortOrder === 'newest' ? styles.active : ''}`}
                    onClick={() => setPaletteSortOrder('newest')}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>schedule</span>
                    {t('gallery.sortByNewest')}
                  </button>
                </div>
                <div className={styles.paletteGrid}>
                {[...palettes].sort((a, b) => {
                  if (paletteSortOrder === 'popular') {
                    const countA = a.eventId ? (paletteReactions.get(a.eventId) || 0) : 0;
                    const countB = b.eventId ? (paletteReactions.get(b.eventId) || 0) : 0;
                    return countB - countA;
                  } else {
                    return (b.createdAt || 0) - (a.createdAt || 0);
                  }
                }).map((palette) => {
                  const picture = palette.pubkey ? profiles.get(palette.pubkey)?.picture : undefined;
                  const name = palette.pubkey ? getProfileName(palette.pubkey) : t('gallery.unknownUser');
                  const isFavorite = palette.eventId ? favoritePalettes.has(palette.eventId) : false;
                  const isOwner = palette.pubkey === userPubkey;
                  const isDeleting = palette.eventId === deletingPaletteId;
                  const reactionCount = palette.eventId ? (paletteReactions.get(palette.eventId) || 0) : 0;

                  return (
                    <div key={palette.eventId || palette.id} className={styles.paletteItem}>
                      <div className={styles.paletteHeader}>
                        <div className={styles.paletteNameWithAvatar} onClick={() => palette.pubkey && handleAuthorClick(palette.pubkey)}>
                          {picture && (
                            <img src={picture} alt="" className={styles.paletteHeaderAvatar} />
                          )}
                          <span className={styles.paletteName}>{palette.name}</span>
                        </div>
                        <div className={styles.paletteActions}>
                          <button
                            className={`${styles.paletteActionButton} ${isFavorite ? styles.favorited : ''}`}
                            onClick={() => handleToggleFavorite(palette)}
                            title={isFavorite ? t('gallery.removeFromFavorites') : t('gallery.addToFavorites')}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '18px', fontVariationSettings: isFavorite ? "'FILL' 1" : "'FILL' 0" }}>
                              star
                            </span>
                            {reactionCount > 0 && (
                              <span className={styles.reactionCount}>{reactionCount}</span>
                            )}
                          </button>
                          {isOwner && (
                            <button
                              className={`${styles.paletteActionButton} ${styles.deleteButton}`}
                              onClick={() => handleDeletePalette(palette)}
                              disabled={isDeleting}
                              title={t('gallery.deletePalette')}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                                {isDeleting ? 'hourglass_empty' : 'delete'}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                      <div className={styles.paletteColors}>
                        {palette.colors.map((color, idx) => (
                          <div
                            key={idx}
                            className={palette.colors.length > 32 ? styles.paletteColorSwatchSmall : styles.paletteColorSwatch}
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                      </div>
                      <div className={styles.paletteAuthor} onClick={() => palette.pubkey && handleAuthorClick(palette.pubkey)}>
                        {picture && (
                          <img src={picture} alt="" className={styles.paletteAuthorAvatar} />
                        )}
                        <span className={styles.paletteAuthorName}>{name}</span>
                        <span className={styles.paletteColorCount}>
                          {t('gallery.colorsCount', { count: palette.colors.length })}
                        </span>
                      </div>
                    </div>
                  );
                })}
                </div>
              </>
            )}
            </div>
          </>
        ) : (
          <>
            {isLoading && cards.length === 0 && (
              <div className={styles.loading}>
                <Spinner size="lg" />
                <span>{t('card.loading')}</span>
              </div>
            )}

            {error && (
              <div className={styles.error}>{error}</div>
            )}

            {!isLoading && !error && filteredCards.length === 0 && (
              <div className={styles.empty}>
                {tagFilters.length > 0 
                  ? t('gallery.noTagResults', '選択したタグの投稿が見つかりません')
                  : t('gallery.noResults')
                }
              </div>
            )}

            {filteredCards.length > 0 && (
              <>
                <div className={styles.grid}>
              {filteredCards.map((card) => (
                <CardItem
                  key={card.id}
                  card={card}
                  profile={profiles.get(card.pubkey)}
                  userPubkey={userPubkey}
                  signEvent={signEvent}
                  onCardClick={handleSelectCard}
                  onAuthorClick={handleAuthorClick}
                  mergedSvg={mergedSvgs.get(card.id)}
                  onMergedSvgLoaded={(cardId, svg) => {
                    setMergedSvgs(prev => new Map(prev).set(cardId, svg));
                  }}
                  variant="thumbnail"
                  followedTags={tagFilters}
                  onTagClick={(tag) => {
                    // タグがフィルターになければ追加
                    if (!tagFilters.includes(tag)) {
                      setTagFilters(prev => [...prev, tag]);
                    }
                  }}
                />
              ))}
            </div>

            {/* 無限スクロール: ローディングとトリガー */}
            {cards.length > 0 && hasMore && (
              <div ref={loadMoreRef} className={styles.loadMoreContainer}>
                {isLoadingMore && (
                  <div className={styles.loadingMore}>
                    <Spinner size="sm" />
                    <span>{t('gallery.loadingMore')}</span>
                  </div>
                )}
              </div>
            )}
            
            {/* これ以上投稿がない場合 */}
            {cards.length > 0 && !hasMore && (
              <div className={styles.noMore}>
                {t('gallery.noMoreResults')}
              </div>
            )}
              </>
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

      {/* Toast通知 */}
      {toastMessage && (
        <div className={styles.toast}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>check_circle</span>
          {toastMessage}
        </div>
      )}
    </div>
  );
}