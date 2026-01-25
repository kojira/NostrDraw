// タイムラインコンポーネント - フォロー/グローバル/タグタブ切り替え

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { NostrDrawPost, NostrProfile, TagStats } from '../../types';
import { type NostrDrawPostWithReactions, getCardFullSvg } from '../../services/card';
import { fetchProfile, pubkeyToNpub } from '../../services/profile';
import type { EventTemplate, Event } from 'nostr-tools';
import { Icon } from '../common/Icon';
import { Spinner } from '../common/Spinner';
import { CardItem } from '../common/CardItem';
import styles from './Timeline.module.css';

interface TimelineProps {
  followCards: (NostrDrawPost | NostrDrawPostWithReactions)[];
  globalCards: (NostrDrawPost | NostrDrawPostWithReactions)[];
  tagCards?: (NostrDrawPost | NostrDrawPostWithReactions)[];
  isLoadingFollow: boolean;
  isLoadingGlobal: boolean;
  isLoadingTags?: boolean;
  isLoadingMoreFollow?: boolean;
  isLoadingMoreGlobal?: boolean;
  isLoadingMoreTags?: boolean;
  hasMoreFollow?: boolean;
  hasMoreGlobal?: boolean;
  hasMoreTags?: boolean;
  errorFollow: string | null;
  errorGlobal: string | null;
  errorTags?: string | null;
  onRefreshFollow: () => void;
  onRefreshGlobal: () => void;
  onRefreshTags?: () => void;
  onLoadMoreFollow?: () => void;
  onLoadMoreGlobal?: () => void;
  onLoadMoreTags?: () => void;
  userPubkey?: string | null;
  signEvent?: (event: EventTemplate) => Promise<Event>;
  onUserClick?: (npub: string) => void;
  onCreatePost?: () => void;
  onExtend?: (card: NostrDrawPost) => void; // 描き足しボタン押下時
  onCardClick?: (card: NostrDrawPost) => void; // カードクリック時（大きく表示）
  // タグ関連
  followedTags?: string[];
  onFollowTag?: (tag: string) => void;
  onUnfollowTag?: (tag: string) => void;
  popularTags?: TagStats[];
  isLoadingPopularTags?: boolean;
  onTagClick?: (tag: string) => void; // タグクリック時（フィルター）
}

type TabType = 'follow' | 'global' | 'tags';

export function Timeline({
  followCards,
  globalCards,
  tagCards = [],
  isLoadingFollow,
  isLoadingGlobal,
  isLoadingTags = false,
  isLoadingMoreFollow = false,
  isLoadingMoreGlobal = false,
  isLoadingMoreTags = false,
  hasMoreFollow = true,
  hasMoreGlobal = true,
  hasMoreTags = true,
  errorFollow,
  errorGlobal,
  errorTags = null,
  onRefreshFollow,
  onRefreshGlobal,
  onRefreshTags,
  onLoadMoreFollow,
  onLoadMoreGlobal,
  onLoadMoreTags,
  userPubkey,
  signEvent,
  onUserClick,
  onCreatePost,
  onExtend,
  onCardClick,
  // タグ関連
  followedTags = [],
  onFollowTag,
  onUnfollowTag,
  popularTags = [],
  isLoadingPopularTags = false,
  onTagClick,
}: TimelineProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('follow'); // デフォルトはフォロータブ
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(new Map());
  // 既に取得中または取得済みのpubkeyを追跡（重複フェッチ防止）
  const fetchedPubkeysRef = useRef<Set<string>>(new Set());
  // 差分保存されたカードの合成済みSVGを管理
  const [mergedSvgs, setMergedSvgs] = useState<Map<string, string>>(new Map());
  // 差分SVG取得中のIDを追跡
  const fetchingDiffRef = useRef<Set<string>>(new Set());

  // タブに応じたカードを取得
  const getCardsForTab = () => {
    switch (activeTab) {
      case 'follow': return followCards;
      case 'global': return globalCards;
      case 'tags': return tagCards;
      default: return followCards;
    }
  };

  const cards = getCardsForTab();
  const isLoading = activeTab === 'follow' ? isLoadingFollow : activeTab === 'global' ? isLoadingGlobal : isLoadingTags;
  const isLoadingMore = activeTab === 'follow' ? isLoadingMoreFollow : activeTab === 'global' ? isLoadingMoreGlobal : isLoadingMoreTags;
  const hasMore = activeTab === 'follow' ? hasMoreFollow : activeTab === 'global' ? hasMoreGlobal : hasMoreTags;
  const onLoadMore = activeTab === 'follow' ? onLoadMoreFollow : activeTab === 'global' ? onLoadMoreGlobal : onLoadMoreTags;
  const error = activeTab === 'follow' ? errorFollow : activeTab === 'global' ? errorGlobal : errorTags;
  // 更新関数は将来のプルトゥリフレッシュ実装時に使用
  void onRefreshFollow;
  void onRefreshGlobal;
  void onRefreshTags;

  // 無限スクロール用のIntersection Observer
  const loadMoreRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!onLoadMore || !hasMore || isLoadingMore) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore();
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
  }, [onLoadMore, hasMore, isLoadingMore]);

  // プロフィールを取得
  useEffect(() => {
    cards.forEach(async (card) => {
      const pubkey = card.pubkey;
      // 既に取得中または取得済みならスキップ
      if (fetchedPubkeysRef.current.has(pubkey)) {
        return;
      }
      // 取得中としてマーク
      fetchedPubkeysRef.current.add(pubkey);
      
      const profile = await fetchProfile(pubkey);
      if (profile) {
        setProfiles(prev => new Map(prev).set(pubkey, profile));
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

  const handleAuthorClick = (pubkey: string) => {
    if (onUserClick) {
      const npub = pubkeyToNpub(pubkey);
      onUserClick(npub);
    }
  };

  return (
    <div className={styles.timeline}>
      {/* ログイン促し（フォロータブまたはタグタブでログインしていない場合） */}
      {(activeTab === 'follow' || activeTab === 'tags') && !userPubkey && (
        <div className={styles.loginPrompt}>
          <p>{activeTab === 'tags' ? t('timeline.loginToSeeTags') : t('timeline.loginToSeeFollow')}</p>
        </div>
      )}

      {/* タグタブの人気タグとフォロー中タグ表示 */}
      {activeTab === 'tags' && userPubkey && (
        <div className={styles.tagsSection}>
          {/* 人気タグ */}
          <div className={styles.popularTags}>
            <h4 className={styles.tagSectionTitle}>🔥 {t('tags.popular', '人気のタグ')}</h4>
            {isLoadingPopularTags ? (
              <Spinner size="sm" />
            ) : popularTags.length > 0 ? (
              <div className={styles.tagList}>
                {popularTags.slice(0, 10).map(({ tag, count }) => (
                  <button
                    key={tag}
                    className={`${styles.tagItem} ${followedTags.includes(tag) ? styles.followed : ''}`}
                    onClick={() => onTagClick?.(tag)}
                  >
                    {tag}
                    <span className={styles.tagCount}>{count}</span>
                    {onFollowTag && onUnfollowTag && (
                      <span
                        className={styles.tagFollowBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (followedTags.includes(tag)) {
                            onUnfollowTag(tag);
                          } else {
                            onFollowTag(tag);
                          }
                        }}
                      >
                        {followedTags.includes(tag) ? '✓' : '+'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className={styles.noTags}>{t('tags.noPopular', '人気タグはありません')}</p>
            )}
          </div>
          
          {/* フォロー中のタグ */}
          {followedTags.length > 0 && (
            <div className={styles.followedTagsSection}>
              <h4 className={styles.tagSectionTitle}>👤 {t('tags.following', 'フォロー中のタグ')}</h4>
              <div className={styles.tagList}>
                {followedTags.map(tag => (
                  <button
                    key={tag}
                    className={`${styles.tagItem} ${styles.followed}`}
                    onClick={() => onTagClick?.(tag)}
                  >
                    {tag}
                    {onUnfollowTag && (
                      <span
                        className={styles.tagFollowBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          onUnfollowTag(tag);
                        }}
                      >
                        ×
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ローディング（カードがない場合のみ表示） */}
      {isLoading && cards.length === 0 && (
        <div className={styles.loading}>
          <Spinner size="md" />
          {t('timeline.loading')}
        </div>
      )}

      {/* エラー */}
      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}

      {/* 投稿一覧（キャッシュからのデータがあれば即表示） */}
      {!error && (
        <div className={styles.posts}>
          {cards.length === 0 ? (
            <div className={styles.empty}>
              <p>{
                activeTab === 'follow' 
                  ? t('timeline.noFollowPosts') 
                  : activeTab === 'tags'
                  ? t('timeline.noTagPosts', 'フォロー中のタグの投稿がありません')
                  : t('timeline.noPosts')
              }</p>
            </div>
          ) : (
            cards.map(card => (
              <CardItem
                key={card.id}
                card={card}
                profile={profiles.get(card.pubkey)}
                userPubkey={userPubkey}
                signEvent={signEvent}
                onCardClick={onCardClick}
                onAuthorClick={handleAuthorClick}
                onExtend={onExtend}
                followedTags={followedTags}
                onTagClick={onTagClick}
                onFollowTag={onFollowTag}
                onUnfollowTag={onUnfollowTag}
                mergedSvg={mergedSvgs.get(card.id)}
                onMergedSvgLoaded={(cardId, svg) => {
                  setMergedSvgs(prev => new Map(prev).set(cardId, svg));
                }}
              />
            ))
          )}
          
          {/* 無限スクロール: ローディングとトリガー */}
          {cards.length > 0 && hasMore && (
            <div ref={loadMoreRef} className={styles.loadMore}>
              {isLoadingMore && (
                <div className={styles.loadMoreSpinner}>
                  <Spinner size="sm" />
                  <span>{t('timeline.loadingMore')}</span>
                </div>
              )}
            </div>
          )}
          
          {/* これ以上投稿がない場合 */}
          {cards.length > 0 && !hasMore && (
            <div className={styles.noMore}>
              {t('timeline.noMorePosts')}
            </div>
          )}
        </div>
      )}

      {/* 下部固定タブバー */}
      <div className={styles.bottomTabs}>
        <button
          className={`${styles.bottomTab} ${activeTab === 'follow' ? styles.active : ''}`}
          onClick={() => setActiveTab('follow')}
          disabled={!userPubkey}
          title={t('timeline.follow')}
        >
          <Icon name="group" size="lg" className={styles.tabIcon} />
        </button>
        
        <button
          className={`${styles.bottomTab} ${activeTab === 'tags' ? styles.active : ''}`}
          onClick={() => setActiveTab('tags')}
          disabled={!userPubkey}
          title={t('timeline.tags', 'タグ')}
        >
          <Icon name="label" size="lg" className={styles.tabIcon} />
        </button>
        
        {onCreatePost && (
          <button 
            className={styles.createButton}
            onClick={onCreatePost}
            title={t('timeline.createPost')}
          >
            <span className={styles.createIcon}>
              <Icon name="add" size="md" />
            </span>
          </button>
        )}
        
        <button
          className={`${styles.bottomTab} ${activeTab === 'global' ? styles.active : ''}`}
          onClick={() => setActiveTab('global')}
          title={t('timeline.global')}
        >
          <Icon name="public" size="lg" className={styles.tabIcon} />
        </button>
      </div>
    </div>
  );
}

