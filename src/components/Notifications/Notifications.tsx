// 通知一覧コンポーネント

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { NostrDrawPost, NostrProfile } from '../../types';
import { fetchNotifications, type Notification } from '../../services/notification';
import { fetchProfiles, pubkeyToNpub } from '../../services/profile';
import { CardFlip } from '../CardViewer/CardFlip';
import type { Event, EventTemplate } from 'nostr-tools';
import { Spinner } from '../common/Spinner';
import styles from './Notifications.module.css';

interface NotificationsProps {
  userPubkey: string;
  signEvent?: (event: EventTemplate) => Promise<Event>;
  onNavigateToUser?: (npub: string) => void;
}

export function Notifications({
  userPubkey,
  signEvent,
  onNavigateToUser,
}: NotificationsProps) {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState<NostrDrawPost | null>(null);

  // 通知を取得
  useEffect(() => {
    const loadNotifications = async () => {
      setIsLoading(true);
      try {
        const result = await fetchNotifications(userPubkey);
        setNotifications(result);

        // プロフィールを取得
        const pubkeys = [...new Set(result.map(n => n.fromPubkey))];
        if (pubkeys.length > 0) {
          const profilesMap = await fetchProfiles(pubkeys);
          setProfiles(profilesMap);
        }
      } catch (error) {
        console.error('通知取得エラー:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadNotifications();
  }, [userPubkey]);

  // 日時フォーマット
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}`;
  };

  // ユーザー名を取得
  const getUserName = (pubkey: string) => {
    const profile = profiles.get(pubkey);
    if (profile?.display_name) return profile.display_name;
    if (profile?.name) return profile.name;
    return pubkeyToNpub(pubkey).slice(0, 12) + '...';
  };

  // ユーザーアイコンを取得
  const getUserPicture = (pubkey: string) => {
    const profile = profiles.get(pubkey);
    return profile?.picture;
  };

  // 通知をクリック
  const handleNotificationClick = (notification: Notification) => {
    if (notification.type === 'extend' && notification.extendCard) {
      setSelectedCard(notification.extendCard);
    } else if (notification.targetCard) {
      setSelectedCard(notification.targetCard);
    }
  };

  // ユーザーをクリック
  const handleUserClick = (pubkey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onNavigateToUser) {
      onNavigateToUser(pubkeyToNpub(pubkey));
    }
  };

  // ツリー内のカードへナビゲート
  const handleNavigateToCard = useCallback((card: NostrDrawPost) => {
    setSelectedCard(card);
  }, []);

  return (
    <div className={styles.container}>
      {/* ヘッダー */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>🔔 {t('notifications.title', '通知')}</h1>
        </div>
      </header>

      {/* 通知リスト */}
      <div className={styles.notificationList}>
        {isLoading ? (
          <div className={styles.loading}>
            <Spinner size="lg" />
            <span>{t('card.loading', '読み込み中...')}</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className={styles.empty}>{t('notifications.empty', '通知はありません')}</div>
        ) : (
          notifications.map(notification => (
            <div
              key={notification.id}
              className={styles.notificationItem}
              onClick={() => handleNotificationClick(notification)}
            >
              {/* ユーザーアイコン */}
              <div 
                className={styles.userIcon}
                onClick={(e) => handleUserClick(notification.fromPubkey, e)}
              >
                {getUserPicture(notification.fromPubkey) ? (
                  <img
                    src={getUserPicture(notification.fromPubkey)}
                    alt=""
                    className={styles.avatar}
                  />
                ) : (
                  <div className={styles.avatarPlaceholder}>👤</div>
                )}
              </div>

              {/* 通知内容 */}
              <div className={styles.notificationContent}>
                <div className={styles.notificationText}>
                  <span 
                    className={styles.userName}
                    onClick={(e) => handleUserClick(notification.fromPubkey, e)}
                  >
                    {getUserName(notification.fromPubkey)}
                  </span>
                  <span className={styles.notificationAction}>
                    {notification.type === 'reaction'
                      ? t('notifications.reaction', 'があなたの投稿にいいねしました')
                      : t('notifications.extend', 'があなたの投稿に描き足ししました')}
                  </span>
                </div>
                <div className={styles.notificationMeta}>
                  <span className={styles.notificationType}>
                    {notification.type === 'reaction' ? '❤️' : '🎨'}
                  </span>
                  <span className={styles.notificationDate}>
                    {formatDate(notification.createdAt)}
                  </span>
                </div>
              </div>

              {/* サムネイル */}
              {notification.targetCard && (
                <div className={styles.thumbnail}>
                  <div
                    className={styles.thumbnailImage}
                    dangerouslySetInnerHTML={{ __html: notification.targetCard.svg }}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* カード詳細モーダル */}
      {selectedCard && (
        <CardFlip
          card={selectedCard}
          userPubkey={userPubkey}
          signEvent={signEvent}
          onClose={() => setSelectedCard(null)}
          onNavigateToCard={handleNavigateToCard}
        />
      )}
    </div>
  );
}

