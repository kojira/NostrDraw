// 年賀状リストコンポーネント

import type { NewYearCard, NostrProfile } from '../../../types';
import { pubkeyToNpub } from '../../../services/profile';
import styles from './CardList.module.css';

// SVGをdata URIに変換
function svgToDataUri(svg: string): string {
  const encoded = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${encoded}`;
}

interface CardListProps {
  cards: NewYearCard[];
  profiles: Map<string, NostrProfile>;
  onSelectCard: (card: NewYearCard) => void;
  isLoading: boolean;
  error: string | null;
  type: 'received' | 'sent';
}

export function CardList({
  cards,
  profiles,
  onSelectCard,
  isLoading,
  error,
  type,
}: CardListProps) {
  const getProfileName = (pubkey: string) => {
    const profile = profiles.get(pubkey);
    if (profile?.display_name) return profile.display_name;
    if (profile?.name) return profile.name;
    return pubkeyToNpub(pubkey).slice(0, 12) + '...';
  };

  const getProfilePicture = (pubkey: string) => {
    return profiles.get(pubkey)?.picture;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className={styles.loading}>
        年賀状を読み込み中...
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        {error}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className={styles.empty}>
        {type === 'received' ? '届いた年賀状はありません' : '送った年賀状はありません'}
      </div>
    );
  }

  return (
    <div className={styles.cardList}>
      <ul className={styles.list}>
        {cards.map((card) => {
          const otherPubkey = type === 'received' ? card.pubkey : card.recipientPubkey;
          const picture = getProfilePicture(otherPubkey);
          const name = getProfileName(otherPubkey);
          const thumbnailSrc = card.svg ? svgToDataUri(card.svg) : null;

          return (
            <li
              key={card.id}
              className={styles.item}
              onClick={() => onSelectCard(card)}
            >
              <div className={styles.thumbnail}>
                {thumbnailSrc ? (
                  <img src={thumbnailSrc} alt="" className={styles.thumbnailImage} />
                ) : (
                  <span className={styles.placeholderEmoji}>🎍</span>
                )}
              </div>
              <div className={styles.info}>
                <div className={styles.header}>
                  {picture && (
                    <img src={picture} alt="" className={styles.avatar} />
                  )}
                  <span className={styles.name}>{name}</span>
                  <span className={styles.date}>{formatDate(card.createdAt)}</span>
                </div>
                <p className={styles.preview}>
                  {card.message.slice(0, 50)}
                  {card.message.length > 50 ? '...' : ''}
                </p>
              </div>
              <span className={styles.arrow}>→</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

