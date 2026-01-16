// タイムラインコンポーネント - フォロー/グローバルタブ切り替え

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { NostrDrawPost, NostrProfile } from '../../types';
import { sendReaction, type NostrDrawPostWithReactions } from '../../services/card';
import { fetchProfile, pubkeyToNpub } from '../../services/profile';
import { BASE_URL } from '../../config';
import type { EventTemplate, Event } from 'nostr-tools';
import { Icon } from '../common/Icon';
import { Spinner } from '../common/Spinner';
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
  followCards: (NostrDrawPost | NostrDrawPostWithReactions)[];
  globalCards: (NostrDrawPost | NostrDrawPostWithReactions)[];
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
  onExtend?: (card: NostrDrawPost) => void; // 描き足しボタン押下時
  onCardClick?: (card: NostrDrawPost) => void; // カードクリック時（大きく表示）
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
  onCardClick,
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
  // コピー済みのイベントIDを追跡（一時的なフィードバック用）
  const [copiedIds, setCopiedIds] = useState<Set<string>>(new Set());

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

  const getReactionCount = (card: NostrDrawPost | NostrDrawPostWithReactions): number => {
    if ('reactionCount' in card) {
      return card.reactionCount;
    }
    return 0;
  };

  const getUserReacted = (card: NostrDrawPost | NostrDrawPostWithReactions): boolean => {
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
  const handleReaction = useCallback(async (card: NostrDrawPost | NostrDrawPostWithReactions) => {
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

  // シェアボタンのハンドラ
  const handleShare = useCallback(async (card: NostrDrawPost | NostrDrawPostWithReactions) => {
    const url = `${BASE_URL}/?eventid=${card.id}`;
    try {
      await navigator.clipboard.writeText(url);
      // コピー成功のフィードバック
      setCopiedIds(prev => new Set(prev).add(card.id));
      // 2秒後にフィードバックを消す
      setTimeout(() => {
        setCopiedIds(prev => {
          const next = new Set(prev);
          next.delete(card.id);
          return next;
        });
      }, 2000);
    } catch (error) {
      console.error('URLのコピーに失敗:', error);
    }
  }, []);

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
                      <button
                        className={`${styles.shareButton} ${copiedIds.has(card.id) ? styles.copied : ''}`}
                        onClick={() => handleShare(card)}
                        title={t('timeline.share')}
                      >
                        {copiedIds.has(card.id) ? (
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
          title={t('timeline.follow')}
        >
          <Icon name="group" size="lg" className={styles.tabIcon} />
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

