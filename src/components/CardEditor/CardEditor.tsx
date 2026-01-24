// お絵かきエディタコンポーネント

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { DrawingCanvas } from './DrawingCanvas';
import { TagInput } from '../common/TagInput';
import { fetchUserEmojiLists, fetchPopularEmojiPacks, fetchBookmarkedEmojiPacks, type CustomEmoji } from '../../services/emoji';
import { ETO_IMAGES } from '../../data/etoGallery';
import type { NostrDrawPost } from '../../types';
import type { PostData } from './DrawingCanvas/types';
import styles from './CardEditor.module.css';

interface CardEditorProps {
  svg: string | null;
  message: string;
  onSvgChange: (svg: string | null) => void;
  onMessageChange: (message: string) => void;
  userPubkey?: string | null;
  signEvent?: (event: import('nostr-tools').EventTemplate) => Promise<import('nostr-tools').Event>; // パレット保存用
  extendingCard?: NostrDrawPost | null; // 描き足し元のカード
  allowExtend?: boolean;
  onAllowExtendChange?: (allow: boolean) => void;
  postToTimeline?: boolean;
  onPostToTimelineChange?: (post: boolean) => void;
  categoryTags?: string[]; // カテゴリタグ
  onCategoryTagsChange?: (tags: string[]) => void;
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
  signEvent,
  extendingCard,
  allowExtend = true,
  onAllowExtendChange,
  postToTimeline = true,
  onPostToTimelineChange,
  categoryTags = [],
  onCategoryTagsChange,
  onPost,
  isPosting = false,
  postSuccess = false,
  onNewPost,
  onGoHome,
}: CardEditorProps) {
  const { t } = useTranslation();
  const [customEmojis, setCustomEmojis] = useState<CustomEmoji[]>([]);
  const [isLoadingEmojis, setIsLoadingEmojis] = useState(false);
  
  // 描き足し時の親タグ継承
  const inheritedTags = extendingCard?.tags || [];
  const [useInheritedTags, setUseInheritedTags] = useState(inheritedTags.length > 0);

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
  
  // タグを含めた投稿処理
  const handlePost = useCallback(async (data: PostData) => {
    if (!onPost) return;
    
    // タグをマージ（継承タグ + 選択タグ）
    const allTags = useInheritedTags
      ? [...inheritedTags, ...categoryTags.filter(t => !inheritedTags.includes(t))]
      : categoryTags;
    
    await onPost({
      ...data,
      categoryTags: allTags.length > 0 ? allTags : undefined,
    });
  }, [onPost, categoryTags, inheritedTags, useInheritedTags]);

  return (
    <div className={styles.cardEditor}>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>✏️ {t('editor.draw')}</h3>
        <DrawingCanvas 
          width={800}
          height={600}
          onSave={handleDrawingSave}
          onPost={handlePost}
          isPosting={isPosting}
          postSuccess={postSuccess}
          onNewPost={onNewPost}
          onGoHome={onGoHome}
          initialMessage={message}
          customEmojis={customEmojis}
          isLoadingEmojis={isLoadingEmojis}
          etoImages={ETO_IMAGES}
          baseImageSvg={extendingCard?.svg}
          signEvent={signEvent}
          userPubkey={userPubkey}
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
        
        {/* カテゴリタグ */}
        <div className={styles.tagSection}>
          <h4 className={styles.tagSectionTitle}>🏷️ {t('tags.categoryTags', 'カテゴリタグ')}</h4>
          <TagInput
            selectedTags={categoryTags}
            onChange={onCategoryTagsChange || (() => {})}
            inheritedTags={inheritedTags}
            useInheritedTags={useInheritedTags}
            onInheritedTagsToggle={inheritedTags.length > 0 ? setUseInheritedTags : undefined}
            disabled={isPosting}
          />
        </div>
      </div>
    </div>
  );
}
