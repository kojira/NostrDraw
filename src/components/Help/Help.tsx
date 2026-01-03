/**
 * Help Page Component
 * 
 * アプリの使い方を説明するヘルプページ
 */

import { useTranslation } from 'react-i18next';
import { Icon } from '../common/Icon';
import styles from './Help.module.css';

interface HelpPageProps {
  onNavigate: (page: string) => void;
}

export function HelpPage({ onNavigate }: HelpPageProps) {
  const { t } = useTranslation();

  const features = [
    {
      icon: 'palette',
      title: t('help.features.draw.title', '絵を描く'),
      description: t('help.features.draw.description', 'キャンバスにフリーハンドで絵を描いたり、テキストを追加できます。様々なブラシや色を選んで自分だけのアートを作成しましょう。'),
    },
    {
      icon: 'share',
      title: t('help.features.share.title', '共有する'),
      description: t('help.features.share.description', '描いた絵はNostrネットワークに投稿されます。パーマリンクをコピーして友達に共有できます。'),
    },
    {
      icon: 'favorite',
      title: t('help.features.react.title', 'リアクション'),
      description: t('help.features.react.description', '気に入った作品に「いいね」をつけましょう。リアクションは作者への応援になります。'),
    },
    {
      icon: 'edit',
      title: t('help.features.extend.title', '描き足し'),
      description: t('help.features.extend.description', '他の人の作品に描き足してコラボレーションできます（作者が許可している場合）。'),
    },
    {
      icon: 'account_tree',
      title: t('help.features.tree.title', 'ツリー表示'),
      description: t('help.features.tree.description', '描き足しでつながった作品をツリー構造で表示。どの作品から派生したか確認できます。'),
    },
  ];

  const steps = [
    {
      step: 1,
      title: t('help.steps.login.title', 'ログイン'),
      description: t('help.steps.login.description', 'NIP-07対応のブラウザ拡張機能（nos2x、Albyなど）でログインします。'),
    },
    {
      step: 2,
      title: t('help.steps.create.title', '作品を作る'),
      description: t('help.steps.create.description', '「＋」ボタンをタップしてエディタを開きます。テンプレートを選んで、自由に描いてください。'),
    },
    {
      step: 3,
      title: t('help.steps.post.title', '投稿する'),
      description: t('help.steps.post.description', '完成したら「投稿」ボタンを押してNostrに公開します。'),
    },
    {
      step: 4,
      title: t('help.steps.explore.title', '探索する'),
      description: t('help.steps.explore.description', 'タイムラインやギャラリーで他の人の作品を楽しみましょう。'),
    },
  ];

  return (
    <div className={styles.helpContainer}>
      <div className={styles.header}>
        <button 
          className={styles.backButton}
          onClick={() => onNavigate('home')}
        >
          <Icon name="arrow_back" size="md" />
          <span>{t('help.back', '戻る')}</span>
        </button>
        <h1 className={styles.title}>{t('help.title', '使い方')}</h1>
      </div>

      {/* はじめに */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Icon name="info" size="md" />
          {t('help.about.title', 'NostrDrawとは')}
        </h2>
        <p className={styles.paragraph}>
          {t('help.about.description', 'NostrDrawは、Nostrプロトコル上で動作するソーシャルお絵描きアプリです。描いた絵を世界中の人と共有したり、他の人の作品に描き足してコラボレーションを楽しめます。')}
        </p>
      </section>

      {/* 機能紹介 */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Icon name="star" size="md" />
          {t('help.features.title', '主な機能')}
        </h2>
        <div className={styles.featureGrid}>
          {features.map((feature, index) => (
            <div key={index} className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <Icon name={feature.icon} size="lg" />
              </div>
              <h3 className={styles.featureTitle}>{feature.title}</h3>
              <p className={styles.featureDescription}>{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* はじめ方 */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Icon name="play_circle" size="md" />
          {t('help.steps.title', 'はじめ方')}
        </h2>
        <div className={styles.stepsContainer}>
          {steps.map((item) => (
            <div key={item.step} className={styles.stepItem}>
              <div className={styles.stepNumber}>{item.step}</div>
              <div className={styles.stepContent}>
                <h3 className={styles.stepTitle}>{item.title}</h3>
                <p className={styles.stepDescription}>{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Icon name="help" size="md" />
          {t('help.faq.title', 'よくある質問')}
        </h2>
        <div className={styles.faqList}>
          <div className={styles.faqItem}>
            <h3 className={styles.faqQuestion}>
              {t('help.faq.nostr.question', 'Nostrとは何ですか？')}
            </h3>
            <p className={styles.faqAnswer}>
              {t('help.faq.nostr.answer', 'Nostrは分散型のソーシャルプロトコルです。中央サーバーに依存せず、複数のリレーサーバーを通じて情報が共有されます。')}
            </p>
          </div>
          <div className={styles.faqItem}>
            <h3 className={styles.faqQuestion}>
              {t('help.faq.login.question', 'ログインに必要なものは？')}
            </h3>
            <p className={styles.faqAnswer}>
              {t('help.faq.login.answer', 'NIP-07対応のブラウザ拡張機能が必要です。推奨：nos2x、Alby、Nostore など。')}
            </p>
          </div>
          <div className={styles.faqItem}>
            <h3 className={styles.faqQuestion}>
              {t('help.faq.delete.question', '投稿を削除できますか？')}
            </h3>
            <p className={styles.faqAnswer}>
              {t('help.faq.delete.answer', 'Nostrの仕様上、完全な削除は保証されません。削除リクエストは送信できますが、すでにリレーに保存されたデータは残る場合があります。')}
            </p>
          </div>
        </div>
      </section>

      {/* フッター */}
      <footer className={styles.footer}>
        <p className={styles.footerText}>
          {t('help.footer', 'ご不明な点があれば、お気軽にお問い合わせください。')}
        </p>
      </footer>
    </div>
  );
}

export default HelpPage;

