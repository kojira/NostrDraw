// 干支ギャラリーコンポーネント

import { useMemo } from 'react';
import type { EtoImage } from '../../../types';
import styles from './EtoGallery.module.css';

// SVGをdata URIに変換
function svgToDataUri(svg: string): string {
  const encoded = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${encoded}`;
}

interface EtoGalleryProps {
  images: EtoImage[];
  selectedSvg: string | null;
  onSelect: (svg: string) => void;
}

export function EtoGallery({
  images,
  selectedSvg,
  onSelect,
}: EtoGalleryProps) {
  // 選択中の画像のdata URI
  const selectedDataUri = useMemo(() => {
    return selectedSvg ? svgToDataUri(selectedSvg) : null;
  }, [selectedSvg]);

  return (
    <div className={styles.etoGallery}>
      <h3 className={styles.title}>干支ギャラリー</h3>
      <p className={styles.subtitle}>2026年は午年（うま年）🐴</p>

      {images.length > 0 ? (
        <div className={styles.grid}>
          {images.map((image) => {
            const dataUri = svgToDataUri(image.svg);
            const isSelected = selectedSvg === image.svg;
            return (
              <button
                key={image.id}
                className={`${styles.imageButton} ${isSelected ? styles.selected : ''}`}
                onClick={() => onSelect(image.svg)}
              >
                <img
                  src={dataUri}
                  alt={image.name}
                  className={styles.image}
                />
                <span className={styles.imageName}>{image.name}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={styles.placeholder}>
          <p>干支画像は準備中です</p>
        </div>
      )}

      {/* 選択中の画像プレビュー */}
      {selectedDataUri && (
        <div className={styles.preview}>
          <span className={styles.previewLabel}>選択中:</span>
          <img
            src={selectedDataUri}
            alt="選択中の画像"
            className={styles.previewImage}
          />
        </div>
      )}
    </div>
  );
}

// デフォルトの干支画像（プレースホルダー）
export const DEFAULT_ETO_IMAGES: EtoImage[] = [];

