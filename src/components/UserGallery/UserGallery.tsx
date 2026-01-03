// ユーザーギャラリーページ - 特定ユーザーの公開投稿一覧

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { NewYearCard, NostrProfile } from '../../types';
import type { Event, EventTemplate } from 'nostr-tools';
import { fetchProfile, npubToPubkey, pubkeyToNpub } from '../../services/profile';
import { Gallery } from '../Gallery/Gallery';
import styles from './UserGallery.module.css';

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
  const [profile, setProfile] = useState<NostrProfile | null>(null);

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

      {/* Galleryコンポーネントを再利用 */}
      {pubkey && (
        <Gallery
          initialTab="popular"
          initialPeriod="all"
          initialAuthor={pubkey}
          userPubkey={userPubkey}
          signEvent={signEvent}
          onExtend={onExtend}
          onBack={onBack}
          showBreadcrumb={false}
          showAuthorFilter={false}
        />
      )}
    </div>
  );
}
