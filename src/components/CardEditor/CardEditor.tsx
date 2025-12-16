// 年賀状エディタ統合コンポーネント

import { useState, useMemo, useEffect } from 'react';
import { DrawingCanvas } from './DrawingCanvas';
import { EtoGallery, DEFAULT_ETO_IMAGES } from './EtoGallery';
import { MessageInput } from './MessageInput';
import { LayoutSelector } from './LayoutSelector';
import { fetchUserEmojiLists, fetchPopularEmojiPacks, type CustomEmoji } from '../../services/emoji';
import type { LayoutType, EtoImage } from '../../types';
import styles from './CardEditor.module.css';

// SVGをdata URIに変換
function svgToDataUri(svg: string): string {
  const encoded = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${encoded}`;
}

interface CardEditorProps {
  svg: string | null;
  message: string;
  layoutId: LayoutType;
  onSvgChange: (svg: string | null) => void;
  onMessageChange: (message: string) => void;
  onLayoutChange: (layoutId: LayoutType) => void;
  etoImages?: EtoImage[];
  userPubkey?: string | null;
}

type TabType = 'draw' | 'gallery';

export function CardEditor({
  svg,
  message,
  layoutId,
  onSvgChange,
  onMessageChange,
  onLayoutChange,
  etoImages = DEFAULT_ETO_IMAGES,
  userPubkey,
}: CardEditorProps) {
  const [activeTab, setActiveTab] = useState<TabType>('gallery');
  const [customEmojis, setCustomEmojis] = useState<CustomEmoji[]>([]);
  const [isLoadingEmojis, setIsLoadingEmojis] = useState(false);

  // カスタム絵文字を取得
  useEffect(() => {
    async function loadEmojis() {
      setIsLoadingEmojis(true);
      try {
        const emojis: CustomEmoji[] = [];
        
        // ユーザーの絵文字リストを取得
        if (userPubkey) {
          const userLists = await fetchUserEmojiLists(userPubkey);
          userLists.forEach(list => {
            emojis.push(...list.emojis);
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

  // SVGをdata URIに変換（表示用）
  const imageDataUri = useMemo(() => {
    return svg ? svgToDataUri(svg) : null;
  }, [svg]);

  // お絵描きモード：SVGにメッセージが埋め込まれる
  const handleDrawingSave = (svgData: string, embeddedMessage: string) => {
    onSvgChange(svgData);
    onMessageChange(embeddedMessage);
  };

  const handleGallerySelect = (svgData: string) => {
    onSvgChange(svgData);
  };

  return (
    <div className={styles.cardEditor}>
      {/* 画像選択セクション */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>絵を選ぶ</h3>
        
        {/* タブ切り替え */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'gallery' ? styles.active : ''}`}
            onClick={() => setActiveTab('gallery')}
          >
            🖼️ ギャラリーから選ぶ
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'draw' ? styles.active : ''}`}
            onClick={() => setActiveTab('draw')}
          >
            ✏️ お絵描きする
          </button>
        </div>

        {/* タブコンテンツ */}
        <div className={styles.tabContent}>
          {activeTab === 'gallery' && (
            <EtoGallery
              images={etoImages}
              selectedSvg={svg}
              onSelect={handleGallerySelect}
            />
          )}
          {activeTab === 'draw' && (
            <DrawingCanvas 
              onSave={handleDrawingSave} 
              initialMessage={message}
              customEmojis={customEmojis}
              isLoadingEmojis={isLoadingEmojis}
            />
          )}
        </div>

        {/* 選択中の画像プレビュー（お絵描きタブの時のみ） */}
        {imageDataUri && activeTab !== 'gallery' && (
          <div className={styles.selectedImage}>
            <span className={styles.selectedLabel}>選択中の画像:</span>
            <img src={imageDataUri} alt="選択中" className={styles.previewImage} />
            <button
              onClick={() => onSvgChange(null)}
              className={styles.clearButton}
            >
              クリア
            </button>
          </div>
        )}
      </div>

      {/* メッセージ入力セクション（ギャラリーモードのみ） */}
      {activeTab === 'gallery' && (
        <div className={styles.section}>
          <MessageInput value={message} onChange={onMessageChange} />
        </div>
      )}

      {/* レイアウト選択セクション */}
      <div className={styles.section}>
        <LayoutSelector selectedLayout={layoutId} onSelect={onLayoutChange} />
      </div>

      {/* プレビュー */}
      {imageDataUri && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>プレビュー</h3>
          <CardPreview
            imageDataUri={imageDataUri}
            message={message}
            layoutId={layoutId}
          />
        </div>
      )}
    </div>
  );
}

// 年賀状プレビューコンポーネント
interface CardPreviewProps {
  imageDataUri: string;
  message: string;
  layoutId: LayoutType;
}

function CardPreview({ imageDataUri, message, layoutId }: CardPreviewProps) {
  return (
    <div className={`${styles.preview} ${styles[`preview_${layoutId}`]}`}>
      <div className={styles.previewInner}>
        {layoutId === 'vertical' && (
          <>
            <div className={styles.previewImageArea}>
              <img src={imageDataUri} alt="" className={styles.previewImg} />
            </div>
            <div className={styles.previewMessage}>
              <p>{message || '（メッセージ未入力）'}</p>
            </div>
          </>
        )}
        {layoutId === 'horizontal' && (
          <>
            <div className={styles.previewImageArea}>
              <img src={imageDataUri} alt="" className={styles.previewImg} />
            </div>
            <div className={styles.previewMessage}>
              <p>{message || '（メッセージ未入力）'}</p>
            </div>
          </>
        )}
        {layoutId === 'fullscreen' && (
          <div className={styles.previewFullscreen}>
            <img src={imageDataUri} alt="" className={styles.previewImgFull} />
            <div className={styles.previewMessageOverlay}>
              <p>{message || '（メッセージ未入力）'}</p>
            </div>
          </div>
        )}
        {layoutId === 'classic' && (
          <div className={styles.previewClassic}>
            <div className={styles.previewClassicInner}>
              <div className={styles.previewImageArea}>
                <img src={imageDataUri} alt="" className={styles.previewImg} />
              </div>
              <div className={styles.previewMessage}>
                <p>{message || '（メッセージ未入力）'}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

