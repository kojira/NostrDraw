// レイアウト選択コンポーネント

import type { LayoutType } from '../../../types';
import { LAYOUT_OPTIONS } from '../../../types';
import styles from './LayoutSelector.module.css';

interface LayoutSelectorProps {
  selectedLayout: LayoutType;
  onSelect: (layout: LayoutType) => void;
}

export function LayoutSelector({ selectedLayout, onSelect }: LayoutSelectorProps) {
  return (
    <div className={styles.layoutSelector}>
      <h3 className={styles.title}>レイアウトを選択</h3>
      
      <div className={styles.grid}>
        {LAYOUT_OPTIONS.map((option) => (
          <button
            key={option.id}
            className={`${styles.option} ${selectedLayout === option.id ? styles.selected : ''}`}
            onClick={() => onSelect(option.id)}
          >
            <LayoutPreview layout={option.id} />
            <span className={styles.optionName}>{option.name}</span>
            <span className={styles.optionDesc}>{option.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// レイアウトプレビューコンポーネント
function LayoutPreview({ layout }: { layout: LayoutType }) {
  return (
    <div className={`${styles.preview} ${styles[`preview_${layout}`]}`}>
      {layout === 'vertical' && (
        <>
          <div className={styles.previewImage}>🖼️</div>
          <div className={styles.previewText}>文</div>
        </>
      )}
      {layout === 'horizontal' && (
        <>
          <div className={styles.previewImage}>🖼️</div>
          <div className={styles.previewText}>文</div>
        </>
      )}
      {layout === 'fullscreen' && (
        <div className={styles.previewOverlay}>
          <div className={styles.previewImage}>🖼️</div>
          <div className={styles.previewTextOverlay}>文</div>
        </div>
      )}
      {layout === 'classic' && (
        <div className={styles.previewClassic}>
          <div className={styles.previewBorder}>
            <div className={styles.previewImage}>🖼️</div>
            <div className={styles.previewText}>文</div>
          </div>
        </div>
      )}
    </div>
  );
}

