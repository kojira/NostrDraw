// NostrDraw - Nostrで絵を描いて送るサービス

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { NewYearCard } from './types';
import { LanguageSwitch } from './components/LanguageSwitch';
import { useAuth } from './hooks/useAuth';
import { useFollowees } from './hooks/useNostr';
import { usePublicGalleryCards, useFollowCards, usePopularCards, useSendCard, useCardEditor } from './hooks/useCards';
import { fetchCardById } from './services/card';
import { pubkeyToNpub } from './services/profile';
import { CardFlip } from './components/CardViewer/CardFlip';
import { Gallery } from './components/Gallery';
import { UserGallery } from './components/UserGallery';
import { Timeline } from './components/Timeline';
import { CardEditor } from './components/CardEditor';
import { Auth } from './components/Auth';
import { SidebarGallery } from './components/SidebarGallery';
import { SideNav } from './components/SideNav';
import { useRouter } from './hooks/useRouter';
import './App.css';

function App() {
  const { t } = useTranslation();
  const { route, goHome, goToGallery, goToUser, goToCreate } = useRouter();
  
  const {
    authState,
    isLoading: authLoading,
    error: authError,
    isNip07Available,
    loginWithNip07,
    loginWithNpub,
    logout,
    signEvent,
  } = useAuth();

  const {
    followees,
  } = useFollowees(authState.pubkey);

  const {
    cards: recentCards,
    isLoading: recentLoading,
    error: recentError,
    refresh: refreshRecent,
  } = usePublicGalleryCards();

  const {
    cards: popularCards,
    isLoading: popularLoading,
    error: popularError,
    refresh: refreshPopular,
  } = usePopularCards(3); // 過去3日間

  // フォロー中のユーザーのpubkeyリスト
  const followeePubkeys = useMemo(() => 
    followees.map(f => f.pubkey), 
    [followees]
  );

  // フォロータイムライン用
  const {
    cards: followCards,
    isLoading: followCardsLoading,
    error: followCardsError,
    refresh: refreshFollowCards,
  } = useFollowCards(followeePubkeys);

  const {
    state: editorState,
    setSvg,
    setMessage,
    reset: resetEditor,
  } = useCardEditor();

  const { send: sendCard, isSending, error: sendError } = useSendCard(signEvent);

  const [lastSentEventId, setLastSentEventId] = useState<string | null>(null);
  const [allowExtend, setAllowExtend] = useState(true); // 描き足しを許可
  const [postToTimeline, setPostToTimeline] = useState(true); // kind 1にも投稿
  
  // URLパラメータからeventidを取得して表示するカード
  const [sharedCard, setSharedCard] = useState<NewYearCard | null>(null);
  const [isLoadingSharedCard, setIsLoadingSharedCard] = useState(false);

  // 描き足しを開始
  const handleExtend = useCallback((_card: NewYearCard) => {
    goToCreate();
  }, [goToCreate]);

  // URLパラメータのeventidをチェック
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('eventid');
    
    if (eventId) {
      setIsLoadingSharedCard(true);
      fetchCardById(eventId)
        .then((card) => {
          setSharedCard(card);
        })
        .catch((err) => {
          console.error('カードの読み込みに失敗:', err);
        })
        .finally(() => {
          setIsLoadingSharedCard(false);
        });
    }
  }, []);

  // 送信完了ダイアログを閉じる
  const handleCloseSendSuccess = useCallback(() => {
    setLastSentEventId(null);
    resetEditor();
  }, [resetEditor]);

  // サイドナビゲーションのハンドラ
  const handleNavigation = useCallback((page: string) => {
    switch (page) {
      case 'home':
        goHome();
        break;
      case 'notifications':
        // TODO: 通知ページを実装
        break;
      case 'profile':
        if (authState.pubkey) {
          goToUser(pubkeyToNpub(authState.pubkey));
        }
        break;
      case 'settings':
        // TODO: 設定ページを実装
        break;
    }
  }, [goHome, goToUser, authState.pubkey]);

  // 投稿画面
  if (route.page === 'create') {
    return (
      <div className="app">
        {/* 左サイドナビゲーション */}
        <SideNav
          currentPage="home"
          onNavigate={handleNavigation}
          userPubkey={authState.pubkey}
        />
        <div className="createPage">
          <header className="createHeader">
            <button className="backButton" onClick={goHome}>
              ← {t('gallery.backToHome')}
            </button>
            <h1 className="createTitle">✏️ {t('timeline.createPost')}</h1>
          </header>
          <main className="createMain">
            {!authState.isLoggedIn ? (
              <section className="section">
                <Auth
                  authState={authState}
                  isNip07Available={isNip07Available}
                  isLoading={authLoading}
                  error={authError}
                  onLoginWithNip07={loginWithNip07}
                  onLoginWithNpub={loginWithNpub}
                  onLogout={logout}
                />
              </section>
            ) : (
              <>
                <section className="section">
                  <CardEditor
                    svg={editorState.svg}
                    message={editorState.message}
                    onSvgChange={setSvg}
                    onMessageChange={setMessage}
                    userPubkey={authState.pubkey}
                    allowExtend={allowExtend}
                    onAllowExtendChange={setAllowExtend}
                    postToTimeline={postToTimeline}
                    onPostToTimelineChange={setPostToTimeline}
                    isPosting={isSending}
                    postSuccess={!!lastSentEventId}
                    onNewPost={() => {
                      handleCloseSendSuccess();
                    }}
                    onGoHome={() => {
                      handleCloseSendSuccess();
                      goHome();
                    }}
                    onPost={async (svg, msg) => {
                      if (!authState.isNip07) {
                        alert(t('auth.nip07Required'));
                        return;
                      }
                      const result = await sendCard({
                        svg,
                        message: msg,
                        year: new Date().getFullYear() + 1,
                        layoutId: 'vertical',
                        recipientPubkey: null,
                        allowExtend,
                        isPublic: postToTimeline,
                      });
                      if (result) {
                        setLastSentEventId(result);
                      }
                    }}
                  />
                </section>
                
                {/* エラー表示 */}
                {sendError && <p className="error">{sendError}</p>}
              </>
            )}
          </main>
        </div>
      </div>
    );
  }

  // ギャラリーページ
  if (route.page === 'gallery') {
    return (
      <div className="app">
        <Gallery
          initialTab={route.params.tab}
          initialPeriod={route.params.period}
          initialAuthor={route.params.author}
          userPubkey={authState.pubkey}
          signEvent={authState.isNip07 ? signEvent : undefined}
          onExtend={handleExtend}
          onBack={goHome}
          onUserClick={goToUser}
        />
      </div>
    );
  }

  // ユーザーページ
  if (route.page === 'user' && route.params.npub) {
    return (
      <div className="app">
        <UserGallery
          npub={route.params.npub}
          userPubkey={authState.pubkey}
          signEvent={authState.isNip07 ? signEvent : undefined}
          onExtend={handleExtend}
          onBack={goHome}
          onGalleryClick={() => goToGallery()}
        />
      </div>
    );
  }

  return (
    <div className="app">
      {/* 左サイドナビゲーション */}
      <SideNav
        currentPage="home"
        onNavigate={handleNavigation}
        userPubkey={authState.pubkey}
      />

      <header className="header">
        <div className="headerTop">
          <h1 className="logo" onClick={goHome} style={{ cursor: 'pointer' }}>🎨 {t('app.title')}</h1>
          <div className="headerActions">
            {!authState.isLoggedIn ? (
              <button 
                className="headerLoginButton"
                onClick={() => {
                  if (isNip07Available) {
                    loginWithNip07();
                  } else {
                    const npub = prompt('npub1...');
                    if (npub) loginWithNpub(npub);
                  }
                }}
              >
                {t('auth.login')}
              </button>
            ) : (
              <button 
                className="headerLogoutButton"
                onClick={logout}
              >
                {t('auth.logout')}
              </button>
            )}
            <LanguageSwitch />
          </div>
        </div>
      </header>

      {/* 共有カード表示（URLパラメータからeventidがある場合） */}
      {(sharedCard || isLoadingSharedCard) && (
        <section className="section sharedCardSection">
          <h2 className="sharedCardTitle">{t('viewer.sharedCard')}</h2>
          {isLoadingSharedCard ? (
            <p className="loading">{t('card.loading')}</p>
          ) : sharedCard ? (
            <>
              <div className="sharedCardContainer">
                <CardFlip 
                  card={sharedCard} 
                  userPubkey={authState.pubkey}
                  signEvent={authState.isNip07 ? signEvent : undefined}
                  onExtend={handleExtend}
                />
              </div>
              <div className="sharedCardActions">
                <button
                  onClick={() => {
                    window.history.replaceState({}, '', window.location.pathname);
                    setSharedCard(null);
                  }}
                  className="closeButton"
                >
                  {t('card.close')}
                </button>
              </div>
            </>
          ) : (
            <p className="error">{t('card.loading')}</p>
          )}
        </section>
      )}

      {/* メインレイアウト */}
      <div className="mainLayout">
        {/* タイムライン（メインコンテンツ） */}
        <main className="mainContent">
          <Timeline
            followCards={followCards}
            globalCards={recentCards}
            isLoadingFollow={followCardsLoading}
            isLoadingGlobal={recentLoading}
            errorFollow={followCardsError}
            errorGlobal={recentError}
            onRefreshFollow={refreshFollowCards}
            onRefreshGlobal={refreshRecent}
            userPubkey={authState.pubkey}
            onUserClick={goToUser}
            onCreatePost={goToCreate}
          />
        </main>

        {/* サイドバー: 人気の投稿（PC表示時のみ） */}
        <aside className="sidebar">
          <SidebarGallery
            type="popular"
            cards={popularCards}
            isLoading={popularLoading}
            error={popularError}
            onRefresh={refreshPopular}
            onViewAll={() => goToGallery({ tab: 'popular' })}
            userPubkey={authState.pubkey}
            signEvent={authState.isNip07 ? signEvent : undefined}
            onExtend={handleExtend}
          />
        </aside>
      </div>
    </div>
  );
}

export default App;
