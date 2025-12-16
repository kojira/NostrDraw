// リレー設定コンポーネント

import { useState } from 'react';
import type { RelayConfig } from '../../types';
import styles from './RelaySettings.module.css';

interface RelaySettingsProps {
  relays: RelayConfig[];
  onAddRelay: (relay: RelayConfig) => void;
  onRemoveRelay: (url: string) => void;
  onResetToDefault: () => void;
  onFetchFromNip07?: () => Promise<RelayConfig[] | null>;
  isNip07LoggedIn: boolean;
}

export function RelaySettings({
  relays,
  onAddRelay,
  onRemoveRelay,
  onResetToDefault,
  onFetchFromNip07,
  isNip07LoggedIn,
}: RelaySettingsProps) {
  const [newRelayUrl, setNewRelayUrl] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
        setError('リレー情報を取得できませんでした');
      }
    } catch {
      setError('リレー情報の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.relaySettings}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={styles.toggleButton}
      >
        <span>リレー設定</span>
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
              placeholder="wss://relay.example.com"
              className={styles.input}
            />
            <button type="submit" className={styles.addButton}>
              追加
            </button>
          </form>

          {error && <p className={styles.error}>{error}</p>}

          {/* アクションボタン */}
          <div className={styles.actions}>
            {isNip07LoggedIn && onFetchFromNip07 && (
              <button
                onClick={handleFetchFromNip07}
                disabled={isLoading}
                className={styles.actionButton}
              >
                {isLoading ? '取得中...' : 'NIP-07からリレーを取得'}
              </button>
            )}
            <button onClick={onResetToDefault} className={styles.actionButton}>
              デフォルトに戻す
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

