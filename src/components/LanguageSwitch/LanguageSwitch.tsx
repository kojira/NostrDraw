import { useTranslation } from 'react-i18next';
import styles from './LanguageSwitch.module.css';

export function LanguageSwitch() {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'ja' ? 'en' : 'ja';
    i18n.changeLanguage(newLang);
  };

  return (
    <button 
      className={styles.languageSwitch} 
      onClick={toggleLanguage}
      title={i18n.language === 'ja' ? 'Switch to English' : '日本語に切り替え'}
    >
      {i18n.language === 'ja' ? '🌐 EN' : '🌐 JP'}
    </button>
  );
}


