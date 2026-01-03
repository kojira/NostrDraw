import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './SideNav.module.css';

interface SideNavProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  userPubkey?: string | null;
}

export function SideNav({ currentPage, onNavigate, userPubkey }: SideNavProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { id: 'home', icon: '🏠', label: t('nav.home', 'ホーム') },
    { id: 'gallery', icon: '🖼️', label: t('nav.gallery', 'ギャラリー') },
    { id: 'notifications', icon: '🔔', label: t('nav.notifications', '通知') },
    { id: 'profile', icon: '👤', label: t('nav.profile', 'プロフィール'), requiresAuth: true },
    { id: 'settings', icon: '⚙️', label: t('nav.settings', '設定') },
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
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  <span className={styles.navLabel}>{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className={styles.navFooter}>
          <p className={styles.footerText}>Powered by Nostr</p>
        </div>
      </nav>
    </>
  );
}

