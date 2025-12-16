// フォント選択コンポーネント

import { JAPANESE_FONTS, FONT_CATEGORIES } from '../../../data/fonts';
import type { MessageBox } from './types';
import styles from './DrawingCanvas.module.css';

interface FontSelectorProps {
  messageBox: MessageBox;
  fontCategory: string;
  onMessageBoxChange: (box: MessageBox) => void;
  onFontCategoryChange: (category: string) => void;
}

export function FontSelector({
  messageBox,
  fontCategory,
  onMessageBoxChange,
  onFontCategoryChange,
}: FontSelectorProps) {
  return (
    <div className={styles.fontSection}>
      <div className={styles.fontCategoryTabs}>
        <button
          className={`${styles.fontCategoryTab} ${fontCategory === 'all' ? styles.active : ''}`}
          onClick={() => onFontCategoryChange('all')}
        >
          すべて
        </button>
        {(Object.keys(FONT_CATEGORIES) as Array<keyof typeof FONT_CATEGORIES>).map((cat) => (
          <button
            key={cat}
            className={`${styles.fontCategoryTab} ${fontCategory === cat ? styles.active : ''}`}
            onClick={() => onFontCategoryChange(cat)}
          >
            {FONT_CATEGORIES[cat]}
          </button>
        ))}
      </div>
      <div className={styles.fontList}>
        {JAPANESE_FONTS
          .filter(font => fontCategory === 'all' || font.category === fontCategory)
          .map((font) => (
            <button
              key={font.id}
              className={`${styles.fontButton} ${messageBox.fontId === font.id ? styles.active : ''}`}
              style={{ fontFamily: font.family }}
              onClick={() => onMessageBoxChange({ 
                ...messageBox, 
                fontFamily: font.family,
                fontId: font.id,
              })}
            >
              {font.name}
            </button>
          ))}
      </div>
    </div>
  );
}

