// パレットギャラリーコンポーネント
// 公開されているカラーパレットを閲覧・インポートできる

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchPublicPalettes, type ColorPalette } from '../../services/palette';
import { fetchProfile, pubkeyToNpub } from '../../services/profile';
import type { NostrProfile } from '../../types';
import styles from './PaletteGallery.module.css';

interface PaletteGalleryProps {
  onImportPalette: (palette: ColorPalette) => void;
}

export function PaletteGallery({ onImportPalette }: PaletteGalleryProps) {
  const { t } = useTranslation();
  const [palettes, setPalettes] = useState<ColorPalette[]>([]);
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());

  // パレットを取得
  useEffect(() => {
    async function loadPalettes() {
      setIsLoading(true);
      try {
        const fetchedPalettes = await fetchPublicPalettes(30);
        setPalettes(fetchedPalettes);
        
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

  const handleImport = useCallback((palette: ColorPalette) => {
    onImportPalette(palette);
    setImportedIds(prev => new Set(prev).add(palette.id));
  }, [onImportPalette]);

  const getAuthorName = (pubkey?: string) => {
    if (!pubkey) return '不明';
    const profile = profiles.get(pubkey);
    return profile?.display_name || profile?.name || pubkeyToNpub(pubkey).slice(0, 12) + '...';
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
      {palettes.map(palette => (
        <div key={palette.eventId || palette.id} className={styles.paletteCard}>
          <div className={styles.paletteHeader}>
            <span className={styles.paletteName}>{palette.name}</span>
            <span className={styles.colorCount}>{palette.colors.length}色</span>
          </div>
          
          <div className={styles.colorPreview}>
            {palette.colors.slice(0, 10).map((color, i) => (
              <div
                key={i}
                className={styles.colorSwatch}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
            {palette.colors.length > 10 && (
              <span className={styles.moreColors}>+{palette.colors.length - 10}</span>
            )}
          </div>
          
          <div className={styles.paletteFooter}>
            <span className={styles.author}>
              by {getAuthorName(palette.pubkey)}
            </span>
            <span className={styles.date}>
              {formatDate(palette.createdAt)}
            </span>
          </div>
          
          <button
            className={`${styles.importButton} ${importedIds.has(palette.id) ? styles.imported : ''}`}
            onClick={() => handleImport(palette)}
            disabled={importedIds.has(palette.id)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
              {importedIds.has(palette.id) ? 'check' : 'download'}
            </span>
            {importedIds.has(palette.id) ? 'インポート済み' : 'インポート'}
          </button>
        </div>
      ))}
    </div>
  );
}
