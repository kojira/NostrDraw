// タイムラインコンポーネント - フォロー/グローバルタブ切り替え

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { NewYearCard, NostrProfile } from '../../types';
import type { NewYearCardWithReactions } from '../../services/card';
import { fetchProfile, pubkeyToNpub } from '../../services/profile';
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
  onUserClick,
  onCreatePost,
}: TimelineProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('follow'); // デフォルトはフォロータブ
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(new Map());
  // 既に取得中または取得済みのpubkeyを追跡（重複フェッチ防止）
  const fetchedPubkeysRef = useRef<Set<string>>(new Set());

  const cards = activeTab === 'follow' ? followCards : globalCards;
  const isLoading = activeTab === 'follow' ? isLoadingFollow : isLoadingGlobal;
  const error = activeTab === 'follow' ? errorFollow : errorGlobal;
  const onRefresh = activeTab === 'follow' ? onRefreshFollow : onRefreshGlobal;

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
            title={t('timeline.createPost')}
          >
            <span className={styles.createIcon}>✏️</span>
          </button>
        )}
        
        <button
          className={`${styles.bottomTab} ${activeTab === 'global' ? styles.active : ''}`}
          onClick={() => setActiveTab('global')}
        >
          <span className={styles.tabIcon}>🌐</span>
          <span className={styles.tabLabel}>{t('timeline.global')}</span>
        </button>
        
        <button
          className={styles.bottomTab}
          onClick={onRefresh}
          disabled={isLoading}
        >
          <span className={styles.tabIcon}>🔄</span>
          <span className={styles.tabLabel}>更新</span>
        </button>
      </div>
    </div>
  );
}

