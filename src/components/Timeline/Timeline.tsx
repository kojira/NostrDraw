// タイムラインコンポーネント - フォロー/グローバルタブ切り替え

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { NewYearCard, NostrProfile } from '../../types';
import { sendReaction, type NewYearCardWithReactions } from '../../services/card';
import { fetchProfile, pubkeyToNpub } from '../../services/profile';
import type { EventTemplate, Event } from 'nostr-tools';
import styles from './Timeline.module.css';

// SVGを安全にレンダリングするためのコンポーネント
// dangerouslySetInnerHTMLを使用してフォントを正しく表示
function SvgRenderer({ svg, className }: { svg: string; className?: string }) {
  return (
    <div 
      className={className}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
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
  onUserClick?: (npub: string) => void;
  onCreatePost?: () => void;
  onExtend?: (card: NewYearCard) => void; // 描き足しボタン押下時
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
  onUserClick,
  onCreatePost,
  onExtend,
}: TimelineProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('follow'); // デフォルトはフォロータブ
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(new Map());
  // 既に取得中または取得済みのpubkeyを追跡（重複フェッチ防止）
  const fetchedPubkeysRef = useRef<Set<string>>(new Set());
  // リアクション中のイベントIDを追跡
  const [reactingIds, setReactingIds] = useState<Set<string>>(new Set());
  // ローカルでリアクション済みのイベントIDを追跡
  const [localReactedIds, setLocalReactedIds] = useState<Set<string>>(new Set());

  const cards = activeTab === 'follow' ? followCards : globalCards;
  const isLoading = activeTab === 'follow' ? isLoadingFollow : isLoadingGlobal;
  const error = activeTab === 'follow' ? errorFollow : errorGlobal;
  // 更新関数は将来のプルトゥリフレッシュ実装時に使用
  void onRefreshFollow;
  void onRefreshGlobal;

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

  const getUserReacted = (card: NewYearCard | NewYearCardWithReactions): boolean => {
    // ローカルでリアクション済みならtrue
    if (localReactedIds.has(card.id)) {
      return true;
    }
    // サーバーからの情報
    if ('userReacted' in card && card.userReacted === true) {
      return true;
    }
    return false;
  };

  // リアクションを送信
  const handleReaction = useCallback(async (card: NewYearCard | NewYearCardWithReactions) => {
    if (!signEvent || !userPubkey) {
      return;
    }
    
    // 既にリアクション済みか処理中ならスキップ
    if (getUserReacted(card) || reactingIds.has(card.id)) {
      return;
    }
    
    // 処理中としてマーク
    setReactingIds(prev => new Set(prev).add(card.id));
    
    try {
      await sendReaction(card.id, card.pubkey, '❤️', signEvent);
      // ローカルでリアクション済みとしてマーク
      setLocalReactedIds(prev => new Set(prev).add(card.id));
    } catch (error) {
      console.error('リアクション送信エラー:', error);
    } finally {
      setReactingIds(prev => {
        const next = new Set(prev);
        next.delete(card.id);
        return next;
      });
    }
  }, [signEvent, userPubkey, reactingIds, localReactedIds]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    // 絶対日時表示 (YYYY/MM/DD HH:mm:ss)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  };

  return (
    <div className={styles.timeline}>
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
                  <div className={styles.postImage}>
                    {card.svg ? (
                      <SvgRenderer svg={card.svg} className={styles.svg} />
                    ) : (
                      <div className={styles.placeholder}>🎨</div>
                    )}
                  </div>

                  {/* フッター（リアクション・描き足し） */}
                  <div className={styles.postFooter}>
                    <div className={styles.footerActions}>
                      <button
                        className={`${styles.reactionButton} ${getUserReacted(card) ? styles.reacted : ''}`}
                        onClick={() => handleReaction(card)}
                        disabled={!signEvent || !userPubkey || getUserReacted(card) || reactingIds.has(card.id)}
                        title={getUserReacted(card) ? t('viewer.reacted') : t('viewer.reaction')}
                      >
                        {reactingIds.has(card.id) ? '💓' : getUserReacted(card) ? '❤️' : '🤍'} {reactionCount + (localReactedIds.has(card.id) && !('userReacted' in card && card.userReacted) ? 1 : 0)}
                      </button>
                      {card.allowExtend && onExtend && (
                        <button
                          className={styles.extendButton}
                          onClick={() => onExtend(card)}
                          title={t('viewer.extend')}
                        >
                          ✏️ {t('viewer.extend')}
                        </button>
                      )}
                    </div>
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

      {/* 下部固定タブバー */}
      <div className={styles.bottomTabs}>
        <button
          className={`${styles.bottomTab} ${activeTab === 'follow' ? styles.active : ''}`}
          onClick={() => setActiveTab('follow')}
          disabled={!userPubkey}
        >
          <span className={styles.tabIcon}>👥</span>
          <span className={styles.tabLabel}>{t('timeline.follow')}</span>
        </button>
        
        {onCreatePost && (
          <button 
            className={styles.createButton}
            onClick={onCreatePost}
          >
            <span className={styles.createIcon}>＋</span>
            <span className={styles.tabLabel}>{t('timeline.createPost')}</span>
          </button>
        )}
        
        <button
          className={`${styles.bottomTab} ${activeTab === 'global' ? styles.active : ''}`}
          onClick={() => setActiveTab('global')}
        >
          <span className={styles.tabIcon}>🌐</span>
          <span className={styles.tabLabel}>{t('timeline.global')}</span>
        </button>
      </div>
    </div>
  );
}

