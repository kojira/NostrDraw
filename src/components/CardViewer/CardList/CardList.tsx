// 年賀状リストコンポーネント

import type { NewYearCard, NostrProfile } from '../../../types';
import { pubkeyToNpub } from '../../../services/profile';
import styles from './CardList.module.css';

// SVGを安全にレンダリングするためのコンポーネント
function SvgRenderer({ svg, className }: { svg: string; className?: string }) {
  // SVGに外部画像参照が含まれているかチェック
  const hasExternalImage = svg.includes('<image') && svg.includes('href=');
  
  if (hasExternalImage) {
    // 外部画像を含むSVGは直接HTMLとしてレンダリング
    return (
      <div 
        className={className}
        dangerouslySetInnerHTML={{ __html: svg }}
        style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
      />
    );
  }
  
  // 外部画像がない場合はdata URI経由で表示
  const encoded = btoa(unescape(encodeURIComponent(svg)));
  const dataUri = `data:image/svg+xml;base64,${encoded}`;
  return <img src={dataUri} alt="" className={className} />;
}

interface CardListProps {
  cards: NewYearCard[];
  profiles: Map<string, NostrProfile>;
  onSelectCard: (card: NewYearCard) => void;
  isLoading: boolean;
  error: string | null;
  type: 'gallery' | 'received' | 'sent';
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
        お手紙を読み込み中...
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
    const emptyMessages = {
      gallery: 'まだ作品がありません',
      received: '届いたお手紙はありません',
      sent: '送ったお手紙はありません',
    };
    return (
      <div className={styles.empty}>
        {emptyMessages[type]}
      </div>
    );
  }

  return (
    <div className={styles.cardList}>
      <ul className={styles.list}>
        {cards.map((card) => {
          // galleryの場合は投稿者を表示
          const displayPubkey = type === 'gallery' 
            ? card.pubkey 
            : type === 'received' 
              ? card.pubkey 
              : card.recipientPubkey;
          const picture = displayPubkey ? getProfilePicture(displayPubkey) : null;
          const name = displayPubkey ? getProfileName(displayPubkey) : 'みんな';

          return (
            <li
              key={card.id}
              className={styles.item}
              onClick={() => onSelectCard(card)}
            >
              <div className={styles.thumbnail}>
                {card.svg ? (
                  <SvgRenderer svg={card.svg} className={styles.thumbnailImage} />
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

