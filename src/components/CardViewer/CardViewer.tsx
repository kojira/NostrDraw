// 年賀状ビューア統合コンポーネント

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { NostrDrawPost, NostrProfile } from '../../types';
import type { Event, EventTemplate } from 'nostr-tools';
import { fetchProfile } from '../../services/profile';
import { CardList } from './CardList';
import { CardFlip } from './CardFlip';
import styles from './CardViewer.module.css';

interface CardViewerProps {
  receivedCards: NostrDrawPost[];
  sentCards: NostrDrawPost[];
  receivedCount: number;
  sentCount: number;
  isLoadingReceived: boolean;
  isLoadingSent: boolean;
  errorReceived: string | null;
  errorSent: string | null;
  onRefresh: () => void;
  userPubkey?: string | null;
  signEvent?: (event: EventTemplate) => Promise<Event>;
  onExtend?: (card: NostrDrawPost) => void;
}

type TabType = 'received' | 'sent';

export function CardViewer({
  receivedCards,
  sentCards,
  receivedCount,
  sentCount,
  isLoadingReceived,
  isLoadingSent,
  errorReceived,
  errorSent,
  onRefresh,
  userPubkey,
  signEvent,
  onExtend,
}: CardViewerProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('received');
  const [selectedCard, setSelectedCard] = useState<NostrDrawPost | null>(null);
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(new Map());
  const [senderProfile, setSenderProfile] = useState<NostrProfile | null>(null);
  const [recipientProfile, setRecipientProfile] = useState<NostrProfile | null>(null);

  // プロフィールを取得
  useEffect(() => {
    const allCards = [...receivedCards, ...sentCards];
    const pubkeysToFetch = new Set<string>();

    allCards.forEach(card => {
      pubkeysToFetch.add(card.pubkey);
      if (card.recipientPubkey) {
        pubkeysToFetch.add(card.recipientPubkey);
      }
    });

    pubkeysToFetch.forEach(async (pubkey) => {
      if (!profiles.has(pubkey)) {
        const profile = await fetchProfile(pubkey);
        if (profile) {
          setProfiles(prev => new Map(prev).set(pubkey, profile));
        }
      }
    });
  }, [receivedCards, sentCards]);

  // 選択されたカードのプロフィールを取得
  useEffect(() => {
    if (!selectedCard) {
      setSenderProfile(null);
      setRecipientProfile(null);
      return;
    }

    const loadProfiles = async () => {
      const sender = await fetchProfile(selectedCard.pubkey);
      setSenderProfile(sender);
      
      if (selectedCard.recipientPubkey) {
        const recipient = await fetchProfile(selectedCard.recipientPubkey);
        setRecipientProfile(recipient);
      } else {
        setRecipientProfile(null);
      }
    };

    loadProfiles();
  }, [selectedCard]);

  const handleSelectCard = (card: NostrDrawPost) => {
    setSelectedCard(card);
  };

  const handleCloseCard = () => {
    setSelectedCard(null);
  };

  return (
    <div className={styles.cardViewer}>
      {/* ヘッダー */}
      <div className={styles.header}>
        <h2 className={styles.title}>お手紙</h2>
        <button
          onClick={onRefresh}
          disabled={isLoadingReceived || isLoadingSent}
          className={styles.refreshButton}
        >
          🔄
        </button>
      </div>

      {/* カード件数バッジ */}
      <div className={styles.badges}>
        <div className={styles.badge}>
          <span className={styles.badgeIcon}>📨</span>
          <span className={styles.badgeLabel}>届いた</span>
          <span className={styles.badgeCount}>{receivedCount}</span>
        </div>
        <div className={styles.badge}>
          <span className={styles.badgeIcon}>📤</span>
          <span className={styles.badgeLabel}>送った</span>
          <span className={styles.badgeCount}>{sentCount}</span>
        </div>
      </div>

      {/* タブ */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'received' ? styles.active : ''}`}
          onClick={() => setActiveTab('received')}
        >
          📨 {t('viewer.received')} ({receivedCount})
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'sent' ? styles.active : ''}`}
          onClick={() => setActiveTab('sent')}
        >
          📤 {t('viewer.sent')} ({sentCount})
        </button>
      </div>

      {/* リスト */}
      <div className={styles.listContainer}>
        {activeTab === 'received' ? (
          <CardList
            cards={receivedCards}
            profiles={profiles}
            onSelectCard={handleSelectCard}
            isLoading={isLoadingReceived}
            error={errorReceived}
            type="received"
          />
        ) : (
          <CardList
            cards={sentCards}
            profiles={profiles}
            onSelectCard={handleSelectCard}
            isLoading={isLoadingSent}
            error={errorSent}
            type="sent"
          />
        )}
      </div>

      {/* カード詳細モーダル */}
      {selectedCard && (
        <div className={styles.modal} onClick={handleCloseCard}>
          <div onClick={(e) => e.stopPropagation()}>
            <CardFlip
              card={selectedCard}
              senderProfile={senderProfile}
              recipientProfile={recipientProfile}
              onClose={handleCloseCard}
              userPubkey={userPubkey}
              signEvent={signEvent}
              onExtend={onExtend}
            />
          </div>
        </div>
      )}
    </div>
  );
}

