// 宛先選択コンポーネント（フォロイーからのインクリメンタル検索）

import { useState, useMemo, useCallback } from 'react';
import type { NostrProfile } from '../../types';
import { pubkeyToNpub, npubToPubkey } from '../../services/profile';
import styles from './RecipientSelect.module.css';

interface RecipientSelectProps {
  followees: NostrProfile[];
  selectedPubkey: string | null;
  onSelect: (pubkey: string | null) => void;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function RecipientSelect({
  followees,
  selectedPubkey,
  onSelect,
  isLoading,
  error,
  onRefresh,
}: RecipientSelectProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [manualNpub, setManualNpub] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // 検索クエリでフィルタリング
  const filteredFollowees = useMemo(() => {
    if (!searchQuery.trim()) {
      return followees;
    }

    const query = searchQuery.toLowerCase();
    return followees.filter((profile) => {
      const name = profile.name?.toLowerCase() || '';
      const displayName = profile.display_name?.toLowerCase() || '';
      const npub = profile.npub?.toLowerCase() || pubkeyToNpub(profile.pubkey).toLowerCase();
      
      return (
        name.includes(query) ||
        displayName.includes(query) ||
        npub.includes(query)
      );
    });
  }, [followees, searchQuery]);

  // 選択されたプロフィールを取得
  const selectedProfile = useMemo(() => {
    if (!selectedPubkey) return null;
    return followees.find(f => f.pubkey === selectedPubkey) || null;
  }, [followees, selectedPubkey]);

  const handleManualSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);

    const trimmed = manualNpub.trim();
    if (!trimmed) {
      setManualError('npubを入力してください');
      return;
    }

    if (!trimmed.startsWith('npub1')) {
      setManualError('npubはnpub1で始まる必要があります');
      return;
    }

    const pubkey = npubToPubkey(trimmed);
    if (!pubkey) {
      setManualError('無効なnpubです');
      return;
    }

    onSelect(pubkey);
    setShowManualInput(false);
    setManualNpub('');
  }, [manualNpub, onSelect]);

  const getDisplayName = (profile: NostrProfile) => {
    return profile.display_name || profile.name || profile.npub?.slice(0, 12) + '...' || pubkeyToNpub(profile.pubkey).slice(0, 12) + '...';
  };

  return (
    <div className={styles.recipientSelect}>
      <div className={styles.header}>
        <h3 className={styles.title}>宛先を選択</h3>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className={styles.refreshButton}
          title="フォロイーを再読み込み"
        >
          {isLoading ? '読込中...' : '🔄'}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {/* 選択中の宛先 */}
      {selectedPubkey && (
        <div className={styles.selected}>
          <span className={styles.selectedLabel}>選択中:</span>
          <div className={styles.selectedProfile}>
            {selectedProfile?.picture && (
              <img
                src={selectedProfile.picture}
                alt=""
                className={styles.selectedAvatar}
              />
            )}
            <span className={styles.selectedName}>
              {selectedProfile ? getDisplayName(selectedProfile) : pubkeyToNpub(selectedPubkey).slice(0, 16) + '...'}
            </span>
          </div>
          <button
            onClick={() => onSelect(null)}
            className={styles.clearButton}
          >
            ×
          </button>
        </div>
      )}

      {/* 検索入力 */}
      <div className={styles.searchContainer}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="名前、display_name、npubで検索..."
          className={styles.searchInput}
        />
      </div>

      {/* フォロイーリスト */}
      <div className={styles.listContainer}>
        {isLoading ? (
          <div className={styles.loading}>フォロイーを読み込み中...</div>
        ) : filteredFollowees.length === 0 ? (
          <div className={styles.empty}>
            {searchQuery ? '該当するフォロイーが見つかりません' : 'フォロイーがいません'}
          </div>
        ) : (
          <ul className={styles.list}>
            {filteredFollowees.map((profile) => (
              <li
                key={profile.pubkey}
                className={`${styles.item} ${profile.pubkey === selectedPubkey ? styles.itemSelected : ''}`}
                onClick={() => onSelect(profile.pubkey)}
              >
                {profile.picture ? (
                  <img
                    src={profile.picture}
                    alt=""
                    className={styles.avatar}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className={styles.avatarPlaceholder}>👤</div>
                )}
                <div className={styles.profileInfo}>
                  <span className={styles.name}>{getDisplayName(profile)}</span>
                  {profile.name && profile.display_name && profile.name !== profile.display_name && (
                    <span className={styles.subName}>@{profile.name}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 手動入力トグル */}
      <div className={styles.manualSection}>
        <button
          onClick={() => setShowManualInput(!showManualInput)}
          className={styles.manualToggle}
        >
          {showManualInput ? '閉じる' : 'npubを直接入力'}
        </button>

        {showManualInput && (
          <form onSubmit={handleManualSubmit} className={styles.manualForm}>
            <input
              type="text"
              value={manualNpub}
              onChange={(e) => setManualNpub(e.target.value)}
              placeholder="npub1..."
              className={styles.manualInput}
            />
            <button type="submit" className={styles.manualSubmit}>
              選択
            </button>
          </form>
        )}
        {manualError && <p className={styles.error}>{manualError}</p>}
      </div>
    </div>
  );
}

