// NostrDraw - Nostrで絵を描いて送るサービス

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { NostrDrawPost } from './types';
import { LanguageSwitch } from './components/LanguageSwitch';
import { useAuth } from './hooks/useAuth';
import { useFollowees } from './hooks/useNostr';
import { usePublicGalleryCards, useFollowCards, usePopularCards, useSendCard, useCardEditor } from './hooks/useCards';
import { fetchCardById, getCardFullSvg } from './services/card';
import { pubkeyToNpub } from './services/profile';
import { CardFlip } from './components/CardViewer/CardFlip';
import { Gallery } from './components/Gallery';
import { UserGallery } from './components/UserGallery';
import { Timeline } from './components/Timeline';
import { CardEditor } from './components/CardEditor';
import { Auth, ProfileSetup } from './components/Auth';
import { updateProfile } from './services/profile';
import { SidebarGallery } from './components/SidebarGallery';
import { SideNav } from './components/SideNav';
import { Notifications } from './components/Notifications';
import { Settings } from './components/Settings';
import { HelpPage } from './components/Help';
import { WelcomeModal, useWelcomeModal } from './components/Onboarding';
import { useRouter } from './hooks/useRouter';
import { useNostr } from './hooks/useNostr';
import './App.css';

// テーマをローカルストレージに保存するキー
const THEME_STORAGE_KEY = 'nostr-draw-theme';

function App() {
  const { t } = useTranslation();
  const { route, goHome, goToGallery, goToUser, goToCreate, goToNotifications, goToSettings, goToHelp } = useRouter();
  
  // Welcome modal
  const { shouldShow: showWelcome, hideModal: hideWelcome } = useWelcomeModal();
  
  // テーマ管理
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return (stored === 'light' || stored === 'dark') ? stored : 'dark';
  });
  
  // テーマ変更時にbodyにクラスを追加
  useEffect(() => {
    document.body.classList.remove('light-theme', 'dark-theme');
    document.body.classList.add(`${theme}-theme`);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);
  
  // リレー設定
  const { relays, updateRelays } = useNostr();
  
  const {
    authState,
    isLoading: authLoading,
    error: authError,
    isNip07Available,
    deriveProgress,
    loginWithNip07,
    loginWithNpub,
    loginWithPassword,
    createAccount,
    logout,
    deleteAccount,
    signEvent,
    hasStoredAccount,
    getStoredNpub,
    completeProfileSetup,
  } = useAuth();

  const {
    followees,
  } = useFollowees(authState.pubkey);

  const {
    cards: recentCards,
    isLoading: recentLoading,
    isLoadingMore: recentLoadingMore,
    hasMore: recentHasMore,
    error: recentError,
    refresh: refreshRecent,
    loadMore: loadMoreRecent,
  } = usePublicGalleryCards(authState.pubkey);

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
    isLoadingMore: followCardsLoadingMore,
    hasMore: followCardsHasMore,
    error: followCardsError,
    refresh: refreshFollowCards,
    loadMore: loadMoreFollowCards,
  } = useFollowCards(followeePubkeys, authState.pubkey);

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
  const [extendingCard, setExtendingCard] = useState<NostrDrawPost | null>(null); // 描き足し元のカード
  
  // カード詳細表示（タイムラインクリック、URLパラメータ共通）
  const [selectedCard, setSelectedCard] = useState<NostrDrawPost | null>(null);
  const [isLoadingSelectedCard, setIsLoadingSelectedCard] = useState(false);

  // 新規投稿を開始
  const handleCreatePost = useCallback(() => {
    setLastSentEventId(null); // 前回の投稿成功状態をクリア
    resetEditor(); // エディタの状態をリセット
    setExtendingCard(null); // 描き足し元をクリア
    goToCreate();
  }, [goToCreate, resetEditor]);

  // 描き足しを開始
  const handleExtend = useCallback(async (card: NostrDrawPost) => {
    setLastSentEventId(null); // 前回の投稿成功状態をクリア
    resetEditor(); // エディタの状態をリセット
    
    // 差分保存されたカードの場合、完全なSVGを取得してから設定
    const fullSvg = await getCardFullSvg(card);
    
    setExtendingCard({
      ...card,
      svg: fullSvg,
    });
    
    setSelectedCard(null); // モーダルを閉じる
    goToCreate();
  }, [goToCreate, resetEditor]);

  // タイムラインのカードをクリック（大きく表示）
  const handleCardClick = useCallback((card: NostrDrawPost) => {
    setSelectedCard(card);
  }, []);

  // URLパラメータをチェック（eventid, npub）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('eventid');
    const npub = params.get('npub');
    
    if (eventId) {
      setIsLoadingSelectedCard(true);
      fetchCardById(eventId)
        .then((card) => {
          setSelectedCard(card);
        })
        .catch((err) => {
          console.error('カードの読み込みに失敗:', err);
        })
        .finally(() => {
          setIsLoadingSelectedCard(false);
        });
    }
    
    // npubパラメータがある場合はユーザーページにナビゲート
    if (npub && npub.startsWith('npub1')) {
      goToUser(npub);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // マウント時に一度だけ実行

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
      case 'gallery':
        goToGallery();
        break;
      case 'notifications':
        goToNotifications();
        break;
      case 'profile':
        if (authState.pubkey) {
          goToUser(pubkeyToNpub(authState.pubkey));
        }
        break;
      case 'settings':
        goToSettings();
        break;
      case 'help':
        goToHelp();
        break;
    }
  }, [goHome, goToGallery, goToUser, goToNotifications, goToSettings, goToHelp, authState.pubkey]);

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
                  deriveProgress={deriveProgress}
                  hasStoredAccount={hasStoredAccount}
                  getStoredNpub={getStoredNpub}
                  onLoginWithNip07={loginWithNip07}
                  onLoginWithNpub={loginWithNpub}
                  onLoginWithPassword={loginWithPassword}
                  onCreateAccount={createAccount}
                  onLogout={logout}
                  onDeleteAccount={deleteAccount}
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
                    extendingCard={extendingCard}
                    allowExtend={allowExtend}
                    onAllowExtendChange={setAllowExtend}
                    postToTimeline={postToTimeline}
                    onPostToTimelineChange={setPostToTimeline}
                    isPosting={isSending}
                    postSuccess={!!lastSentEventId}
                    onNewPost={() => {
                      handleCloseSendSuccess();
                      setExtendingCard(null); // 描き足し元をクリア
                    }}
                    onGoHome={() => {
                      handleCloseSendSuccess();
                      setExtendingCard(null); // 描き足し元をクリア
                      goHome();
                    }}
                    onPost={async (data) => {
                      if (!authState.isNip07) {
                        alert(t('auth.nip07Required'));
                        return;
                      }
                      try {
                        const result = await sendCard({
                          svg: data.svg,
                          diffSvg: data.diffSvg,
                          layers: data.layers,
                          canvasSize: data.canvasSize,
                          templateId: data.templateId,
                          message: data.message,
                          year: new Date().getFullYear() + 1,
                          layoutId: 'vertical',
                          recipientPubkey: null,
                          allowExtend,
                          isPublic: postToTimeline,
                          parentEventId: extendingCard?.id || null,
                          parentPubkey: extendingCard?.pubkey || null,
                          // ルートの計算: 
                          // 1. 親にrootEventIdがある場合、それがルート
                          // 2. 親にrootEventIdがなく、親自身がルートの場合、親のidがルート
                          rootEventId: extendingCard?.rootEventId || extendingCard?.id || null,
                          isExtend: data.isExtend, // 描き足しかどうか
                          // 画像アップロード失敗時の確認コールバック
                          onImageUploadFailed: async (error) => {
                            return window.confirm(
                              `画像のアップロードに失敗しました。\n\nエラー: ${error}\n\n画像なしで投稿を続けますか？\n（キャンセルで投稿を中止）`
                            );
                          },
                        });
                        if (result) {
                          setLastSentEventId(result);
                        }
                      } catch (error) {
                        if (error instanceof Error) {
                          alert(error.message);
                        }
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

  // 通知ページ
  if (route.page === 'notifications') {
    // ログインが必要
    if (!authState.isLoggedIn || !authState.pubkey) {
      return (
        <div className="app">
          <SideNav
            currentPage="notifications"
            onNavigate={handleNavigation}
            userPubkey={authState.pubkey}
          />
          <div className="mainContent">
            <header className="header">
              <div className="headerInner">
                <h1 className="logo" onClick={goHome}>🎨 NostrDraw</h1>
                <div className="headerActions">
                  <Auth
                    authState={authState}
                    isNip07Available={isNip07Available}
                    isLoading={authLoading}
                    error={authError}
                    deriveProgress={deriveProgress}
                    hasStoredAccount={hasStoredAccount}
                    getStoredNpub={getStoredNpub}
                    onLoginWithNip07={loginWithNip07}
                    onLoginWithNpub={loginWithNpub}
                    onLoginWithPassword={loginWithPassword}
                    onCreateAccount={createAccount}
                    onLogout={logout}
                    onDeleteAccount={deleteAccount}
                  />
                  <LanguageSwitch />
                </div>
              </div>
            </header>
            <main className="main">
              <div className="loginRequired">
                <p>{t('notifications.loginRequired', '通知を見るにはログインしてください')}</p>
                <Auth
                  authState={authState}
                  isNip07Available={isNip07Available}
                  isLoading={authLoading}
                  error={authError}
                  deriveProgress={deriveProgress}
                  hasStoredAccount={hasStoredAccount}
                  getStoredNpub={getStoredNpub}
                  onLoginWithNip07={loginWithNip07}
                  onLoginWithNpub={loginWithNpub}
                  onLoginWithPassword={loginWithPassword}
                  onCreateAccount={createAccount}
                  onLogout={logout}
                  onDeleteAccount={deleteAccount}
                />
              </div>
            </main>
          </div>
        </div>
      );
    }

    return (
      <div className="app">
        <SideNav
          currentPage="notifications"
          onNavigate={handleNavigation}
          userPubkey={authState.pubkey}
        />
        <div className="mainContent fullWidth">
          <Notifications
            userPubkey={authState.pubkey}
            signEvent={(authState.isNip07 || (authState.isNsecLogin && !authState.needsReauth)) ? signEvent : undefined}
            onNavigateToUser={(npub) => goToUser(npub)}
          />
        </div>
      </div>
    );
  }

  // 設定ページ
  if (route.page === 'settings') {
    return (
      <div className="app">
        <SideNav
          currentPage="settings"
          onNavigate={handleNavigation}
          userPubkey={authState.pubkey}
        />
        <div className="mainContent fullWidth">
          <header className="header">
            <div className="headerInner">
              <h1 className="logo" onClick={goHome} style={{ cursor: 'pointer' }}>🎨 {t('app.title')}</h1>
              <div className="headerActions">
                <Auth
                  authState={authState}
                  isNip07Available={isNip07Available}
                  isLoading={authLoading}
                  error={authError}
                  deriveProgress={deriveProgress}
                  hasStoredAccount={hasStoredAccount}
                  getStoredNpub={getStoredNpub}
                  onLoginWithNip07={loginWithNip07}
                  onLoginWithNpub={loginWithNpub}
                  onLoginWithPassword={loginWithPassword}
                  onCreateAccount={createAccount}
                  onLogout={logout}
                  onDeleteAccount={deleteAccount}
                />
                <LanguageSwitch />
              </div>
            </div>
          </header>
          <Settings
            theme={theme}
            onThemeChange={setTheme}
            relays={relays}
            onRelaysChange={updateRelays}
            userPubkey={authState.pubkey}
          />
        </div>
      </div>
    );
  }

  // ヘルプページ
  if (route.page === 'help') {
    return (
      <div className="app">
        <SideNav
          currentPage="help"
          onNavigate={handleNavigation}
          userPubkey={authState.pubkey}
        />
        <div className="mainContent fullWidth">
          <HelpPage onNavigate={handleNavigation} />
        </div>
      </div>
    );
  }

  // ギャラリーページ
  if (route.page === 'gallery') {
    return (
      <div className="app">
        <SideNav
          currentPage="gallery"
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
        <Gallery
          initialTab={route.params.tab}
          initialPeriod={route.params.period}
          initialAuthor={route.params.author}
          userPubkey={authState.pubkey}
          signEvent={(authState.isNip07 || (authState.isNsecLogin && !authState.needsReauth)) ? signEvent : undefined}
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
        <SideNav
          currentPage="user"
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
        <UserGallery
          npub={route.params.npub}
          userPubkey={authState.pubkey}
          signEvent={(authState.isNip07 || (authState.isNsecLogin && !authState.needsReauth)) ? signEvent : undefined}
          onExtend={handleExtend}
          onBack={goHome}
        />
      </div>
    );
  }

  // プロフィール設定画面（新規アカウント作成後）
  if (authState.isLoggedIn && authState.needsProfileSetup && authState.npub && authState.pubkey) {
    const handleSaveProfile = async (profile: { name: string; about: string; picture: string }) => {
      const success = await updateProfile(profile, authState.pubkey!, signEvent);
      if (success) {
        completeProfileSetup();
      }
      return success;
    };

    return (
      <div className="app profileSetupPage">
        <header className="header">
          <div className="headerTop">
            <h1 className="logo">🎨 {t('app.title')}</h1>
          </div>
        </header>
        <main className="profileSetupMain">
          <ProfileSetup
            npub={authState.npub}
            isLoading={authLoading}
            onSave={handleSaveProfile}
            onSkip={completeProfileSetup}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Welcome Modal */}
      {showWelcome && (
        <WelcomeModal 
          onClose={hideWelcome} 
          onNavigateToHelp={goToHelp}
        />
      )}
      
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

      {/* カード詳細モーダル（タイムラインクリック・URLパラメータ共通） */}
      {/* CardFlipはポータルを使って直接document.bodyにレンダリングするので、ラッパーは不要 */}
      {(selectedCard || isLoadingSelectedCard) && (
        selectedCard ? (
          <CardFlip
            card={selectedCard}
            userPubkey={authState.pubkey}
            signEvent={(authState.isNip07 || (authState.isNsecLogin && !authState.needsReauth)) ? signEvent : undefined}
            onExtend={handleExtend}
            onClose={() => {
              // URLパラメータをクリア
              if (window.location.search.includes('eventid')) {
                window.history.replaceState({}, '', window.location.pathname + window.location.hash);
              }
              setSelectedCard(null);
            }}
            onNavigateToCard={setSelectedCard}
          />
        ) : (
          <div className="cardLoadingOverlay">
            <p className="loading">{t('card.loading')}</p>
          </div>
        )
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
            isLoadingMoreFollow={followCardsLoadingMore}
            isLoadingMoreGlobal={recentLoadingMore}
            hasMoreFollow={followCardsHasMore}
            hasMoreGlobal={recentHasMore}
            errorFollow={followCardsError}
            errorGlobal={recentError}
            onRefreshFollow={refreshFollowCards}
            onRefreshGlobal={refreshRecent}
            onLoadMoreFollow={loadMoreFollowCards}
            onLoadMoreGlobal={loadMoreRecent}
            userPubkey={authState.pubkey}
            signEvent={(authState.isNip07 || (authState.isNsecLogin && !authState.needsReauth)) ? signEvent : undefined}
            onUserClick={goToUser}
            onCreatePost={handleCreatePost}
            onExtend={handleExtend}
            onCardClick={handleCardClick}
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
            signEvent={(authState.isNip07 || (authState.isNsecLogin && !authState.needsReauth)) ? signEvent : undefined}
            onExtend={handleExtend}
          />
        </aside>
      </div>
    </div>
  );
}

export default App;
