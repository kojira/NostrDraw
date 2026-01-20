// 設定ページコンポーネント

import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_RELAYS, type RelayConfig } from '../../types';
import { fetchUserRelayList } from '../../services/relay';
import { getEventCacheStats, setMaxCacheSize, clearEventCache } from '../../services/eventCache';
import styles from './Settings.module.css';

interface SettingsProps {
  theme: 'dark' | 'light';
  onThemeChange: (theme: 'dark' | 'light') => void;
  relays: RelayConfig[];
  onRelaysChange: (relays: RelayConfig[]) => void;
  userPubkey: string | null;
  onRefreshFollowees?: () => void;
  isLoadingFollowees?: boolean;
}

// デフォルトリレーのURLリスト
const DEFAULT_RELAY_URLS = DEFAULT_RELAYS.map(r => r.url);

export function Settings({
  theme,
  onThemeChange,
  relays,
  onRelaysChange,
  userPubkey,
  onRefreshFollowees,
  isLoadingFollowees,
}: SettingsProps) {
  const { t, i18n } = useTranslation();
  const [newRelayUrl, setNewRelayUrl] = useState('');
  const [isLoadingNip65, setIsLoadingNip65] = useState(false);
  const [nip65Error, setNip65Error] = useState<string | null>(null);
  const [nip65Success, setNip65Success] = useState<string | null>(null);
  
  // キャッシュ統計
  const [cacheStats, setCacheStats] = useState(() => getEventCacheStats());
  
  // キャッシュ統計を定期更新
  useEffect(() => {
    const interval = setInterval(() => {
      setCacheStats(getEventCacheStats());
    }, 2000);
    return () => clearInterval(interval);
  }, []);
  
  // 最大キャッシュサイズを変更
  const handleMaxCacheSizeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const sizeMB = parseInt(e.target.value, 10);
    const sizeBytes = sizeMB * 1024 * 1024;
    setMaxCacheSize(sizeBytes);
    setCacheStats(getEventCacheStats());
  }, []);
  
  // キャッシュをクリア
  const handleClearCache = useCallback(() => {
    if (window.confirm(t('settings.cacheClearConfirm'))) {
      clearEventCache();
      setCacheStats(getEventCacheStats());
    }
  }, [t]);

  // リレーがデフォルトかどうかを判定
  const isDefaultRelay = useCallback((url: string) => {
    return DEFAULT_RELAY_URLS.includes(url);
  }, []);

  // リレーを追加
  const handleAddRelay = useCallback(() => {
    const url = newRelayUrl.trim();
    if (!url) return;
    
    // wss:// または ws:// で始まるかチェック
    if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
      return;
    }

    // 既に存在するかチェック
    if (relays.some(r => r.url === url)) {
      return;
    }

    const newRelay: RelayConfig = {
      url,
      read: true,
      write: true,
    };

    onRelaysChange([...relays, newRelay]);
    setNewRelayUrl('');
  }, [newRelayUrl, relays, onRelaysChange]);

  // リレーを削除
  const handleRemoveRelay = useCallback((url: string) => {
    // デフォルトリレーは削除不可
    if (isDefaultRelay(url)) {
      return;
    }
    onRelaysChange(relays.filter(r => r.url !== url));
  }, [relays, onRelaysChange, isDefaultRelay]);

  // リレーのread/write設定を切り替え
  const handleToggleRelay = useCallback((url: string, field: 'read' | 'write') => {
    onRelaysChange(relays.map(r => {
      if (r.url === url) {
        return { ...r, [field]: !r[field] };
      }
      return r;
    }));
  }, [relays, onRelaysChange]);

  // NIP-65からリレーを取得
  const handleFetchNip65 = useCallback(async () => {
    if (!userPubkey) {
      setNip65Error(t('settings.nip65LoginRequired'));
      return;
    }

    setIsLoadingNip65(true);
    setNip65Error(null);
    setNip65Success(null);

    try {
      const userRelays = await fetchUserRelayList(userPubkey, i18n.language);
      
      if (userRelays.length === 0) {
        setNip65Error(t('settings.nip65NotFound'));
        return;
      }

      // デフォルトリレーを保持しつつ、新しいリレーを追加
      const mergedRelays = [...DEFAULT_RELAYS];
      
      for (const relay of userRelays) {
        const existing = mergedRelays.find(r => r.url === relay.url);
        if (!existing) {
          mergedRelays.push(relay);
        }
      }

      onRelaysChange(mergedRelays);
      setNip65Success(t('settings.nip65Success', { count: userRelays.length }));
    } catch (error) {
      console.error('Failed to fetch NIP-65:', error);
      setNip65Error(t('settings.nip65Error'));
    } finally {
      setIsLoadingNip65(false);
    }
  }, [userPubkey, i18n.language, onRelaysChange, t]);

  // デフォルトにリセット
  const handleResetRelays = useCallback(() => {
    onRelaysChange([...DEFAULT_RELAYS]);
  }, [onRelaysChange]);

  return (
    <div className={styles.settingsContainer}>
      <h2 className={styles.title}>{t('settings.title')}</h2>

      {/* テーマ設定 */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('settings.theme')}</h3>
        <div className={styles.themeSelector}>
          <button
            className={`${styles.themeButton} ${theme === 'dark' ? styles.active : ''}`}
            onClick={() => onThemeChange('dark')}
          >
            🌙 {t('settings.themeDark')}
          </button>
          <button
            className={`${styles.themeButton} ${theme === 'light' ? styles.active : ''}`}
            onClick={() => onThemeChange('light')}
          >
            ☀️ {t('settings.themeLight')}
          </button>
        </div>
      </section>

      {/* キャッシュ設定 */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('settings.cache')}</h3>
        
        <div className={styles.cacheInfo}>
          <div className={styles.cacheStatRow}>
            <span className={styles.cacheStatLabel}>{t('settings.cacheSize')}</span>
            <span className={styles.cacheStatValue}>
              {cacheStats.sizeMB} {t('settings.cacheSizeUnit')} / {cacheStats.maxSizeMB} {t('settings.cacheSizeUnit')}
              <span className={styles.cachePercent}>({cacheStats.usagePercent}%)</span>
            </span>
          </div>
          <div className={styles.cacheProgressBar}>
            <div 
              className={styles.cacheProgressFill} 
              style={{ width: `${cacheStats.usagePercent}%` }}
            />
          </div>
          <div className={styles.cacheStatRow}>
            <span className={styles.cacheStatLabel}>{t('settings.cacheCount')}</span>
            <span className={styles.cacheStatValue}>{cacheStats.count.toLocaleString()}</span>
          </div>
        </div>
        
        <div className={styles.cacheControls}>
          <div className={styles.cacheMaxSizeControl}>
            <label className={styles.cacheLabel}>{t('settings.cacheMaxSize')}</label>
            <select 
              className={styles.cacheSelect}
              value={parseInt(cacheStats.maxSizeMB, 10)}
              onChange={handleMaxCacheSizeChange}
            >
              <option value="10">{t('settings.cacheMaxSizeOptions.10')}</option>
              <option value="25">{t('settings.cacheMaxSizeOptions.25')}</option>
              <option value="50">{t('settings.cacheMaxSizeOptions.50')}</option>
              <option value="100">{t('settings.cacheMaxSizeOptions.100')}</option>
              <option value="200">{t('settings.cacheMaxSizeOptions.200')}</option>
            </select>
          </div>
          <button 
            className={styles.cacheClearButton}
            onClick={handleClearCache}
          >
            {t('settings.cacheClear')}
          </button>
        </div>
      </section>

      {/* フォロー情報 */}
      {userPubkey && onRefreshFollowees && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('settings.followees')}</h3>
          <p className={styles.sectionDescription}>{t('settings.followeesDescription')}</p>
          <button
            className={styles.nip65Button}
            onClick={onRefreshFollowees}
            disabled={isLoadingFollowees}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px', marginRight: '4px', verticalAlign: 'middle' }}>
              {isLoadingFollowees ? 'hourglass_empty' : 'refresh'}
            </span>
            {isLoadingFollowees ? t('settings.followeesLoading') : t('settings.followeesRefresh')}
          </button>
        </section>
      )}

      {/* リレー設定 */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('settings.relays')}</h3>
        
        {/* NIP-65取得ボタン */}
        <div className={styles.nip65Section}>
          <button
            className={styles.nip65Button}
            onClick={handleFetchNip65}
            disabled={isLoadingNip65 || !userPubkey}
            title={!userPubkey ? t('settings.nip65LoginRequired') : ''}
          >
            {isLoadingNip65 ? t('settings.nip65Loading') : t('settings.nip65Fetch')}
          </button>
          <button
            className={styles.resetButton}
            onClick={handleResetRelays}
          >
            {t('settings.relaysReset')}
          </button>
        </div>
        
        {nip65Error && <p className={styles.errorMessage}>{nip65Error}</p>}
        {nip65Success && <p className={styles.successMessage}>{nip65Success}</p>}

        {/* リレー一覧 */}
        <div className={styles.relayList}>
          {relays.map((relay) => (
            <div key={relay.url} className={styles.relayItem}>
              <div className={styles.relayInfo}>
                <span className={styles.relayUrl}>
                  {relay.url}
                  {isDefaultRelay(relay.url) && (
                    <span className={styles.defaultBadge}>{t('settings.defaultRelay')}</span>
                  )}
                </span>
                <div className={styles.relayOptions}>
                  <label className={styles.relayCheckbox}>
                    <input
                      type="checkbox"
                      checked={relay.read}
                      onChange={() => handleToggleRelay(relay.url, 'read')}
                    />
                    {t('settings.relayRead')}
                  </label>
                  <label className={styles.relayCheckbox}>
                    <input
                      type="checkbox"
                      checked={relay.write}
                      onChange={() => handleToggleRelay(relay.url, 'write')}
                    />
                    {t('settings.relayWrite')}
                  </label>
                </div>
              </div>
              {!isDefaultRelay(relay.url) && (
                <button
                  className={styles.removeRelayButton}
                  onClick={() => handleRemoveRelay(relay.url)}
                  title={t('settings.relayRemove')}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {/* リレー追加 */}
        <div className={styles.addRelaySection}>
          <input
            type="text"
            className={styles.addRelayInput}
            value={newRelayUrl}
            onChange={(e) => setNewRelayUrl(e.target.value)}
            placeholder="wss://relay.example.com"
            onKeyDown={(e) => e.key === 'Enter' && handleAddRelay()}
          />
          <button
            className={styles.addRelayButton}
            onClick={handleAddRelay}
            disabled={!newRelayUrl.trim()}
          >
            {t('settings.relayAdd')}
          </button>
        </div>
      </section>
    </div>
  );
}

