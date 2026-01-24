// タグ入力コンポーネント
// プリセットタグの選択と自由入力の両方に対応

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getPresetTags } from '../../../types';
import styles from './TagInput.module.css';

interface TagInputProps {
  /** 選択済みのタグ */
  selectedTags: string[];
  /** タグが変更されたときのコールバック */
  onChange: (tags: string[]) => void;
  /** 親から継承するタグ（描き足し時） */
  inheritedTags?: string[];
  /** 継承タグを使用するか */
  useInheritedTags?: boolean;
  /** 継承タグの使用を切り替えるコールバック */
  onInheritedTagsToggle?: (use: boolean) => void;
  /** 最大タグ数（0で無制限） */
  maxTags?: number;
  /** プレースホルダー */
  placeholder?: string;
  /** 無効化 */
  disabled?: boolean;
}

export function TagInput({
  selectedTags,
  onChange,
  inheritedTags = [],
  useInheritedTags = false,
  onInheritedTagsToggle,
  maxTags = 0,
  placeholder,
  disabled = false,
}: TagInputProps) {
  const { t, i18n } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [showPresets, setShowPresets] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 言語に応じたプリセットタグを取得
  const presetTags = useMemo(() => getPresetTags(i18n.language), [i18n.language]);

  // 外側クリックでプリセット一覧を閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowPresets(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // タグを追加
  const addTag = useCallback((tag: string) => {
    const trimmedTag = tag.trim();
    if (!trimmedTag) return;
    
    // 既に選択済みか継承済みならスキップ
    if (selectedTags.includes(trimmedTag)) return;
    if (useInheritedTags && inheritedTags.includes(trimmedTag)) return;
    
    // 最大数チェック
    if (maxTags > 0 && selectedTags.length >= maxTags) return;
    
    onChange([...selectedTags, trimmedTag]);
    setInputValue('');
  }, [selectedTags, inheritedTags, useInheritedTags, maxTags, onChange]);

  // タグを削除
  const removeTag = useCallback((tag: string) => {
    onChange(selectedTags.filter(t => t !== tag));
  }, [selectedTags, onChange]);

  // Enterキーで追加
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && selectedTags.length > 0) {
      // 入力が空でBackspaceを押したら最後のタグを削除
      removeTag(selectedTags[selectedTags.length - 1]);
    }
  }, [inputValue, selectedTags, addTag, removeTag]);

  // プリセットタグをクリック
  const handlePresetClick = useCallback((tag: string) => {
    addTag(tag);
  }, [addTag]);

  // 全てのタグ（継承 + 選択）
  const allTags = useInheritedTags 
    ? [...inheritedTags, ...selectedTags.filter(t => !inheritedTags.includes(t))]
    : selectedTags;

  // 選択可能なプリセット（既に選択済みのものを除外）
  const availablePresets = presetTags.filter(
    tag => !allTags.includes(tag)
  );

  return (
    <div className={styles.container} ref={containerRef}>
      {/* 継承タグの切り替え（描き足し時のみ） */}
      {inheritedTags.length > 0 && onInheritedTagsToggle && (
        <label className={styles.inheritToggle}>
          <input
            type="checkbox"
            checked={useInheritedTags}
            onChange={(e) => onInheritedTagsToggle(e.target.checked)}
            disabled={disabled}
          />
          <span>{t('tags.inheritFromParent', '元の作品のタグを引き継ぐ')}</span>
        </label>
      )}

      {/* 継承タグの表示 */}
      {useInheritedTags && inheritedTags.length > 0 && (
        <div className={styles.inheritedTags}>
          <span className={styles.inheritedLabel}>{t('tags.inherited', '継承')}:</span>
          {inheritedTags.map(tag => (
            <span key={tag} className={styles.inheritedTag}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* タグ入力エリア */}
      <div className={styles.inputArea}>
        {/* 選択済みタグ */}
        {selectedTags.map(tag => (
          <span key={tag} className={styles.tag}>
            {tag}
            <button
              type="button"
              className={styles.removeButton}
              onClick={() => removeTag(tag)}
              disabled={disabled}
              aria-label={t('tags.remove', '削除')}
            >
              ×
            </button>
          </span>
        ))}

        {/* 入力フィールド */}
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowPresets(true)}
          placeholder={selectedTags.length === 0 ? (placeholder || t('tags.placeholder', 'タグを追加...')) : ''}
          disabled={disabled || (maxTags > 0 && selectedTags.length >= maxTags)}
        />
      </div>

      {/* プリセットタグ一覧 */}
      {showPresets && availablePresets.length > 0 && !disabled && (
        <div className={styles.presets}>
          <div className={styles.presetsLabel}>{t('tags.presets', 'プリセット')}:</div>
          <div className={styles.presetTags}>
            {availablePresets.map(tag => (
              <button
                key={tag}
                type="button"
                className={styles.presetTag}
                onClick={() => handlePresetClick(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
