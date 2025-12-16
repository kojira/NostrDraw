// スタンプパレットコンポーネント

import { STAMPS } from '../../../data/templates';
import type { Stamp, StampTab, CustomEmoji } from './types';
import styles from './DrawingCanvas.module.css';

interface StampPaletteProps {
  stampTab: StampTab;
  selectedStamp: Stamp | null;
  selectedCustomEmoji: CustomEmoji | null;
  customEmojis: CustomEmoji[];
  isLoadingEmojis: boolean;
  onStampTabChange: (tab: StampTab) => void;
  onStampSelect: (stamp: Stamp | null) => void;
  onCustomEmojiSelect: (emoji: CustomEmoji | null) => void;
}

export function StampPalette({
  stampTab,
  selectedStamp,
  selectedCustomEmoji,
  customEmojis,
  isLoadingEmojis,
  onStampTabChange,
  onStampSelect,
  onCustomEmojiSelect,
}: StampPaletteProps) {
  return (
    <div className={styles.stampSection}>
      {/* スタンプタブ */}
      <div className={styles.stampTabs}>
        <button
          className={`${styles.stampTabButton} ${stampTab === 'builtin' ? styles.active : ''}`}
          onClick={() => {
            onStampTabChange('builtin');
            onCustomEmojiSelect(null);
          }}
        >
          🎨 内蔵スタンプ
        </button>
        <button
          className={`${styles.stampTabButton} ${stampTab === 'custom' ? styles.active : ''}`}
          onClick={() => {
            onStampTabChange('custom');
            onStampSelect(null);
          }}
        >
          😀 カスタム絵文字 {customEmojis.length > 0 && `(${customEmojis.length})`}
        </button>
      </div>

      {/* 内蔵スタンプパレット */}
      {stampTab === 'builtin' && (
        <div className={styles.stampPalette}>
          {STAMPS.map((stamp) => {
            const dataUri = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${stamp.width} ${stamp.height}">${stamp.svg}</svg>`)))}`;
            return (
              <button
                key={stamp.id}
                className={`${styles.stampButton} ${selectedStamp?.id === stamp.id ? styles.active : ''}`}
                onClick={() => {
                  onStampSelect(stamp);
                  onCustomEmojiSelect(null);
                }}
                title={stamp.name}
              >
                <img src={dataUri} alt={stamp.name} className={styles.stampPreview} />
              </button>
            );
          })}
        </div>
      )}

      {/* カスタム絵文字パレット */}
      {stampTab === 'custom' && (
        <div className={styles.customEmojiPalette}>
          {isLoadingEmojis && (
            <div className={styles.loadingEmojis}>
              カスタム絵文字を読み込み中...
            </div>
          )}
          {!isLoadingEmojis && customEmojis.length === 0 && (
            <div className={styles.noEmojis}>
              <p>カスタム絵文字が見つかりません</p>
              <p className={styles.noEmojisHint}>
                💡 NIP-30の絵文字リスト (kind 10030) を設定すると、ここにカスタム絵文字が表示されます
              </p>
            </div>
          )}
          {!isLoadingEmojis && customEmojis.length > 0 && (
            <div className={styles.emojiGrid}>
              {customEmojis.map((emoji) => (
                <button
                  key={`${emoji.shortcode}-${emoji.url}`}
                  className={`${styles.emojiButton} ${selectedCustomEmoji?.url === emoji.url ? styles.active : ''}`}
                  onClick={() => {
                    onCustomEmojiSelect(emoji);
                    onStampSelect(null);
                  }}
                  title={`:${emoji.shortcode}:`}
                >
                  <img 
                    src={emoji.url} 
                    alt={emoji.shortcode} 
                    className={styles.emojiPreview}
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

