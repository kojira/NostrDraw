// パレットギャラリーコンポーネント
// 公開されているカラーパレットを閲覧・お気に入り登録できる

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Event, EventTemplate } from 'nostr-tools';
import { fetchPublicPalettes, type ColorPalette, addFavoritePalette, removeFavoritePalette, getFavoritePaletteIds, saveFavoritePalettesToNostr, PRESET_PALETTES, isPresetPalette } from '../../services/palette';
import { fetchProfile, pubkeyToNpub } from '../../services/profile';
import type { NostrProfile } from '../../types';
import styles from './PaletteGallery.module.css';

interface PaletteGalleryProps {
  onFavoriteChange?: () => void; // お気に入りが変更されたときのコールバック
  signEvent?: (event: EventTemplate) => Promise<Event>; // Nostrに保存するための署名関数
  userPubkey?: string | null; // ユーザーのpubkey
}

export function PaletteGallery({ onFavoriteChange, signEvent, userPubkey }: PaletteGalleryProps) {
  const { t } = useTranslation();
  const [userPalettes, setUserPalettes] = useState<ColorPalette[]>([]);
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  // パレットを取得
  useEffect(() => {
    async function loadPalettes() {
      setIsLoading(true);
      try {
        const fetchedPalettes = await fetchPublicPalettes(50);
        setUserPalettes(fetchedPalettes);
        
        // お気に入りIDを取得
        const favIds = getFavoritePaletteIds(userPubkey || undefined);
        setFavoriteIds(new Set(favIds));
        
        // 著者のプロフィールを取得
        const pubkeys = [...new Set(fetchedPalettes.map(p => p.pubkey).filter(Boolean))] as string[];
        for (const pubkey of pubkeys) {
          const profile = await fetchProfile(pubkey);
          if (profile) {
            setProfiles(prev => new Map(prev).set(pubkey, profile));
          }
        }
      } catch (error) {
        console.error('Failed to load palettes:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadPalettes();
  }, []);

  const handleToggleFavorite = useCallback(async (palette: ColorPalette) => {
    // プリセットパレットはidを使用、ユーザーパレットはeventIdを使用
    const paletteKey = isPresetPalette(palette.id) ? palette.id : palette.eventId;
    if (!paletteKey) return;
    
    let newFavoriteIds: string[];
    const pubkey = userPubkey || undefined;
    
    if (favoriteIds.has(paletteKey)) {
      // お気に入りから削除
      removeFavoritePalette(paletteKey, pubkey);
      setFavoriteIds(prev => {
        const next = new Set(prev);
        next.delete(paletteKey);
        return next;
      });
      newFavoriteIds = getFavoritePaletteIds(pubkey);
    } else {
      // お気に入りに追加
      addFavoritePalette(paletteKey, pubkey);
      setFavoriteIds(prev => new Set(prev).add(paletteKey));
      newFavoriteIds = getFavoritePaletteIds(pubkey);
    }
    
    // Nostrにもお気に入りリストを保存
    if (signEvent) {
      saveFavoritePalettesToNostr(newFavoriteIds, signEvent).catch(err => {
        console.error('Failed to save favorites to Nostr:', err);
      });
    }
    
    onFavoriteChange?.();
  }, [favoriteIds, onFavoriteChange, signEvent, userPubkey]);

  const getAuthorName = (pubkey?: string) => {
    if (!pubkey) return '不明';
    const profile = profiles.get(pubkey);
    return profile?.display_name || profile?.name || pubkeyToNpub(pubkey).slice(0, 12) + '...';
  };

  const getAuthorPicture = (pubkey?: string) => {
    if (!pubkey) return undefined;
    return profiles.get(pubkey)?.picture;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  };

  // パレットカードをレンダリング
  const renderPaletteCard = (palette: ColorPalette, isPreset: boolean) => {
    const paletteKey = isPreset ? palette.id : palette.eventId;
    const isFavorite = paletteKey ? favoriteIds.has(paletteKey) : false;
    const authorPicture = isPreset ? undefined : getAuthorPicture(palette.pubkey);
    
    return (
      <div key={palette.eventId || palette.id} className={`${styles.paletteCard} ${isPreset ? styles.presetCard : ''}`}>
        <div className={styles.paletteHeader}>
          <div className={styles.authorInfo}>
            {isPreset ? (
              <span className={styles.presetBadge}>プリセット</span>
            ) : (
              <>
                {authorPicture && (
                  <img src={authorPicture} alt="" className={styles.authorAvatar} />
                )}
                <span className={styles.authorName}>{getAuthorName(palette.pubkey)}</span>
              </>
            )}
          </div>
          <button
            className={`${styles.favoriteButton} ${isFavorite ? styles.favorited : ''}`}
            onClick={() => handleToggleFavorite(palette)}
            title={isFavorite ? 'お気に入りから削除' : 'お気に入りに追加'}
          >
            <span 
              className="material-symbols-outlined" 
              style={{ 
                fontSize: '20px', 
                fontVariationSettings: isFavorite ? "'FILL' 1" : "'FILL' 0" 
              }}
            >
              star
            </span>
          </button>
        </div>
        
        <div className={styles.paletteName}>{palette.name}</div>
        
        <div className={styles.colorPreview}>
          {palette.colors.map((color, i) => (
            <div
              key={i}
              className={palette.colors.length > 32 ? styles.colorSwatchSmall : styles.colorSwatch}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
        
        <div className={styles.paletteFooter}>
          <span className={styles.colorCount}>{palette.colors.length}色</span>
          {!isPreset && <span className={styles.date}>{formatDate(palette.createdAt)}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      {/* プリセットパレットセクション */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>palette</span>
          プリセットパレット
        </h3>
        <div className={styles.gallery}>
          {PRESET_PALETTES.map(palette => renderPaletteCard(palette, true))}
        </div>
      </section>

      {/* ユーザー作成パレットセクション */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>group</span>
          みんなのパレット
        </h3>
        {isLoading ? (
          <div className={styles.loading}>
            <span className="material-symbols-outlined">hourglass_empty</span>
            {t('card.loading')}
          </div>
        ) : userPalettes.length === 0 ? (
          <div className={styles.empty}>
            公開されているパレットがありません
          </div>
        ) : (
          <div className={styles.gallery}>
            {userPalettes.map(palette => renderPaletteCard(palette, false))}
          </div>
        )}
      </section>
    </div>
  );
}
