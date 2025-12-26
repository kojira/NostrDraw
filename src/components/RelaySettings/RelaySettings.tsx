// リレー設定コンポーネント

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RelayConfig } from '../../types';
import styles from './RelaySettings.module.css';

interface RelaySettingsProps {
  relays: RelayConfig[];
  onAddRelay: (relay: RelayConfig) => void;
  onRemoveRelay: (url: string) => void;
  onResetToDefault: () => void;
  onFetchFromNip07?: () => Promise<RelayConfig[] | null>;
  onFetchFromNip65?: () => Promise<RelayConfig[]>;
  isNip07LoggedIn: boolean;
  userPubkey?: string | null;
}

export function RelaySettings({
  relays,
  onAddRelay,
  onRemoveRelay,
  onResetToDefault,
  onFetchFromNip07,
  onFetchFromNip65,
  isNip07LoggedIn,
  userPubkey,
}: RelaySettingsProps) {
  const { t } = useTranslation();
  const [newRelayUrl, setNewRelayUrl] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingNip65, setIsLoadingNip65] = useState(false);

  const handleAddRelay = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const url = newRelayUrl.trim();
    
    if (!url) {
      setError('URLを入力してください');
      return;
    }

    if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
      setError('URLはwss://またはws://で始まる必要があります');
      return;
    }

    if (relays.some(r => r.url === url)) {
      setError('このリレーは既に追加されています');
      return;
    }

    onAddRelay({ url, read: true, write: true });
    setNewRelayUrl('');
  };

  const handleFetchFromNip07 = async () => {
    if (!onFetchFromNip07) return;

    setIsLoading(true);
    setError(null);

    try {
      const nip07Relays = await onFetchFromNip07();
      if (nip07Relays && nip07Relays.length > 0) {
        nip07Relays.forEach(relay => {
          if (!relays.some(r => r.url === relay.url)) {
            onAddRelay(relay);
          }
        });
      } else {
        setError(t('relay.noRelaysFound'));
      }
    } catch {
      setError(t('relay.fetchError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchFromNip65 = async () => {
    if (!onFetchFromNip65) return;

    setIsLoadingNip65(true);
    setError(null);

    try {
      const nip65Relays = await onFetchFromNip65();
      if (nip65Relays && nip65Relays.length > 0) {
        let addedCount = 0;
        nip65Relays.forEach(relay => {
          if (!relays.some(r => r.url === relay.url)) {
            onAddRelay(relay);
            addedCount++;
          }
        });
        if (addedCount === 0) {
          setError(t('relay.alreadyAdded'));
        }
      } else {
        setError(t('relay.noRelaysFound'));
      }
    } catch {
      setError(t('relay.fetchError'));
    } finally {
      setIsLoadingNip65(false);
    }
  };

  return (
    <div className={styles.relaySettings}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={styles.toggleButton}
      >
        <span>{t('relay.title')}</span>
        <span className={styles.count}>({relays.length})</span>
        <span className={`${styles.arrow} ${isExpanded ? styles.expanded : ''}`}>
          ▼
        </span>
      </button>

      {isExpanded && (
        <div className={styles.content}>
          {/* リレーリスト */}
          <ul className={styles.relayList}>
            {relays.map((relay) => (
              <li key={relay.url} className={styles.relayItem}>
                <span className={styles.relayUrl}>{relay.url}</span>
                <div className={styles.relayFlags}>
                  {relay.read && <span className={styles.flag}>R</span>}
                  {relay.write && <span className={styles.flag}>W</span>}
                </div>
                <button
                  onClick={() => onRemoveRelay(relay.url)}
                  className={styles.removeButton}
                  title="削除"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          {/* リレー追加フォーム */}
          <form onSubmit={handleAddRelay} className={styles.addForm}>
            <input
              type="text"
              value={newRelayUrl}
              onChange={(e) => setNewRelayUrl(e.target.value)}
              placeholder={t('relay.urlPlaceholder')}
              className={styles.input}
            />
            <button type="submit" className={styles.addButton}>
              {t('relay.add')}
            </button>
          </form>

          {error && <p className={styles.error}>{error}</p>}

          {/* アクションボタン */}
          <div className={styles.actions}>
            {/* NIP-65からリレーを取得（npub ログインでも使用可能） */}
            {userPubkey && onFetchFromNip65 && (
              <button
                onClick={handleFetchFromNip65}
                disabled={isLoadingNip65}
                className={styles.actionButton}
              >
                {isLoadingNip65 ? t('relay.fetching') : t('relay.fetchFromNip65')}
              </button>
            )}
            {/* NIP-07からリレーを取得（NIP-07ログイン時のみ） */}
            {isNip07LoggedIn && onFetchFromNip07 && (
              <button
                onClick={handleFetchFromNip07}
                disabled={isLoading}
                className={styles.actionButton}
              >
                {isLoading ? t('relay.fetching') : t('relay.fetchFromNip07')}
              </button>
            )}
            <button onClick={onResetToDefault} className={styles.actionButton}>
              {t('relay.reset')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

