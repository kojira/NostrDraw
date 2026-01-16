// お絵かきエディタコンポーネント

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DrawingCanvas } from './DrawingCanvas';
import { fetchUserEmojiLists, fetchPopularEmojiPacks, fetchBookmarkedEmojiPacks, type CustomEmoji } from '../../services/emoji';
import { ETO_IMAGES } from '../../data/etoGallery';
import type { NewYearCard } from '../../types';
import type { PostData } from './DrawingCanvas/types';
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
  onPost?: (data: PostData) => Promise<void>; // 投稿処理
  isPosting?: boolean; // 投稿中フラグ
  postSuccess?: boolean; // 投稿成功フラグ
  onNewPost?: () => void; // 新規投稿開始時のコールバック
  onGoHome?: () => void; // ホームに戻る時のコールバック
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
  onPost,
  isPosting = false,
  postSuccess = false,
  onNewPost,
  onGoHome,
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
          // ユーザーの絵文字リストを取得（kind 10030 + 参照されているパック）
          console.log('[Emoji] Fetching user emoji lists for:', userPubkey);
          const userLists = await fetchUserEmojiLists(userPubkey);
          console.log('[Emoji] User emoji lists:', userLists.length, 'lists,', userLists.reduce((acc, list) => acc + list.emojis.length, 0), 'emojis');
          userLists.forEach(list => {
            emojis.push(...list.emojis);
          });
          
          // ブックマークしている絵文字パックを取得 (NIP-51)
          console.log('[Emoji] Fetching bookmarked emoji packs...');
          const bookmarkedPacks = await fetchBookmarkedEmojiPacks(userPubkey);
          console.log('[Emoji] Bookmarked packs:', bookmarkedPacks.length, 'packs,', bookmarkedPacks.reduce((acc, pack) => acc + pack.emojis.length, 0), 'emojis');
          bookmarkedPacks.forEach(pack => {
            emojis.push(...pack.emojis);
          });
        }
        
        // 人気の絵文字パックも取得
        console.log('[Emoji] Fetching popular emoji packs...');
        const popularPacks = await fetchPopularEmojiPacks(10);
        console.log('[Emoji] Popular packs:', popularPacks.length, 'packs,', popularPacks.reduce((acc, pack) => acc + pack.emojis.length, 0), 'emojis');
        popularPacks.forEach(pack => {
          emojis.push(...pack.emojis);
        });
        
        // 重複を除去（URLベースで）
        const uniqueEmojis = emojis.filter((emoji, index, self) =>
          index === self.findIndex(e => e.url === emoji.url)
        );
        
        console.log('[Emoji] Total unique emojis:', uniqueEmojis.length);
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
          onPost={onPost}
          isPosting={isPosting}
          postSuccess={postSuccess}
          onNewPost={onNewPost}
          onGoHome={onGoHome}
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
