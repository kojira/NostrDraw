// ユーザーギャラリーページ - 特定ユーザーの公開投稿一覧

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { NostrDrawPost, NostrProfile } from '../../types';
import type { Event, EventTemplate } from 'nostr-tools';
import { refreshProfile, npubToPubkey, pubkeyToNpub, isFollowing, followUser, unfollowUser, updateProfile } from '../../services/profile';
import { fetchPalettesByAuthor, type ColorPalette, addFavoritePalette, removeFavoritePalette, isFavoritePalette, loadPalettesFromLocal, savePalettesToLocal, generatePaletteId } from '../../services/palette';
import { Gallery } from '../Gallery/Gallery';
import { ProfileEditModal } from './ProfileEditModal';
import styles from './UserGallery.module.css';

interface UserGalleryProps {
  npub: string;
  userPubkey?: string | null;
  signEvent?: (event: EventTemplate) => Promise<Event>;
  onExtend?: (card: NostrDrawPost) => void;
  onBack: () => void;
  onFollowChange?: () => void; // フォロー状態変更時のコールバック
}

// npubコピー状態
type CopyState = 'idle' | 'copied';

export function UserGallery({
  npub,
  userPubkey,
  signEvent,
  onExtend,
  onBack,
  onFollowChange,
}: UserGalleryProps) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<NostrProfile | null>(null);
  const [following, setFollowing] = useState<boolean | null>(null); // null = 読み込み中
  const [isUpdatingFollow, setIsUpdatingFollow] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  
  // パレット関連の状態
  const [palettes, setPalettes] = useState<ColorPalette[]>([]);
  const [palettesLoading, setPalettesLoading] = useState(false);
  const [favoritePalettes, setFavoritePalettes] = useState<Set<string>>(new Set());
  const [importedPaletteId, setImportedPaletteId] = useState<string | null>(null);

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

  // プロフィールを取得（プロフィールページでは常に最新を取得）
  useEffect(() => {
    if (pubkey) {
      refreshProfile(pubkey).then((p) => {
        if (p) setProfile(p);
      });
    }
  }, [pubkey]);

  // フォロー状態を取得
  useEffect(() => {
    if (userPubkey && pubkey && userPubkey !== pubkey) {
      setFollowing(null); // 読み込み中
      isFollowing(userPubkey, pubkey).then(setFollowing);
    } else {
      setFollowing(null);
    }
  }, [userPubkey, pubkey]);

  // パレットを取得
  useEffect(() => {
    if (!pubkey) return;
    
    setPalettesLoading(true);
    fetchPalettesByAuthor(pubkey).then((fetchedPalettes) => {
      setPalettes(fetchedPalettes);
      
      // お気に入り状態を初期化
      const favorites = new Set<string>();
      fetchedPalettes.forEach(p => {
        if (p.eventId && isFavoritePalette(p.eventId)) {
          favorites.add(p.eventId);
        }
      });
      setFavoritePalettes(favorites);
    }).catch((err) => {
      console.error('パレット取得エラー:', err);
    }).finally(() => {
      setPalettesLoading(false);
    });
  }, [pubkey]);

  // フォロー/アンフォロー処理
  const handleFollowToggle = useCallback(async () => {
    if (!userPubkey || !pubkey || !signEvent || isUpdatingFollow) return;

    setIsUpdatingFollow(true);
    try {
      if (following) {
        const success = await unfollowUser(pubkey, userPubkey, signEvent);
        if (success) {
          setFollowing(false);
          onFollowChange?.();
        }
      } else {
        const success = await followUser(pubkey, userPubkey, signEvent);
        if (success) {
          setFollowing(true);
          onFollowChange?.();
        }
      }
    } catch (error) {
      console.error('フォロー状態の変更に失敗:', error);
    } finally {
      setIsUpdatingFollow(false);
    }
  }, [userPubkey, pubkey, signEvent, following, isUpdatingFollow, onFollowChange]);

  // 自分自身かどうか
  const isSelf = userPubkey === pubkey;

  // パレットのお気に入り切り替え（お気に入り追加時は自動インポート）
  const handleToggleFavorite = useCallback((palette: ColorPalette) => {
    if (!palette.eventId) return;
    
    const eventId = palette.eventId;
    if (favoritePalettes.has(eventId)) {
      // お気に入りから削除（ローカルのパレットは残す）
      removeFavoritePalette(eventId);
      setFavoritePalettes(prev => {
        const newSet = new Set(prev);
        newSet.delete(eventId);
        return newSet;
      });
    } else {
      // お気に入りに追加して、ローカルにもインポート
      addFavoritePalette(eventId);
      setFavoritePalettes(prev => new Set(prev).add(eventId));
      
      // 自動インポート
      const localPalettes = loadPalettesFromLocal();
      const existsLocally = localPalettes.some(p => p.eventId === eventId);
      if (!existsLocally) {
        const newPalette: ColorPalette = {
          id: generatePaletteId(),
          name: palette.name,
          colors: palette.colors.slice(0, 64),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          eventId: eventId,
        };
        localPalettes.push(newPalette);
        savePalettesToLocal(localPalettes);
      }
    }
  }, [favoritePalettes]);

  // パレットをローカルにインポート
  const handleImportPalette = useCallback((palette: ColorPalette) => {
    const localPalettes = loadPalettesFromLocal();
    
    // 新しいパレットとして追加
    const newPalette: ColorPalette = {
      id: generatePaletteId(),
      name: palette.name,
      colors: palette.colors.slice(0, 64), // 最大64色
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    localPalettes.push(newPalette);
    
    savePalettesToLocal(localPalettes);
    setImportedPaletteId(palette.eventId || null);
    setTimeout(() => setImportedPaletteId(null), 2000);
  }, []);

  // プロフィール保存
  const handleSaveProfile = useCallback(async (newProfile: { name: string; about: string; picture: string }) => {
    if (!pubkey || !signEvent) return false;
    
    setIsUpdatingProfile(true);
    try {
      const success = await updateProfile(newProfile, pubkey, signEvent);
      if (success) {
        // プロフィールを再取得
        const updated = await refreshProfile(pubkey);
        if (updated) setProfile(updated);
      }
      return success;
    } catch (error) {
      console.error('プロフィール更新エラー:', error);
      return false;
    } finally {
      setIsUpdatingProfile(false);
    }
  }, [pubkey, signEvent]);

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
          
          {/* フォローボタン（他人のプロフィール） */}
          {!isSelf && userPubkey && signEvent && (
            <button
              className={`${styles.followButton} ${following ? styles.following : ''}`}
              onClick={handleFollowToggle}
              disabled={following === null || isUpdatingFollow}
            >
              {isUpdatingFollow ? (
                t('profile.updating')
              ) : following === null ? (
                t('profile.loading')
              ) : following ? (
                t('profile.following')
              ) : (
                t('profile.follow')
              )}
            </button>
          )}

          {/* 編集ボタン（自分のプロフィール） */}
          {isSelf && signEvent && (
            <button
              className={styles.editButton}
              onClick={() => setShowEditModal(true)}
            >
              <span className="material-symbols-outlined">edit</span>
              {t('profile.editProfile')}
            </button>
          )}
        </div>
      </div>

      {/* プロフィール編集モーダル */}
      {showEditModal && signEvent && (
        <ProfileEditModal
          profile={profile}
          isLoading={isUpdatingProfile}
          onSave={handleSaveProfile}
          onClose={() => setShowEditModal(false)}
          signEvent={signEvent}
        />
      )}

      {/* パレットセクション */}
      {!palettesLoading && palettes.length > 0 && (
        <div className={styles.palettesSection}>
          <h2 className={styles.sectionTitle}>🎨 {t('gallery.palettes')}</h2>
          <div className={styles.paletteGrid}>
            {palettes.map((palette) => {
              const isFavorite = palette.eventId ? favoritePalettes.has(palette.eventId) : false;
              const isImported = palette.eventId === importedPaletteId;

              return (
                <div key={palette.eventId || palette.id} className={styles.paletteItem}>
                  <div className={styles.paletteHeader}>
                    <span className={styles.paletteName}>{palette.name}</span>
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
                      <button
                        className={styles.paletteActionButton}
                        onClick={() => handleImportPalette(palette)}
                        title={t('gallery.importPalette')}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                          {isImported ? 'check' : 'download'}
                        </span>
                      </button>
                    </div>
                  </div>
                  <div className={styles.paletteColors}>
                    {palette.colors.slice(0, 24).map((color, idx) => (
                      <div
                        key={idx}
                        className={styles.paletteColorSwatch}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                  <span className={styles.paletteColorCount}>
                    {t('gallery.colorsCount', { count: palette.colors.length })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
