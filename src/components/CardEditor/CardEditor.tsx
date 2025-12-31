// お絵かきエディタコンポーネント

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DrawingCanvas } from './DrawingCanvas';
import { fetchUserEmojiLists, fetchPopularEmojiPacks, fetchBookmarkedEmojiPacks, type CustomEmoji } from '../../services/emoji';
import { ETO_IMAGES } from '../../data/etoGallery';
import type { NewYearCard } from '../../types';
import styles from './CardEditor.module.css';

interface CardEditorProps {
  svg: string | null;
  message: string;
  onSvgChange: (svg: string | null) => void;
  onMessageChange: (message: string) => void;
  userPubkey?: string | null;
  extendingCard?: NewYearCard | null; // 描き足し元のカード
  allowExtend?: boolean;
  onAllowExtendChange?: (allow: boolean) => void;
  postToTimeline?: boolean;
  onPostToTimelineChange?: (post: boolean) => void;
}

export function CardEditor({
  message,
  onSvgChange,
  onMessageChange,
  userPubkey,
  extendingCard,
  allowExtend = true,
  onAllowExtendChange,
  postToTimeline = true,
  onPostToTimelineChange,
}: CardEditorProps) {
  const { t } = useTranslation();
  const [customEmojis, setCustomEmojis] = useState<CustomEmoji[]>([]);
  const [isLoadingEmojis, setIsLoadingEmojis] = useState(false);

  // カスタム絵文字を取得
  useEffect(() => {
    async function loadEmojis() {
      setIsLoadingEmojis(true);
      try {
        const emojis: CustomEmoji[] = [];
        
        if (userPubkey) {
          // ユーザーの絵文字リストを取得
          const userLists = await fetchUserEmojiLists(userPubkey);
          userLists.forEach(list => {
            emojis.push(...list.emojis);
          });
          
          // ブックマークしている絵文字パックを取得 (NIP-51)
          const bookmarkedPacks = await fetchBookmarkedEmojiPacks(userPubkey);
          bookmarkedPacks.forEach(pack => {
            emojis.push(...pack.emojis);
          });
        }
        
        // 人気の絵文字パックも取得
        const popularPacks = await fetchPopularEmojiPacks(10);
        popularPacks.forEach(pack => {
          emojis.push(...pack.emojis);
        });
        
        // 重複を除去（URLベースで）
        const uniqueEmojis = emojis.filter((emoji, index, self) =>
          index === self.findIndex(e => e.url === emoji.url)
        );
        
        setCustomEmojis(uniqueEmojis);
      } catch (error) {
        console.error('カスタム絵文字の取得に失敗:', error);
      } finally {
        setIsLoadingEmojis(false);
      }
    }
    
    loadEmojis();
  }, [userPubkey]);

  // お絵描き保存：SVGにメッセージが埋め込まれる
  const handleDrawingSave = (svgData: string, embeddedMessage: string) => {
    onSvgChange(svgData);
    onMessageChange(embeddedMessage);
  };

  return (
    <div className={styles.cardEditor}>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>✏️ {t('editor.draw')}</h3>
        <DrawingCanvas 
          onSave={handleDrawingSave} 
          initialMessage={message}
          customEmojis={customEmojis}
          isLoadingEmojis={isLoadingEmojis}
          etoImages={ETO_IMAGES}
          baseImageSvg={extendingCard?.svg}
        />
      </div>
      
      {/* 投稿オプション */}
      <div className={styles.options}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={allowExtend}
            onChange={(e) => onAllowExtendChange?.(e.target.checked)}
          />
          <span>{t('send.allowExtend')}</span>
        </label>
        
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={postToTimeline}
            onChange={(e) => onPostToTimelineChange?.(e.target.checked)}
          />
          <span>{t('send.postToTimeline')}</span>
        </label>
      </div>
    </div>
  );
}
