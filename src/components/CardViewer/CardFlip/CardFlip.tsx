// カードフリップアニメーションコンポーネント

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { NewYearCard, NostrProfile } from '../../../types';
import { pubkeyToNpub, fetchProfiles } from '../../../services/profile';
import { sendReaction, hasUserReacted, fetchReactionCounts, fetchCardById, fetchAncestors, fetchDescendants } from '../../../services/card';
import { addAnimationToNewElements, addAnimationToAllStrokes, injectStrokeAnimationStyles } from '../../../utils/svgDiff';
import type { Event, EventTemplate } from 'nostr-tools';
import { Spinner } from '../../common/Spinner';
import { fetchEvents } from '../../../services/relay';
import { NOSTRDRAW_KIND } from '../../../types';
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
  const [isLoadingTree, setIsLoadingTree] = useState(true);
  
  // ツリーカード用のプロファイルとリアクション数
  const [treeProfiles, setTreeProfiles] = useState<Map<string, NostrProfile>>(new Map());
  const [treeReactions, setTreeReactions] = useState<Map<string, number>>(new Map());
  
  // シェアボタン用の状態
  const [isCopied, setIsCopied] = useState(false);

  // イベントJSON表示用の状態
  const [showEventJson, setShowEventJson] = useState(false);
  const [eventJson, setEventJson] = useState<Event | null>(null);
  const [isLoadingEvent, setIsLoadingEvent] = useState(false);
  const [eventSize, setEventSize] = useState<number | null>(null);

  // イベントJSONを取得
  const loadEventJson = useCallback(async () => {
    if (eventJson) {
      setShowEventJson(true);
      return;
    }
    
    setIsLoadingEvent(true);
    try {
      const events = await fetchEvents({
        ids: [card.id],
        kinds: [NOSTRDRAW_KIND],
      });
      
      if (events.length > 0) {
        const event = events[0];
        setEventJson(event);
        // イベントサイズを計算（JSON文字列のバイト数）
        const jsonString = JSON.stringify(event);
        const sizeInBytes = new TextEncoder().encode(jsonString).length;
        setEventSize(sizeInBytes);
        setShowEventJson(true);
      }
    } catch (error) {
      console.error('Failed to load event JSON:', error);
    } finally {
      setIsLoadingEvent(false);
    }
  }, [card.id, eventJson]);

  // 初期ローディング状態（アニメーションSVGが準備できるまで表示）
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // senderProfileが渡されない場合は自分で取得
  const [localSenderProfile, setLocalSenderProfile] = useState<NostrProfile | null>(null);
  const [localRecipientProfile, setLocalRecipientProfile] = useState<NostrProfile | null>(null);
  
  // プロファイルを取得
  useEffect(() => {
    const loadProfiles = async () => {
      const pubkeysToFetch: string[] = [];
      if (!senderProfile && card.pubkey) {
        pubkeysToFetch.push(card.pubkey);
      }
      if (!recipientProfile && card.recipientPubkey) {
        pubkeysToFetch.push(card.recipientPubkey);
      }
      
      if (pubkeysToFetch.length > 0) {
        const profiles = await fetchProfiles(pubkeysToFetch);
        if (!senderProfile && card.pubkey) {
          setLocalSenderProfile(profiles.get(card.pubkey) || null);
        }
        if (!recipientProfile && card.recipientPubkey) {
          setLocalRecipientProfile(profiles.get(card.recipientPubkey) || null);
        }
      }
    };
    
    loadProfiles();
  }, [card.pubkey, card.recipientPubkey, senderProfile, recipientProfile]);
  
  // 実際に使用するプロファイル（外部から渡されたものがあればそれを優先）
  const effectiveSenderProfile = senderProfile || localSenderProfile;
  const effectiveRecipientProfile = recipientProfile || localRecipientProfile;

  // カードが変わった時にローディング状態をリセット
  useEffect(() => {
    setIsInitialLoading(true);
  }, [card.id]);

  // 初期ローディング完了判定（アニメーションSVGが準備できたら終了）
  useEffect(() => {
    if (animatedSvg && isInitialLoading) {
      setIsInitialLoading(false);
    }
  }, [animatedSvg, isInitialLoading]);

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
    setIsLoadingTree(true);
    
    const loadTreeCards = async () => {
      try {
        // すべての祖先を取得（ルートまで遡る）
        const ancestorCards = await fetchAncestors(card);
        setAncestors(ancestorCards);
        
        // すべての子孫を取得
        const descendantCards = await fetchDescendants(card.id);
        setDescendants(descendantCards);
      } finally {
        setIsLoadingTree(false);
      }
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
  }, [getPermalink]);

  const getSenderName = () => {
    if (effectiveSenderProfile?.display_name) return effectiveSenderProfile.display_name;
    if (effectiveSenderProfile?.name) return effectiveSenderProfile.name;
    return pubkeyToNpub(card.pubkey).slice(0, 12) + '...';
  };

  const getRecipientName = () => {
    if (!card.recipientPubkey) return 'みんな';
    if (effectiveRecipientProfile?.display_name) return effectiveRecipientProfile.display_name;
    if (effectiveRecipientProfile?.name) return effectiveRecipientProfile.name;
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

  // 初期ローディング中はローディング表示
  if (isInitialLoading) {
    return createPortal(
      <div className={styles.cardFlipContainer}>
        {onClose && (
          <button onClick={onClose} className={styles.closeButton}>
            ×
          </button>
        )}
        <div className={styles.loadingContainer}>
          <Spinner size="lg" />
          <span>{t('card.loading')}</span>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className={styles.cardFlipContainer} onClick={onClose}>
      {onClose && (
        <button onClick={onClose} className={styles.closeButton}>
          ×
        </button>
      )}
      
      <div className={styles.mainLayout} onClick={(e) => e.stopPropagation()}>
        {/* カードセクション */}
        <div className={styles.cardSection}>
          {/* 作者ヘッダー */}
          <div className={styles.authorHeader}>
        <a 
          href={`${window.location.origin}${window.location.pathname}?npub=${pubkeyToNpub(card.pubkey)}`}
          className={styles.authorInfo}
          onClick={(e) => e.stopPropagation()}
        >
          {effectiveSenderProfile?.picture && (
            <img 
              src={effectiveSenderProfile.picture} 
              alt="" 
              className={styles.authorHeaderAvatar}
            />
          )}
          <span className={styles.authorHeaderName}>{getSenderName()}</span>
        </a>
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
                {effectiveRecipientProfile?.picture && (
                  <img
                    src={effectiveRecipientProfile.picture}
                    alt=""
                    className={styles.avatar}
                  />
                )}
              </div>
              <div className={styles.fromSection}>
                <span className={styles.label}>From:</span>
                <span className={styles.name}>{getSenderName()}</span>
                {effectiveSenderProfile?.picture && (
                  <img
                    src={effectiveSenderProfile.picture}
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
            <svg width="20" height="20" viewBox="0 -960 960 960" fill="currentColor">
              <path d="M0-240v-63q0-43 44-70t116-27q13 0 25 .5t23 2.5q-14 21-21 44t-7 48v65H0Zm240 0v-65q0-32 17.5-58.5T307-410q32-20 76.5-30t96.5-10q53 0 97.5 10t76.5 30q32 20 49 46.5t17 58.5v65H240Zm540 0v-65q0-26-6.5-49T754-397q11-2 22.5-2.5t23.5-.5q72 0 116 26.5t44 70.5v63H780Zm-455-80h311q-10-20-55.5-35T480-370q-55 0-100.5 15T325-320ZM160-440q-33 0-56.5-23.5T80-520q0-34 23.5-57t56.5-23q34 0 57 23t23 57q0 33-23 56.5T160-440Zm640 0q-33 0-56.5-23.5T720-520q0-34 23.5-57t56.5-23q34 0 57 23t23 57q0 33-23 56.5T800-440Zm-320-40q-50 0-85-35t-35-85q0-51 35-85.5t85-34.5q51 0 85.5 34.5T600-600q0 50-34.5 85T480-480Zm0-80q17 0 28.5-11.5T520-600q0-17-11.5-28.5T480-640q-17 0-28.5 11.5T440-600q0 17 11.5 28.5T480-560Zm1 240Zm-1-280Z"/>
            </svg>
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
          {isCopied ? (
            <svg width="20" height="20" viewBox="0 -960 960 960" fill="currentColor">
              <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 -960 960 960" fill="currentColor">
              <path d="M720-80q-50 0-85-35t-35-85q0-7 1-14.5t3-13.5L322-392q-17 15-38 23.5t-44 8.5q-50 0-85-35t-35-85q0-50 35-85t85-35q23 0 44 8.5t38 23.5l282-164q-2-6-3-13.5t-1-14.5q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35q-23 0-44-8.5T602-672L320-508q2 6 3 13.5t1 14.5q0 7-1 14.5t-3 13.5l282 164q17-15 38-23.5t44-8.5q50 0 85 35t35 85q0 50-35 85t-85 35Z"/>
            </svg>
          )}
        </button>
        
        {/* イベントJSON表示ボタン */}
        <button
          className={styles.eventJsonButton}
          onClick={(e) => {
            e.stopPropagation();
            loadEventJson();
          }}
          title="イベントJSONを表示"
          disabled={isLoadingEvent}
        >
          {isLoadingEvent ? (
            <Spinner size="sm" />
          ) : (
            <svg width="20" height="20" viewBox="0 -960 960 960" fill="currentColor">
              <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm80-80h400L520-400 400-280l-80-80-40 40v120Zm-80 80v-560 560Z"/>
            </svg>
          )}
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
            <svg width="20" height="20" viewBox="0 -960 960 960" fill="currentColor">
              <path d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 32.5-156t88-127Q256-817 330-848.5T488-880q80 0 151 27.5t124.5 76q53.5 48.5 85 115T880-518q0 115-70 176.5T640-280h-74q-9 0-12.5 5t-3.5 11q0 12 15 34.5t15 51.5q0 50-27.5 74T480-80Zm0-400Zm-220 40q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm120-160q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm200 0q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm120 160q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17ZM480-160q9 0 14.5-5t5.5-13q0-14-15-33t-15-57q0-42 29-67t71-25h70q66 0 113-38.5T800-518q0-121-92.5-201.5T488-800q-136 0-232 93t-96 227q0 133 93.5 226.5T480-160Z"/>
            </svg>
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
      </div>

      {/* ツリーナビゲーション（すべての祖先と子孫） */}
      {(isLoadingTree || ancestors.length > 0 || descendants.length > 0) && (
        <div className={styles.treeNavigation}>
          {isLoadingTree ? (
            <div className={styles.treeLoading}>
              <Spinner size="sm" />
              <span>{t('card.loading')}</span>
            </div>
          ) : (
            <>
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
                    onNavigateToCard?.(ancestor);
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
                  {effectiveSenderProfile?.picture && (
                    <img 
                      src={effectiveSenderProfile.picture} 
                      alt="" 
                      className={styles.authorAvatar}
                    />
                  )}
                  <span className={styles.authorName}>
                    {effectiveSenderProfile?.name || pubkeyToNpub(card.pubkey).slice(0, 12) + '...'}
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
                    onNavigateToCard?.(descendant);
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
            </>
          )}
        </div>
      )}
      </div>
      
      {/* 描き足し元の表示（ナビゲーションがない場合のフォールバック） */}
      {card.parentEventId && !onNavigateToCard && (
        <div className={styles.parentInfo}>
          <span>{t('extend.label')}</span>
        </div>
      )}

      {/* イベントJSONモーダル */}
      {showEventJson && (
        <div className={styles.eventJsonModal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.eventJsonHeader}>
            <h3>イベントJSON</h3>
            {eventSize !== null && (
              <span className={styles.eventSize}>
                サイズ: {(eventSize / 1024).toFixed(2)} KB ({eventSize.toLocaleString()} bytes)
              </span>
            )}
            <button
              className={styles.closeButton}
              onClick={(e) => {
                e.stopPropagation();
                setShowEventJson(false);
              }}
              title="閉じる"
            >
              <svg width="24" height="24" viewBox="0 -960 960 960" fill="currentColor">
                <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
              </svg>
            </button>
          </div>
          <div className={styles.eventJsonContent}>
            {eventJson ? (
              <pre className={styles.eventJson}>
                {JSON.stringify(eventJson, null, 2)}
              </pre>
            ) : (
              <div className={styles.loadingContainer}>
                <Spinner size="md" />
                <span>読み込み中...</span>
              </div>
            )}
          </div>
          {eventJson && (
            <div className={styles.eventJsonActions}>
              <button
                className={styles.copyButton}
                onClick={async () => {
                  if (eventJson) {
                    await navigator.clipboard.writeText(JSON.stringify(eventJson, null, 2));
                    setIsCopied(true);
                    setTimeout(() => setIsCopied(false), 2000);
                  }
                }}
              >
                {isCopied ? 'コピーしました' : 'JSONをコピー'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>,
    document.body
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
          <Spinner size="md" />
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
