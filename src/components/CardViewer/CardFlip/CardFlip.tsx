// カードフリップアニメーションコンポーネント

import { useState } from 'react';
import type { NewYearCard, NostrProfile } from '../../../types';
import { pubkeyToNpub } from '../../../services/profile';
import styles from './CardFlip.module.css';

interface CardFlipProps {
  card: NewYearCard;
  senderProfile?: NostrProfile | null;
  recipientProfile?: NostrProfile | null;
  onClose?: () => void;
}

export function CardFlip({
  card,
  senderProfile,
  recipientProfile,
  onClose,
}: CardFlipProps) {
  // 宛先がない場合は最初から裏面（絵柄面）を表示
  const hasRecipient = !!card.recipientPubkey;
  const [isFlipped, setIsFlipped] = useState(!hasRecipient);

  const handleFlip = () => {
    // 宛先がない場合はフリップしない（常に裏面表示）
    if (!hasRecipient) return;
    setIsFlipped(!isFlipped);
  };

  const getSenderName = () => {
    if (senderProfile?.display_name) return senderProfile.display_name;
    if (senderProfile?.name) return senderProfile.name;
    return pubkeyToNpub(card.pubkey).slice(0, 12) + '...';
  };

  const getRecipientName = () => {
    if (!card.recipientPubkey) return 'みんな';
    if (recipientProfile?.display_name) return recipientProfile.display_name;
    if (recipientProfile?.name) return recipientProfile.name;
    return pubkeyToNpub(card.recipientPubkey).slice(0, 12) + '...';
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const dateStr = date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const timeStr = date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    return `${dateStr} ${timeStr}`;
  };

  return (
    <div className={styles.cardFlipContainer}>
      {onClose && (
        <button onClick={onClose} className={styles.closeButton}>
          ×
        </button>
      )}
      
      <div
        className={`${styles.card} ${isFlipped ? styles.flipped : ''}`}
        onClick={handleFlip}
      >
        {/* 表面（宛名面） */}
        <div className={styles.cardFace + ' ' + styles.cardFront}>
          <div className={styles.frontContent}>
            <div className={styles.stamp}>🎍</div>
            <div className={styles.addressSection}>
              <div className={styles.toSection}>
                <span className={styles.label}>To:</span>
                <span className={styles.name}>{getRecipientName()}</span>
                {recipientProfile?.picture && (
                  <img
                    src={recipientProfile.picture}
                    alt=""
                    className={styles.avatar}
                  />
                )}
              </div>
              <div className={styles.fromSection}>
                <span className={styles.label}>From:</span>
                <span className={styles.name}>{getSenderName()}</span>
                {senderProfile?.picture && (
                  <img
                    src={senderProfile.picture}
                    alt=""
                    className={styles.avatar}
                  />
                )}
              </div>
            </div>
            <div className={styles.date}>{formatDate(card.createdAt)}</div>
            <div className={styles.flipHint}>クリックして裏面を見る →</div>
          </div>
        </div>

        {/* 裏面（絵柄面） */}
        <div className={styles.cardFace + ' ' + styles.cardBack}>
          <CardContent card={card} />
          <div className={styles.flipHintBack}>← クリックして表面に戻る</div>
        </div>
      </div>
    </div>
  );
}

// SVGをdata URIに変換
function svgToDataUri(svg: string): string {
  // Base64エンコード
  const encoded = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${encoded}`;
}

// カードコンテンツ表示（レイアウト対応）
function CardContent({ card }: { card: NewYearCard }) {
  const layoutClass = styles[`layout_${card.layoutId}`] || styles.layout_vertical;
  const imageSrc = card.svg ? svgToDataUri(card.svg) : '';

  return (
    <div className={`${styles.content} ${layoutClass}`}>
      {card.layoutId === 'fullscreen' ? (
        <div className={styles.fullscreenLayout}>
          {imageSrc && <img src={imageSrc} alt="" className={styles.fullscreenImage} />}
          <div className={styles.fullscreenMessage}>
            <p>{card.message}</p>
          </div>
        </div>
      ) : card.layoutId === 'classic' ? (
        <div className={styles.classicLayout}>
          <div className={styles.classicInner}>
            <div className={styles.imageArea}>
              {imageSrc && <img src={imageSrc} alt="" className={styles.image} />}
            </div>
            <div className={styles.messageArea}>
              <p>{card.message}</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.imageArea}>
            {imageSrc && <img src={imageSrc} alt="" className={styles.image} />}
          </div>
          <div className={styles.messageArea}>
            <p>{card.message}</p>
          </div>
        </>
      )}
    </div>
  );
}

