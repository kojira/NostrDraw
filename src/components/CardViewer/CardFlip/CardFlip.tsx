// カードフリップアニメーションコンポーネント

import { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { NostrDrawPost, NostrProfile } from '../../../types';
import { pubkeyToNpub, fetchProfiles } from '../../../services/profile';
import { sendReaction, hasUserReacted, streamReactionCounts, fetchCardById, fetchAncestors, fetchDescendants, mergeSvgWithDiff, getCardFullSvg, getCardFullSvgWithInfo, deleteCard, updateCardTags } from '../../../services/card';
import { addAnimationToNewElements, addAnimationToAllStrokes, injectStrokeAnimationStyles } from '../../../utils/svgDiff';
import type { Event, EventTemplate } from 'nostr-tools';
import { Spinner } from '../../common/Spinner';
import { TagInput } from '../../common/TagInput';
import { TagDisplay } from '../../common/TagDisplay';
import { fetchEvents } from '../../../services/relay';
import { NOSTRDRAW_KIND } from '../../../types';
import styles from './CardFlip.module.css';

interface CardFlipProps {
  card: NostrDrawPost;
  senderProfile?: NostrProfile | null;
  recipientProfile?: NostrProfile | null;
  onClose?: () => void;
  userPubkey?: string | null;
  signEvent?: (event: EventTemplate) => Promise<Event>;
  onExtend?: (card: NostrDrawPost) => void; // 描き足しボタンのコールバック
  onNavigateToCard?: (card: NostrDrawPost) => void; // 親子カードへのナビゲーション
  onCardUpdated?: (oldId: string, newId: string, updatedTags: string[]) => void; // カード更新時のコールバック
  usePortal?: boolean; // デフォルトtrue: createPortalでbodyに表示、false: 親コンポーネント内に表示
  // タグフォロー機能
  followedTags?: string[];
  onFollowTag?: (tag: string) => void;
  onUnfollowTag?: (tag: string) => void;
}

// SVGからviewBoxを解析してアスペクト比を計算
function getAspectRatioFromSvg(svg: string): number {
  // viewBox="x y width height" 形式を解析
  const viewBoxMatch = svg.match(/viewBox=["'](\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)["']/);
  if (viewBoxMatch) {
    const width = parseFloat(viewBoxMatch[3]);
    const height = parseFloat(viewBoxMatch[4]);
    if (width > 0 && height > 0) {
      return width / height;
    }
  }
  // width/height属性からも試みる
  const widthMatch = svg.match(/width=["'](\d+(?:\.\d+)?)["']/);
  const heightMatch = svg.match(/height=["'](\d+(?:\.\d+)?)["']/);
  if (widthMatch && heightMatch) {
    const width = parseFloat(widthMatch[1]);
    const height = parseFloat(heightMatch[1]);
    if (width > 0 && height > 0) {
      return width / height;
    }
  }
  return 4 / 3; // デフォルトは4:3
}

export const CardFlip = memo(function CardFlip({
  card,
  senderProfile,
  recipientProfile,
  onClose,
  userPubkey,
  signEvent,
  onExtend,
  onNavigateToCard,
  onCardUpdated,
  usePortal = true,
  followedTags = [],
  onFollowTag,
  onUnfollowTag,
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
  
  // SVGのviewBoxからアスペクト比を動的に計算
  const cardAspectRatio = useMemo(() => {
    const svgToAnalyze = animatedSvg || card.svg;
    return getAspectRatioFromSvg(svgToAnalyze);
  }, [animatedSvg, card.svg]);
  
  // 祖先の欠落情報（歯抜け対応）
  const [hasMissingAncestors, setHasMissingAncestors] = useState(false);
  
  // ツリー構造の状態（すべての祖先と子孫）
  const [ancestors, setAncestors] = useState<NostrDrawPost[]>([]);
  const [descendants, setDescendants] = useState<NostrDrawPost[]>([]);
  const [isLoadingTree, setIsLoadingTree] = useState(true);
  
  // ツリーカード用のプロファイルとリアクション数
  const [treeProfiles, setTreeProfiles] = useState<Map<string, NostrProfile>>(new Map());
  const [treeReactions, setTreeReactions] = useState<Map<string, number>>(new Map());
  
  // ツリーカード用の完全なSVG（差分マージ済み）
  const [treeMergedSvgs, setTreeMergedSvgs] = useState<Map<string, string>>(new Map());
  const fetchingTreeSvgsRef = useRef<Set<string>>(new Set());
  
  // シェアボタン用の状態
  const [isCopied, setIsCopied] = useState(false);

  // イベントJSON表示用の状態
  const [showEventJson, setShowEventJson] = useState(false);
  const [eventJson, setEventJson] = useState<Event | null>(null);
  const [isLoadingEvent, setIsLoadingEvent] = useState(false);
  const [eventSize, setEventSize] = useState<number | null>(null);
  
  // 三点メニュー用の状態
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  
  // 削除機能用の状態
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  
  // タグ編集機能用の状態
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [editingTags, setEditingTags] = useState<string[]>(card.tags || []);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [currentTags, setCurrentTags] = useState<string[]>(card.tags || []);
  
  // 自分の投稿かどうか
  const isOwner = userPubkey && userPubkey === card.pubkey;
  
  // メニューの外側クリックで閉じる
  useEffect(() => {
    if (!showMoreMenu) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoreMenu]);

  // 投稿を削除
  const handleDelete = useCallback(async () => {
    if (!signEvent || !isOwner) return;
    
    setIsDeleting(true);
    try {
      await deleteCard(card.id, '', signEvent);
      setIsDeleted(true);
      setShowDeleteConfirm(false);
      // 削除成功後、少し待ってからモーダルを閉じる
      setTimeout(() => {
        onClose?.();
      }, 1500);
    } catch (error) {
      console.error('Failed to delete card:', error);
      alert('削除に失敗しました');
    } finally {
      setIsDeleting(false);
    }
  }, [card.id, signEvent, isOwner, onClose]);

  // タグを保存
  const handleSaveTags = useCallback(async () => {
    if (!signEvent || !isOwner) return;
    
    setIsSavingTags(true);
    try {
      const result = await updateCardTags(card.id, editingTags, signEvent);
      if (result.success) {
        setCurrentTags(editingTags);
        setShowTagEditor(false);
        // 親コンポーネントに更新を通知
        if (result.newEventId && onCardUpdated) {
          onCardUpdated(card.id, result.newEventId, editingTags);
        }
      } else {
        alert(result.error || 'タグの保存に失敗しました');
      }
    } catch (error) {
      console.error('Failed to save tags:', error);
      alert('タグの保存に失敗しました');
    } finally {
      setIsSavingTags(false);
    }
  }, [card.id, editingTags, signEvent, isOwner, onCardUpdated]);

  // タグ編集モーダルを開く
  const openTagEditor = useCallback(() => {
    setEditingTags(currentTags);
    setShowTagEditor(true);
    setShowMoreMenu(false);
  }, [currentTags]);

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

  // リアクション状態を取得（ストリーミング）
  useEffect(() => {
    // ストリーミングでリアクション数を取得
    const unsubscribe = streamReactionCounts(
      [card.id],
      (counts) => {
        setReactionCount(counts.get(card.id) || 0);
      }
    );
    
    // 自分がリアクション済みかチェック
    if (userPubkey) {
      hasUserReacted(card.id, userPubkey).then(reacted => {
        setHasReacted(reacted);
      });
    }
    
    return () => {
      unsubscribe();
    };
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

  // ツリーカードのプロファイルとリアクション数を取得（ストリーミング）
  useEffect(() => {
    const allTreeCards = [...ancestors, ...descendants];
    if (allTreeCards.length === 0) return;
    
    // プロファイルを取得
    const pubkeys = [...new Set(allTreeCards.map(c => c.pubkey))];
    fetchProfiles(pubkeys).then(profiles => {
      setTreeProfiles(profiles);
    });
    
    // ストリーミングでリアクション数を取得
    const eventIds = allTreeCards.map(c => c.id);
    const unsubscribe = streamReactionCounts(
      eventIds,
      (reactions) => {
        setTreeReactions(new Map(reactions));
      }
    );
    
    return () => {
      unsubscribe();
    };
  }, [ancestors, descendants]);

  // ツリーカードの完全なSVGを取得（差分マージ）
  useEffect(() => {
    const allTreeCards = [...ancestors, ...descendants];
    
    allTreeCards.forEach(async (treeCard) => {
      // isDiffでない、または親がない場合はスキップ
      if (!treeCard.isDiff || !treeCard.parentEventId) return;
      // 既に取得中ならスキップ（refで管理）
      if (fetchingTreeSvgsRef.current.has(treeCard.id)) return;
      
      fetchingTreeSvgsRef.current.add(treeCard.id);
      
      try {
        const fullSvg = await getCardFullSvg(treeCard);
        setTreeMergedSvgs(prev => new Map(prev).set(treeCard.id, fullSvg));
      } catch (error) {
        console.error('Failed to get tree card full SVG:', error);
      }
    });
    // treeMergedSvgsを依存配列から除外（setTreeMergedSvgsを呼ぶと無限ループになるため）
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        setHasMissingAncestors(false);
        
        try {
          const parentCard = await fetchCardById(card.parentEventId);
          
          if (parentCard) {
            // 親カードの完全なSVG（差分チェーン全体をマージ済み）を取得（欠落情報付き）
            const parentResult = await getCardFullSvgWithInfo(parentCard);
            const parentFullSvg = parentResult.svg;
            
            // 親の祖先に欠落がある場合、フラグを設定
            if (parentResult.hasMissing) {
              setHasMissingAncestors(true);
            }
            
            // card.isDiffがtrueの場合、card.svgは差分のみなので親と合成が必要
            let fullSvg: string;
            if (card.isDiff) {
              // 差分保存の場合：親の完全なSVGと差分を合成
              fullSvg = mergeSvgWithDiff(parentFullSvg, card.svg);
            } else {
              // 従来形式（完全SVG保存）の場合
              fullSvg = card.svg;
            }
            
            // 差分検出してアニメーションクラスを追加
            const svgWithAnimation = addAnimationToNewElements(fullSvg, parentFullSvg);
            // アニメーションスタイルを注入
            const finalSvg = injectStrokeAnimationStyles(svgWithAnimation);
            setAnimatedSvg(finalSvg);
          } else {
            // 親が見つからない場合は欠落フラグを設定し、全ストロークにアニメーション
            setHasMissingAncestors(true);
            const svgWithAnimation = addAnimationToAllStrokes(card.svg);
            const finalSvg = injectStrokeAnimationStyles(svgWithAnimation);
            setAnimatedSvg(finalSvg);
          }
        } catch (error) {
          console.error('親イベントの取得に失敗:', error);
          // エラー時は欠落フラグを設定し、全ストロークにアニメーション
          setHasMissingAncestors(true);
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
  }, [card.parentEventId, card.svg, card.isDiff]);

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
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  };

  // コラボ数（子孫の数）
  const collabCount = descendants.length;

  // isInitialLoadingによる条件分岐を削除
  // ローディング中はメインコンテンツ内でオーバーレイ表示にする（DOM再構築を防ぎCSSアニメーションのリセットを回避）

  const cardContent = (
    <div className={usePortal ? styles.cardFlipContainer : styles.cardFlipContainerInline} onClick={onClose}>
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
          href={`${window.location.origin}${window.location.pathname}#user/${pubkeyToNpub(card.pubkey)}`}
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
        style={{ aspectRatio: cardAspectRatio }}
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
          <span className={`${styles.heartIcon} material-symbols-outlined`} style={{ fontVariationSettings: hasReacted ? "'FILL' 1" : "'FILL' 0" }}>
            favorite
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
        
        {/* 描き足しボタン（許可されている場合のみ表示） */}
        {card.allowExtend && onExtend && (
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
        
        {/* 三点メニュー */}
        <div className={styles.moreMenuContainer} ref={moreMenuRef}>
          <button
            className={styles.moreButton}
            onClick={(e) => {
              e.stopPropagation();
              setShowMoreMenu(!showMoreMenu);
            }}
            title="その他"
          >
            <svg width="20" height="20" viewBox="0 -960 960 960" fill="currentColor">
              <path d="M480-160q-33 0-56.5-23.5T400-240q0-33 23.5-56.5T480-320q33 0 56.5 23.5T560-240q0 33-23.5 56.5T480-160Zm0-240q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm0-240q-33 0-56.5-23.5T400-720q0-33 23.5-56.5T480-800q33 0 56.5 23.5T560-720q0 33-23.5 56.5T480-640Z"/>
            </svg>
          </button>
          
          {showMoreMenu && (
            <div className={styles.moreMenu}>
              <button
                className={styles.menuItem}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMoreMenu(false);
                  loadEventJson();
                }}
                disabled={isLoadingEvent}
              >
                {isLoadingEvent ? (
                  <Spinner size="sm" />
                ) : (
                              <svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor">
                                    <path d="M320-240 80-480l240-240 57 57-184 184 183 183-56 56Zm320 0-57-57 184-184-183-183 56-56 240 240-240 240Z"/>
                                  </svg>
                                )}
                                <span>JSONを確認</span>
                              </button>
                              
                              {/* タグ編集ボタン（自分の投稿のみ） */}
                              {isOwner && signEvent && (
                                <button
                                  className={styles.menuItem}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openTagEditor();
                                  }}
                                >
                                  <svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor">
                                    <path d="M840-480 666-234q-11 16-28.5 25t-37.5 9H200q-33 0-56.5-23.5T120-280v-400q0-33 23.5-56.5T200-760h400q20 0 37.5 9t28.5 25l174 246Zm-98 0L600-680H200v400h400l142-200Zm-542 0v200-400 200Z"/>
                                  </svg>
                                  <span>タグを編集</span>
                                </button>
                              )}
                              
                              {/* 削除ボタン（自分の投稿のみ） */}
                              {isOwner && signEvent && (
                <button
                  className={`${styles.menuItem} ${styles.deleteMenuItem}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMoreMenu(false);
                    setShowDeleteConfirm(true);
                  }}
                >
                  <svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor">
                    <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/>
                  </svg>
                  <span>削除する</span>
                </button>
              )}
            </div>
          )}
        </div>
        
        {/* アニメーション用のハートパーティクル */}
        {showReactionAnimation && (
          <div className={styles.heartParticles}>
            {[...Array(8)].map((_, i) => (
              <span key={i} className={`${styles.particle} material-symbols-outlined`} style={{ '--i': i, fontVariationSettings: "'FILL' 1" } as React.CSSProperties}>
                favorite
              </span>
            ))}
          </div>
        )}
        </div>
        
        {/* タグ表示 */}
        {currentTags.length > 0 && (
          <div className={styles.cardTags}>
            <TagDisplay
              tags={currentTags}
              size="medium"
              followedTags={followedTags}
              showFollowButton={!!onFollowTag && !!onUnfollowTag}
              onFollowToggle={(tag, isFollowed) => {
                if (isFollowed) {
                  onUnfollowTag?.(tag);
                } else {
                  onFollowTag?.(tag);
                }
              }}
            />
          </div>
        )}
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
            // isDiffの場合はマージ済みSVGを使用
            const displaySvg = ancestor.isDiff && ancestor.parentEventId
              ? treeMergedSvgs.get(ancestor.id) || null
              : ancestor.svg;
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
                    {displaySvg ? (
                      <div 
                        className={styles.miniSvg}
                        dangerouslySetInnerHTML={{ __html: displaySvg }}
                      />
                    ) : ancestor.isDiff ? (
                      <Spinner size="sm" />
                    ) : null}
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
                      <span className={styles.cardReactions}><span className="material-symbols-outlined" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>favorite</span> {reactions}</span>
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
                {animatedSvg ? (
                  <div 
                    className={styles.miniSvg}
                    dangerouslySetInnerHTML={{ __html: animatedSvg }}
                  />
                ) : card.svg ? (
                  <div 
                    className={styles.miniSvg}
                    dangerouslySetInnerHTML={{ __html: card.svg }}
                  />
                ) : null}
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
                  <span className={styles.cardReactions}><span className="material-symbols-outlined" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>favorite</span> {reactionCount}</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* 子孫カード */}
          {descendants.map((descendant) => {
            const profile = treeProfiles.get(descendant.pubkey);
            const reactions = treeReactions.get(descendant.id) || 0;
            // isDiffの場合はマージ済みSVGを使用
            const displaySvg = descendant.isDiff && descendant.parentEventId
              ? treeMergedSvgs.get(descendant.id) || null
              : descendant.svg;
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
                    {displaySvg ? (
                      <div 
                        className={styles.miniSvg}
                        dangerouslySetInnerHTML={{ __html: displaySvg }}
                      />
                    ) : descendant.isDiff ? (
                      <Spinner size="sm" />
                    ) : null}
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
                      <span className={styles.cardReactions}><span className="material-symbols-outlined" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>favorite</span> {reactions}</span>
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

      {/* 祖先欠落警告 */}
      {hasMissingAncestors && (
        <div className={styles.missingAncestorsWarning}>
          <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor">
            <path d="m40-120 440-760 440 760H40Zm138-80h604L480-720 178-200Zm302-40q17 0 28.5-11.5T520-280q0-17-11.5-28.5T480-320q-17 0-28.5 11.5T440-280q0 17 11.5 28.5T480-240Zm-40-120h80v-200h-80v200Zm40-100Z"/>
          </svg>
          <span>一部の描き足し元が削除されているため、完全な表示ではありません</span>
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

      {/* タグ編集モーダルはcreatePortalで別途レンダリング */}

      {/* 削除確認モーダル */}
      {showDeleteConfirm && (
        <div className={styles.deleteConfirmModal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.deleteConfirmContent}>
            <h3>投稿を削除しますか？</h3>
            <p>この操作は取り消せません。削除リクエストがリレーに送信されます。</p>
            {card.allowExtend && (
              <p className={styles.deleteWarning}>
                ⚠️ この投稿に描き足しがある場合、それらの表示に影響が出る可能性があります。
              </p>
            )}
            <div className={styles.deleteConfirmButtons}>
              <button
                className={styles.cancelButton}
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                キャンセル
              </button>
              <button
                className={styles.deleteButton}
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? <Spinner size="sm" /> : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 削除完了メッセージ */}
      {isDeleted && (
        <div className={styles.deletedOverlay}>
          <div className={styles.deletedMessage}>
            <svg width="48" height="48" viewBox="0 -960 960 960" fill="currentColor">
              <path d="m424-296 282-282-56-56-226 226-114-114-56 56 170 170Zm56 216q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z"/>
            </svg>
            <span>削除リクエストを送信しました</span>
          </div>
        </div>
      )}
    </div>
  );

  // タグ編集モーダル（CardFlipのイベントハンドリングから完全に分離）
  const tagEditorModal = showTagEditor && createPortal(
    <div 
      className={styles.tagEditorModal} 
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className={styles.tagEditorContent}>
        <h3>🏷️ タグを編集</h3>
        <TagInput
          selectedTags={editingTags}
          onChange={setEditingTags}
          disabled={isSavingTags}
          placeholder={t('tags.placeholder', 'タグを追加...')}
        />
        <div className={styles.tagEditorButtons}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={(e) => {
              e.stopPropagation();
              setShowTagEditor(false);
            }}
            disabled={isSavingTags}
          >
            キャンセル
          </button>
          <button
            type="button"
            className={styles.saveButton}
            onClick={(e) => {
              e.stopPropagation();
              handleSaveTags();
            }}
            disabled={isSavingTags}
          >
            {isSavingTags ? <Spinner size="sm" /> : '保存'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <>
      {usePortal ? createPortal(cardContent, document.body) : cardContent}
      {tagEditorModal}
    </>
  );
}, (prevProps, nextProps) => {
  // card.idが同じなら再レンダリングしない
  return prevProps.card.id === nextProps.card.id &&
         prevProps.userPubkey === nextProps.userPubkey &&
         prevProps.usePortal === nextProps.usePortal;
});

// SVGを安全にレンダリングするためのコンポーネント
// memo化してDOM再作成によるアニメーションリセットを防ぐ
const SvgRenderer = memo(function SvgRenderer({ 
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
  
  // SVGにwidth="100%"とheight="100%"を追加して親要素いっぱいに表示
  const makeResponsive = (svgString: string): string => {
    // 既存のwidth/heightを削除してviewBoxを保持しつつ100%にする
    return svgString
      .replace(/<svg([^>]*)width="[^"]*"/, '<svg$1')
      .replace(/<svg([^>]*)height="[^"]*"/, '<svg$1')
      .replace(/<svg/, '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet"');
  };
  
  const responsiveSvg = makeResponsive(svg);
  
  // 直接レンダリングが必要な場合（アニメーション用）または外部画像がある場合
  if (hasExternalImage || forceDirectRender) {
    // 外部画像を含むSVGまたはアニメーション付きSVGは直接HTMLとしてレンダリング
    return (
      <div 
        className={className}
        dangerouslySetInnerHTML={{ __html: responsiveSvg }}
        style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      />
    );
  }
  
  // 外部画像がない場合はdata URI経由で表示（より安全）
  const encoded = btoa(unescape(encodeURIComponent(responsiveSvg)));
  const dataUri = `data:image/svg+xml;base64,${encoded}`;
  return <img src={dataUri} alt="" className={className} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />;
});

// カードコンテンツ表示（レイアウト対応）
// memo化してアニメーションリセットを防ぐ
const CardContent = memo(function CardContent({ 
  card, 
  animatedSvg, 
  isLoadingParent 
}: { 
  card: NostrDrawPost; 
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
});
