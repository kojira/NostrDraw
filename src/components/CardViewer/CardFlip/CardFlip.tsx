// カードフリップアニメーションコンポーネント

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { NewYearCard, NostrProfile } from '../../../types';
import { pubkeyToNpub, fetchProfiles } from '../../../services/profile';
import { sendReaction, hasUserReacted, fetchReactionCounts, fetchCardById, fetchAncestors, fetchDescendants } from '../../../services/card';
import { addAnimationToNewElements, addAnimationToAllStrokes, injectStrokeAnimationStyles } from '../../../utils/svgDiff';
// URLは現在のページのoriginとpathnameから動的に生成
import type { Event, EventTemplate } from 'nostr-tools';
import styles from './CardFlip.module.css';

interface CardFlipProps {
  card: NewYearCard;
  senderProfile?: NostrProfile | null;
  recipientProfile?: NostrProfile | null;
  onClose?: () => void;
  userPubkey?: string | null;
  signEvent?: (event: EventTemplate) => Promise<Event>;
  onExtend?: (card: NewYearCard) => void; // 描き足しボタンのコールバック
  onNavigateToCard?: (card: NewYearCard) => void; // 親子カードへのナビゲーション
}

export function CardFlip({
  card,
  senderProfile,
  recipientProfile,
  onClose,
  userPubkey,
  signEvent,
  onExtend,
  onNavigateToCard,
}: CardFlipProps) {
  const { t } = useTranslation();
  // 宛先がない場合は最初から裏面（絵柄面）を表示
  const hasRecipient = !!card.recipientPubkey;
  const [isFlipped, setIsFlipped] = useState(!hasRecipient);
  
  // リアクション関連の状態
  const [hasReacted, setHasReacted] = useState(false);
  const [reactionCount, setReactionCount] = useState(0);
  const [isReacting, setIsReacting] = useState(false);
  const [showReactionAnimation, setShowReactionAnimation] = useState(false);
  
  // 描き足しアニメーション用の状態
  const [animatedSvg, setAnimatedSvg] = useState<string | null>(null);
  // 親カードがある場合は最初からロード中状態にする（アニメーション前に最終形が見えるのを防ぐ）
  const [isLoadingParent, setIsLoadingParent] = useState(!!card.parentEventId);
  
  // ツリー構造の状態（すべての祖先と子孫）
  const [ancestors, setAncestors] = useState<NewYearCard[]>([]);
  const [descendants, setDescendants] = useState<NewYearCard[]>([]);
  
  // ツリーカード用のプロファイルとリアクション数
  const [treeProfiles, setTreeProfiles] = useState<Map<string, NostrProfile>>(new Map());
  const [treeReactions, setTreeReactions] = useState<Map<string, number>>(new Map());
  
  // シェアボタン用の状態
  const [isCopied, setIsCopied] = useState(false);

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

  // ツリー全体を取得（すべての祖先と子孫）
  // card.idが変わった時だけ再取得（cardオブジェクト全体を依存に含めると無限ループの原因になる）
  useEffect(() => {
    // 状態をリセット
    setAncestors([]);
    setDescendants([]);
    
    const loadTreeCards = async () => {
      // すべての祖先を取得（ルートまで遡る）
      const ancestorCards = await fetchAncestors(card);
      setAncestors(ancestorCards);
      
      // すべての子孫を取得
      const descendantCards = await fetchDescendants(card.id);
      setDescendants(descendantCards);
    };
    
    loadTreeCards();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id]);

  // ツリーカードのプロファイルとリアクション数を取得
  useEffect(() => {
    const loadTreeDetails = async () => {
      const allTreeCards = [...ancestors, ...descendants];
      if (allTreeCards.length === 0) return;
      
      // プロファイルを取得
      const pubkeys = [...new Set(allTreeCards.map(c => c.pubkey))];
      const profiles = await fetchProfiles(pubkeys);
      setTreeProfiles(profiles);
      
      // リアクション数を取得
      const eventIds = allTreeCards.map(c => c.id);
      const reactions = await fetchReactionCounts(eventIds);
      setTreeReactions(reactions);
    };
    
    loadTreeDetails();
  }, [ancestors, descendants]);

  // SVGにストロークアニメーションを適用
  // 描き足しの場合は差分のみ、通常の場合は全てのストロークにアニメーション
  useEffect(() => {
    const loadAndAnimate = async () => {
      if (!card.svg) {
        setAnimatedSvg(null);
        return;
      }
      
      // 描き足し投稿の場合
      if (card.parentEventId) {
        setIsLoadingParent(true);
        
        try {
          const parentCard = await fetchCardById(card.parentEventId);
          
          if (parentCard?.svg) {
            // 差分検出してアニメーションクラスを追加
            const svgWithAnimation = addAnimationToNewElements(card.svg, parentCard.svg);
            // アニメーションスタイルを注入
            const finalSvg = injectStrokeAnimationStyles(svgWithAnimation);
            setAnimatedSvg(finalSvg);
          } else {
            // 親が見つからない場合は全ストロークにアニメーション
            const svgWithAnimation = addAnimationToAllStrokes(card.svg);
            const finalSvg = injectStrokeAnimationStyles(svgWithAnimation);
            setAnimatedSvg(finalSvg);
          }
        } catch (error) {
          console.error('親イベントの取得に失敗:', error);
          // エラー時も全ストロークにアニメーション
          const svgWithAnimation = addAnimationToAllStrokes(card.svg);
          const finalSvg = injectStrokeAnimationStyles(svgWithAnimation);
          setAnimatedSvg(finalSvg);
        } finally {
          setIsLoadingParent(false);
        }
      } else {
        // 通常の投稿の場合は全てのストロークにアニメーション
        const svgWithAnimation = addAnimationToAllStrokes(card.svg);
        const finalSvg = injectStrokeAnimationStyles(svgWithAnimation);
        setAnimatedSvg(finalSvg);
      }
    };
    
    loadAndAnimate();
  }, [card.parentEventId, card.svg]);

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

  // パーマリンクを生成（現在のURLベース）
  const getPermalink = useCallback(() => {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    return `${baseUrl}?eventid=${card.id}`;
  }, [card.id]);

  // シェアボタンのハンドラ
  const handleShare = useCallback(async () => {
    const shareUrl = getPermalink();
    try {
      await navigator.clipboard.writeText(shareUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('クリップボードへのコピーに失敗:', error);
    }
  }, [card.id]);

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

  // コラボ数（子孫の数）
  const collabCount = descendants.length;

  return (
    <div className={styles.cardFlipContainer}>
      {onClose && (
        <button onClick={onClose} className={styles.closeButton}>
          ×
        </button>
      )}
      
      {/* 作者ヘッダー */}
      <div className={styles.authorHeader}>
        <div className={styles.authorInfo}>
          {senderProfile?.picture && (
            <img 
              src={senderProfile.picture} 
              alt="" 
              className={styles.authorHeaderAvatar}
            />
          )}
          <span className={styles.authorHeaderName}>{getSenderName()}</span>
        </div>
        <a 
          href={getPermalink()}
          className={styles.postDate}
          onClick={(e) => e.stopPropagation()}
          target="_blank"
          rel="noopener noreferrer"
        >
          {formatDate(card.createdAt)}
        </a>
      </div>
      
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
            <div className={styles.flipHint}>{t('card.flipHint')}</div>
          </div>
        </div>

        {/* 裏面（絵柄面） */}
        <div className={styles.cardFace + ' ' + styles.cardBack}>
          <CardContent card={card} animatedSvg={animatedSvg} isLoadingParent={isLoadingParent} />
          {hasRecipient && (
            <div className={styles.flipHintBack}>{t('card.flipBack')}</div>
          )}
        </div>
      </div>

      {/* アクションエリア */}
      <div className={styles.actionArea}>
        {/* リアクションボタン */}
        <button
          className={`${styles.reactionButton} ${hasReacted ? styles.reacted : ''} ${showReactionAnimation ? styles.animating : ''}`}
          onClick={handleReaction}
          disabled={!signEvent || !userPubkey || hasReacted || isReacting}
          title={hasReacted ? t('reaction.liked') : t('reaction.like')}
        >
          <span className={styles.heartIcon}>
            {hasReacted ? '❤️' : '🤍'}
          </span>
          <span className={styles.reactionCount}>{reactionCount}</span>
        </button>
        
        {/* コラボ数（描き足しされた数） */}
        {card.allowExtend && (
          <div className={styles.collabCount} title="コラボ数">
            <span>🎨</span>
            <span>{collabCount}</span>
          </div>
        )}
        
        {/* シェアボタン */}
        <button
          className={`${styles.shareButton} ${isCopied ? styles.copied : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            handleShare();
          }}
          title={isCopied ? t('timeline.copied') : t('timeline.share')}
        >
          <span>{isCopied ? '✅' : '🔗'}</span>
        </button>
        
        {/* 描き足しボタン（許可されている場合のみ表示） */}
        {card.allowExtend && onExtend && userPubkey && signEvent && (
          <button
            className={styles.extendButton}
            onClick={(e) => {
              e.stopPropagation();
              onExtend(card);
              onClose?.();
            }}
            title={t('extend.button')}
          >
            <span>✏️</span>
            <span>{t('extend.button').replace('✏️ ', '')}</span>
          </button>
        )}
        
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

      {/* ツリーナビゲーション（すべての祖先と子孫） */}
      {(ancestors.length > 0 || descendants.length > 0) && onNavigateToCard && (
        <div className={styles.treeNavigation}>
          {/* 祖先カード（古い順） */}
          {ancestors.map((ancestor, index) => {
            const profile = treeProfiles.get(ancestor.pubkey);
            const reactions = treeReactions.get(ancestor.id) || 0;
            return (
              <div key={ancestor.id} className={styles.treeRow}>
                <div 
                  className={styles.treeIndent} 
                  style={{ width: `${index * 16}px` }} 
                />
                <button
                  className={styles.treeCard}
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateToCard(ancestor);
                  }}
                >
                  <div className={styles.cardPreview}>
                    {ancestor.svg && (
                      <div 
                        className={styles.miniSvg}
                        dangerouslySetInnerHTML={{ __html: ancestor.svg }}
                      />
                    )}
                  </div>
                  <div className={styles.cardInfo}>
                    <div className={styles.cardAuthor}>
                      {profile?.picture && (
                        <img 
                          src={profile.picture} 
                          alt="" 
                          className={styles.authorAvatar}
                        />
                      )}
                      <span className={styles.authorName}>
                        {profile?.name || pubkeyToNpub(ancestor.pubkey).slice(0, 12) + '...'}
                      </span>
                    </div>
                    <div className={styles.cardMeta}>
                      <span className={styles.cardDate}>{formatDate(ancestor.createdAt)}</span>
                      <span className={styles.cardReactions}>❤️ {reactions}</span>
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
          
          {/* 現在のカード（ハイライト） */}
          <div className={styles.treeRow}>
            <div 
              className={styles.treeIndent} 
              style={{ width: `${ancestors.length * 16}px` }} 
            />
            <div className={styles.currentCard}>
              <div className={styles.cardPreview}>
                {card.svg && (
                  <div 
                    className={styles.miniSvg}
                    dangerouslySetInnerHTML={{ __html: card.svg }}
                  />
                )}
              </div>
              <div className={styles.cardInfo}>
                <div className={styles.cardAuthor}>
                  {senderProfile?.picture && (
                    <img 
                      src={senderProfile.picture} 
                      alt="" 
                      className={styles.authorAvatar}
                    />
                  )}
                  <span className={styles.authorName}>
                    {senderProfile?.name || pubkeyToNpub(card.pubkey).slice(0, 12) + '...'}
                  </span>
                </div>
                <div className={styles.cardMeta}>
                  <span className={styles.cardDate}>{formatDate(card.createdAt)}</span>
                  <span className={styles.cardReactions}>❤️ {reactionCount}</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* 子孫カード */}
          {descendants.map((descendant) => {
            const profile = treeProfiles.get(descendant.pubkey);
            const reactions = treeReactions.get(descendant.id) || 0;
            return (
              <div key={descendant.id} className={styles.treeRow}>
                <div 
                  className={styles.treeIndent} 
                  style={{ width: `${(ancestors.length + 1) * 16}px` }} 
                />
                <button
                  className={styles.treeCard}
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateToCard(descendant);
                  }}
                >
                  <div className={styles.cardPreview}>
                    {descendant.svg && (
                      <div 
                        className={styles.miniSvg}
                        dangerouslySetInnerHTML={{ __html: descendant.svg }}
                      />
                    )}
                  </div>
                  <div className={styles.cardInfo}>
                    <div className={styles.cardAuthor}>
                      {profile?.picture && (
                        <img 
                          src={profile.picture} 
                          alt="" 
                          className={styles.authorAvatar}
                        />
                      )}
                      <span className={styles.authorName}>
                        {profile?.name || pubkeyToNpub(descendant.pubkey).slice(0, 12) + '...'}
                      </span>
                    </div>
                    <div className={styles.cardMeta}>
                      <span className={styles.cardDate}>{formatDate(descendant.createdAt)}</span>
                      <span className={styles.cardReactions}>❤️ {reactions}</span>
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
      
      {/* 描き足し元の表示（ナビゲーションがない場合のフォールバック） */}
      {card.parentEventId && !onNavigateToCard && (
        <div className={styles.parentInfo}>
          <span>{t('extend.label')}</span>
        </div>
      )}
    </div>
  );
}

// SVGを安全にレンダリングするためのコンポーネント
function SvgRenderer({ 
  svg, 
  className,
  forceDirectRender = false 
}: { 
  svg: string; 
  className?: string;
  forceDirectRender?: boolean;
}) {
  // SVGに外部画像参照が含まれているかチェック
  const hasExternalImage = svg.includes('<image') && svg.includes('href=');
  
  // 直接レンダリングが必要な場合（アニメーション用）または外部画像がある場合
  if (hasExternalImage || forceDirectRender) {
    // 外部画像を含むSVGまたはアニメーション付きSVGは直接HTMLとしてレンダリング
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
function CardContent({ 
  card, 
  animatedSvg, 
  isLoadingParent 
}: { 
  card: NewYearCard; 
  animatedSvg?: string | null;
  isLoadingParent?: boolean;
}) {
  const { t } = useTranslation();
  const layoutClass = styles[`layout_${card.layoutId}`] || styles.layout_vertical;
  
  // 描き足しアニメーション付きSVGがあればそれを使用
  // アニメーション処理中（親カード読み込み中）は元のSVGを表示しない
  // これにより、アニメーション前に最終形が見えてしまうのを防ぐ
  const displaySvg = isLoadingParent ? null : (animatedSvg || card.svg);
  // アニメーション付きSVGは常に直接レンダリング（CSS animationを適用するため）
  const forceDirectRender = !!animatedSvg;

  return (
    <div className={`${styles.content} ${layoutClass}`}>
      {isLoadingParent && (
        <div className={styles.loadingOverlay}>
          <span>{t('card.loading')}</span>
        </div>
      )}
      {card.layoutId === 'fullscreen' ? (
        <div className={styles.fullscreenLayout}>
          {displaySvg && <SvgRenderer svg={displaySvg} className={styles.fullscreenImage} forceDirectRender={forceDirectRender} />}
          <div className={styles.fullscreenMessage}>
            <p>{card.message}</p>
          </div>
        </div>
      ) : card.layoutId === 'classic' ? (
        <div className={styles.classicLayout}>
          <div className={styles.classicInner}>
            <div className={styles.imageArea}>
              {displaySvg && <SvgRenderer svg={displaySvg} className={styles.image} forceDirectRender={forceDirectRender} />}
            </div>
            <div className={styles.messageArea}>
              <p>{card.message}</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.imageArea}>
            {displaySvg && <SvgRenderer svg={displaySvg} className={styles.image} forceDirectRender={forceDirectRender} />}
          </div>
          <div className={styles.messageArea}>
            <p>{card.message}</p>
          </div>
        </>
      )}
    </div>
  );
}

