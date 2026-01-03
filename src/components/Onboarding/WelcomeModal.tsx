/**
 * Welcome Modal Component
 * 
 * 初回訪問時に表示されるオンボーディングモーダル
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../common/Icon';
import { Button } from '../common/Button';
import styles from './WelcomeModal.module.css';

const WELCOME_SHOWN_KEY = 'nostr-draw-welcome-shown';

interface WelcomeModalProps {
  onClose: () => void;
  onNavigateToHelp?: () => void;
}

export function WelcomeModal({ onClose, onNavigateToHelp }: WelcomeModalProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      icon: 'palette',
      title: t('welcome.step1.title', 'ようこそ NostrDraw へ！'),
      description: t('welcome.step1.description', 'Nostr上で動作するソーシャルお絵描きアプリです。自由に絵を描いて世界中の人と共有しましょう。'),
    },
    {
      icon: 'brush',
      title: t('welcome.step2.title', '自由に描こう'),
      description: t('welcome.step2.description', 'テンプレートを選んで、ペンツールやテキストで自分だけのアートを作成できます。'),
    },
    {
      icon: 'share',
      title: t('welcome.step3.title', '共有しよう'),
      description: t('welcome.step3.description', 'NIP-07拡張機能でログインすれば、作品をNostrに投稿できます。いいねやコメントで交流しましょう！'),
    },
    {
      icon: 'edit',
      title: t('welcome.step4.title', 'コラボしよう'),
      description: t('welcome.step4.description', '他の人の作品に描き足してコラボレーション！ツリー表示で派生作品を確認できます。'),
    },
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem(WELCOME_SHOWN_KEY, 'true');
    onClose();
  };

  const handleSkip = () => {
    localStorage.setItem(WELCOME_SHOWN_KEY, 'true');
    onClose();
  };

  const handleLearnMore = () => {
    localStorage.setItem(WELCOME_SHOWN_KEY, 'true');
    onClose();
    onNavigateToHelp?.();
  };

  const step = steps[currentStep];

  return (
    <div className={styles.overlay} onClick={handleSkip}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={handleSkip}>
          <Icon name="close" size="md" />
        </button>

        <div className={styles.content}>
          <div className={styles.iconContainer}>
            <Icon name={step.icon} size="xl" />
          </div>
          <h2 className={styles.title}>{step.title}</h2>
          <p className={styles.description}>{step.description}</p>
        </div>

        <div className={styles.indicators}>
          {steps.map((_, index) => (
            <button
              key={index}
              className={`${styles.indicator} ${index === currentStep ? styles.active : ''}`}
              onClick={() => setCurrentStep(index)}
            />
          ))}
        </div>

        <div className={styles.actions}>
          {currentStep > 0 && (
            <Button variant="ghost" onClick={handlePrev}>
              {t('welcome.prev', '戻る')}
            </Button>
          )}
          
          <div className={styles.spacer} />
          
          {currentStep < steps.length - 1 ? (
            <Button variant="primary" onClick={handleNext} rightIcon="arrow_forward">
              {t('welcome.next', '次へ')}
            </Button>
          ) : (
            <div className={styles.finalActions}>
              {onNavigateToHelp && (
                <Button variant="secondary" onClick={handleLearnMore} leftIcon="help">
                  {t('welcome.learnMore', '詳しく見る')}
                </Button>
              )}
              <Button variant="primary" onClick={handleComplete} leftIcon="check">
                {t('welcome.start', 'はじめる')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Welcomeモーダルが表示済みかどうかをチェック
 */
export function useWelcomeModal() {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    const shown = localStorage.getItem(WELCOME_SHOWN_KEY);
    if (!shown) {
      setShouldShow(true);
    }
  }, []);

  const hideModal = () => {
    setShouldShow(false);
  };

  const resetWelcome = () => {
    localStorage.removeItem(WELCOME_SHOWN_KEY);
    setShouldShow(true);
  };

  return { shouldShow, hideModal, resetWelcome };
}

export default WelcomeModal;

