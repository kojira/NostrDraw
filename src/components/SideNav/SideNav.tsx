import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../common/Icon';
import styles from './SideNav.module.css';

interface SideNavProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  userPubkey?: string | null;
  unreadCount?: number;
}

export function SideNav({ currentPage, onNavigate, userPubkey, unreadCount = 0 }: SideNavProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { id: 'home', icon: 'home', label: t('nav.home', 'ホーム') },
    { id: 'gallery', icon: 'gallery_thumbnail', label: t('nav.gallery', 'ギャラリー') },
    { id: 'notifications', icon: 'notifications', label: t('nav.notifications', '通知'), badge: unreadCount },
    { id: 'profile', icon: 'person', label: t('nav.profile', 'プロフィール'), requiresAuth: true },
    { id: 'settings', icon: 'settings', label: t('nav.settings', '設定') },
    { id: 'help', icon: 'help', label: t('nav.help', 'ヘルプ') },
  ];

  const handleNavigate = (page: string) => {
    onNavigate(page);
    setIsOpen(false);
  };

  return (
    <>
      {/* ハンバーガーボタン（モバイル用） */}
      <button 
        className={styles.hamburger}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="メニューを開く"
      >
        <span className={`${styles.hamburgerLine} ${isOpen ? styles.open : ''}`} />
        <span className={`${styles.hamburgerLine} ${isOpen ? styles.open : ''}`} />
        <span className={`${styles.hamburgerLine} ${isOpen ? styles.open : ''}`} />
      </button>

      {/* オーバーレイ（モバイル用） */}
      {isOpen && (
        <div 
          className={styles.overlay}
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* サイドナビゲーション */}
      <nav className={`${styles.sideNav} ${isOpen ? styles.open : ''}`}>
        <ul className={styles.navList}>
          {menuItems.map((item) => {
            const isDisabled = item.requiresAuth && !userPubkey;
            const isActive = currentPage === item.id;

            return (
              <li key={item.id}>
                <button
                  className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                  onClick={() => handleNavigate(item.id)}
                  disabled={isDisabled}
                  title={item.label}
                >
                  <span className={styles.iconWrapper}>
                    <Icon name={item.icon} size="lg" className={styles.navIcon} />
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className={styles.badge}>
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className={styles.navFooter}>
          <p className={styles.footerText}>Powered by Nostr</p>
          <a 
            href="https://github.com/kojira/NostrDraw" 
            target="_blank" 
            rel="noopener noreferrer"
            className={styles.footerLink}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>code</span>
            Source
          </a>
        </div>
      </nav>
    </>
  );
}

