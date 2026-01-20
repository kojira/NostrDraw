// パレットギャラリーコンポーネント
// 公開されているカラーパレットを閲覧・お気に入り登録できる

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Event, EventTemplate } from 'nostr-tools';
import { fetchPublicPalettes, type ColorPalette, addFavoritePalette, removeFavoritePalette, getFavoritePaletteIds, saveFavoritePalettesToNostr } from '../../services/palette';
import { fetchProfile, pubkeyToNpub } from '../../services/profile';
import type { NostrProfile } from '../../types';
import styles from './PaletteGallery.module.css';

interface PaletteGalleryProps {
  onFavoriteChange?: () => void; // お気に入りが変更されたときのコールバック
  signEvent?: (event: EventTemplate) => Promise<Event>; // Nostrに保存するための署名関数
}

export function PaletteGallery({ onFavoriteChange, signEvent }: PaletteGalleryProps) {
  const { t } = useTranslation();
  const [palettes, setPalettes] = useState<ColorPalette[]>([]);
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  // パレットを取得
  useEffect(() => {
    async function loadPalettes() {
      setIsLoading(true);
      try {
        const fetchedPalettes = await fetchPublicPalettes(30);
        setPalettes(fetchedPalettes);
        
        // お気に入りIDを取得
        const favIds = getFavoritePaletteIds();
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
    const eventId = palette.eventId;
    if (!eventId) return;
    
    let newFavoriteIds: string[];
    
    if (favoriteIds.has(eventId)) {
      removeFavoritePalette(eventId);
      setFavoriteIds(prev => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
      newFavoriteIds = getFavoritePaletteIds();
    } else {
      addFavoritePalette(eventId);
      setFavoriteIds(prev => new Set(prev).add(eventId));
      newFavoriteIds = getFavoritePaletteIds();
    }
    
    // Nostrにも保存
    if (signEvent) {
      saveFavoritePalettesToNostr(newFavoriteIds, signEvent).catch(err => {
        console.error('Failed to save favorites to Nostr:', err);
      });
    }
    
    onFavoriteChange?.();
  }, [favoriteIds, onFavoriteChange, signEvent]);

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

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <span className="material-symbols-outlined">hourglass_empty</span>
        {t('card.loading')}
      </div>
    );
  }

  if (palettes.length === 0) {
    return (
      <div className={styles.empty}>
        公開されているパレットがありません
      </div>
    );
  }

  return (
    <div className={styles.gallery}>
      {palettes.map(palette => {
        const isFavorite = palette.eventId ? favoriteIds.has(palette.eventId) : false;
        const authorPicture = getAuthorPicture(palette.pubkey);
        
        return (
          <div key={palette.eventId || palette.id} className={styles.paletteCard}>
            <div className={styles.paletteHeader}>
              <div className={styles.authorInfo}>
                {authorPicture && (
                  <img src={authorPicture} alt="" className={styles.authorAvatar} />
                )}
                <span className={styles.authorName}>{getAuthorName(palette.pubkey)}</span>
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
              {palette.colors.slice(0, 12).map((color, i) => (
                <div
                  key={i}
                  className={styles.colorSwatch}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
              {palette.colors.length > 12 && (
                <span className={styles.moreColors}>+{palette.colors.length - 12}</span>
              )}
            </div>
            
            <div className={styles.paletteFooter}>
              <span className={styles.colorCount}>{palette.colors.length}色</span>
              <span className={styles.date}>{formatDate(palette.createdAt)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
