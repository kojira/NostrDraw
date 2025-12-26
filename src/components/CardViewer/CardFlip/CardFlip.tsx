// カードフリップアニメーションコンポーネント

import { useState, useEffect, useCallback } from 'react';
import type { NewYearCard, NostrProfile} from '../../../types';
import { pubkeyToNpub } from '../../../services/profile';
import { sendReaction, hasUserReacted, fetchReactionCounts } from '../../../services/card';
import type { Event, EventTemplate } from 'nostr-tools';
import styles from './CardFlip.module.css';

interface CardFlipProps {
  card: NewYearCard;
  senderProfile?: NostrProfile | null;
  recipientProfile?: NostrProfile | null;
  onClose?: () => void;
  userPubkey?: string | null;
  signEvent?: (event: EventTemplate) => Promise<Event>;
}

export function CardFlip({
  card,
  senderProfile,
  recipientProfile,
  onClose,
  userPubkey,
  signEvent,
}: CardFlipProps) {
  // 宛先がない場合は最初から裏面（絵柄面）を表示
  const hasRecipient = !!card.recipientPubkey;
  const [isFlipped, setIsFlipped] = useState(!hasRecipient);
  
  // リアクション関連の状態
  const [hasReacted, setHasReacted] = useState(false);
  const [reactionCount, setReactionCount] = useState(0);
  const [isReacting, setIsReacting] = useState(false);
  const [showReactionAnimation, setShowReactionAnimation] = useState(false);

  // リアクション状態を取得
  useEffect(() => {
    const loadReactionState = async () => {
      // リアクション数を取得
      const counts = await fetchReactionCounts([card.id]);
      setReactionCount(counts.get(card.id) || 0);
      
      // 自分がリアクション済みかチェック
      if (userPubkey) {
        const reacted = await hasUserReacted(card.id, userPubkey);
        setHasReacted(reacted);
      }
    };
    
    loadReactionState();
  }, [card.id, userPubkey]);

  const handleFlip = () => {
    // 宛先がない場合はフリップしない（常に裏面表示）
    if (!hasRecipient) return;
    setIsFlipped(!isFlipped);
  };

  const handleReaction = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation(); // フリップを防ぐ
    
    if (!signEvent || !userPubkey || hasReacted || isReacting) return;
    
    setIsReacting(true);
    
    try {
      await sendReaction(card.id, card.pubkey, '❤️', signEvent);
      setHasReacted(true);
      setReactionCount(prev => prev + 1);
      
      // アニメーション開始
      setShowReactionAnimation(true);
      setTimeout(() => setShowReactionAnimation(false), 1000);
    } catch (error) {
      console.error('リアクション送信失敗:', error);
    } finally {
      setIsReacting(false);
    }
  }, [signEvent, userPubkey, hasReacted, isReacting, card.id, card.pubkey]);

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
          {hasRecipient && (
            <div className={styles.flipHintBack}>← クリックして表面に戻る</div>
          )}
        </div>
      </div>

      {/* リアクションボタン */}
      <div className={styles.reactionArea}>
        <button
          className={`${styles.reactionButton} ${hasReacted ? styles.reacted : ''} ${showReactionAnimation ? styles.animating : ''}`}
          onClick={handleReaction}
          disabled={!signEvent || !userPubkey || hasReacted || isReacting}
          title={hasReacted ? 'リアクション済み' : 'いいね！'}
        >
          <span className={styles.heartIcon}>
            {hasReacted ? '❤️' : '🤍'}
          </span>
          <span className={styles.reactionCount}>{reactionCount}</span>
        </button>
        
        {/* アニメーション用のハートパーティクル */}
        {showReactionAnimation && (
          <div className={styles.heartParticles}>
            {[...Array(8)].map((_, i) => (
              <span key={i} className={styles.particle} style={{ '--i': i } as React.CSSProperties}>
                ❤️
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// SVGを安全にレンダリングするためのコンポーネント
function SvgRenderer({ svg, className }: { svg: string; className?: string }) {
  // SVGに外部画像参照が含まれているかチェック
  const hasExternalImage = svg.includes('<image') && svg.includes('href=');
  
  if (hasExternalImage) {
    // 外部画像を含むSVGは直接HTMLとしてレンダリング（imgタグだとブロックされる）
    return (
      <div 
        className={className}
        dangerouslySetInnerHTML={{ __html: svg }}
        style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      />
    );
  }
  
  // 外部画像がない場合はdata URI経由で表示（より安全）
  const encoded = btoa(unescape(encodeURIComponent(svg)));
  const dataUri = `data:image/svg+xml;base64,${encoded}`;
  return <img src={dataUri} alt="" className={className} />;
}

// カードコンテンツ表示（レイアウト対応）
function CardContent({ card }: { card: NewYearCard }) {
  const layoutClass = styles[`layout_${card.layoutId}`] || styles.layout_vertical;

  return (
    <div className={`${styles.content} ${layoutClass}`}>
      {card.layoutId === 'fullscreen' ? (
        <div className={styles.fullscreenLayout}>
          {card.svg && <SvgRenderer svg={card.svg} className={styles.fullscreenImage} />}
          <div className={styles.fullscreenMessage}>
            <p>{card.message}</p>
          </div>
        </div>
      ) : card.layoutId === 'classic' ? (
        <div className={styles.classicLayout}>
          <div className={styles.classicInner}>
            <div className={styles.imageArea}>
              {card.svg && <SvgRenderer svg={card.svg} className={styles.image} />}
            </div>
            <div className={styles.messageArea}>
              <p>{card.message}</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.imageArea}>
            {card.svg && <SvgRenderer svg={card.svg} className={styles.image} />}
          </div>
          <div className={styles.messageArea}>
            <p>{card.message}</p>
          </div>
        </>
      )}
    </div>
  );
}

