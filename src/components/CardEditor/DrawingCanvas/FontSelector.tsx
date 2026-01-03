// フォント選択コンポーネント（ドロップダウン形式）

import { useState, useRef, useEffect } from 'react';
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
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 現在選択されているフォント
  const currentFont = JAPANESE_FONTS.find(f => f.id === messageBox.fontId) || JAPANESE_FONTS[0];

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleFontSelect = (font: typeof JAPANESE_FONTS[0]) => {
    onMessageBoxChange({ 
      ...messageBox, 
      fontFamily: font.family,
      fontId: font.id,
    });
    setIsOpen(false);
  };

  const filteredFonts = JAPANESE_FONTS.filter(
    font => fontCategory === 'all' || font.category === fontCategory
  );

  return (
    <div className={styles.fontSelectorDropdown} ref={dropdownRef}>
      {/* 選択されたフォント表示ボタン */}
      <button
        className={styles.fontDropdownTrigger}
        onClick={() => setIsOpen(!isOpen)}
        style={{ fontFamily: currentFont.family }}
      >
        <span className={styles.fontDropdownLabel}>フォント:</span>
        <span className={styles.fontDropdownValue}>{currentFont.name}</span>
        <span className={styles.fontDropdownArrow}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* ドロップダウンメニュー */}
      {isOpen && (
        <div className={styles.fontDropdownMenu}>
          {/* カテゴリタブ */}
          <div className={styles.fontCategoryTabsCompact}>
            <button
              className={`${styles.fontCategoryTabCompact} ${fontCategory === 'all' ? styles.active : ''}`}
              onClick={() => onFontCategoryChange('all')}
            >
              すべて
            </button>
            {(Object.keys(FONT_CATEGORIES) as Array<keyof typeof FONT_CATEGORIES>).map((cat) => (
              <button
                key={cat}
                className={`${styles.fontCategoryTabCompact} ${fontCategory === cat ? styles.active : ''}`}
                onClick={() => onFontCategoryChange(cat)}
              >
                {FONT_CATEGORIES[cat]}
              </button>
            ))}
          </div>

          {/* フォントリスト */}
          <div className={styles.fontListCompact}>
            {filteredFonts.map((font) => (
              <button
                key={font.id}
                className={`${styles.fontButtonCompact} ${messageBox.fontId === font.id ? styles.active : ''}`}
                style={{ fontFamily: font.family }}
                onClick={() => handleFontSelect(font)}
              >
                {font.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
