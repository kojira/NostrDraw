// NostrDraw - Nostrで絵を描いて送るサービス

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { NewYearCard } from './types';
import { Auth } from './components/Auth';
import { RelaySettings } from './components/RelaySettings';
import { RecipientSelect } from './components/RecipientSelect';
import { CardEditor } from './components/CardEditor';
import { CardViewer } from './components/CardViewer';
import { SidebarGallery } from './components/SidebarGallery';
import { LanguageSwitch } from './components/LanguageSwitch';
import { useAuth } from './hooks/useAuth';
import { useNostr, useFollowees } from './hooks/useNostr';
import { useReceivedCards, useSentCards, usePublicGalleryCards, usePopularCards, useCardEditor, useSendCard } from './hooks/useCards';
import { fetchCardById } from './services/card';
import { pubkeyToNpub } from './services/profile';
import { fetchUserRelayList, publishEvent } from './services/relay';
import { CardFlip } from './components/CardViewer/CardFlip';
import { MobileCarousel } from './components/MobileCarousel';
import { Gallery } from './components/Gallery';
import { UserGallery } from './components/UserGallery';
import { useRouter } from './hooks/useRouter';
import './App.css';

function App() {
  const { t } = useTranslation();
  const { route, goHome, goToGallery, goToUser } = useRouter();
  
  const {
    authState,
    isLoading: authLoading,
    error: authError,
    isNip07Available,
    loginWithNip07,
    loginWithNpub,
    logout,
    signEvent,
    getRelaysFromNip07,
  } = useAuth();

  const {
    relays,
    addRelay,
    removeRelay,
    updateRelays,
    resetToDefaultRelays,
  } = useNostr();

  const {
    followees,
    isLoading: followeesLoading,
    error: followeesError,
    refresh: refreshFollowees,
  } = useFollowees(authState.pubkey);

  const {
    cards: receivedCards,
    count: receivedCount,
    isLoading: receivedLoading,
    error: receivedError,
    refresh: refreshReceived,
  } = useReceivedCards(authState.pubkey);

  const {
    cards: sentCards,
    count: sentCount,
    isLoading: sentLoading,
    error: sentError,
    refresh: refreshSent,
  } = useSentCards(authState.pubkey);

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

  const {
    state: editorState,
    setRecipient,
    setSvg,
    setMessage,
    reset: resetEditor,
    isValid: editorIsValid,
  } = useCardEditor();

  const { send: sendCard, isSending, error: sendError } = useSendCard(signEvent);

  const [activeView, setActiveView] = useState<'create' | 'view'>('create');
  const [lastSentEventId, setLastSentEventId] = useState<string | null>(null);
  const [shareTextCopied, setShareTextCopied] = useState(false);
  const [postToTimeline, setPostToTimeline] = useState(true); // タイムラインにも投稿するオプション
  const [timelineText, setTimelineText] = useState(''); // タイムライン投稿用テキスト
  const [isPostingTimeline, setIsPostingTimeline] = useState(false); // タイムライン投稿中
  const [timelinePosted, setTimelinePosted] = useState(false); // タイムライン投稿完了
  const [allowExtend, setAllowExtend] = useState(true); // 描き足しを許可
  const [extendingCard, setExtendingCard] = useState<NewYearCard | null>(null); // 描き足し元のカード
  
  // URLパラメータからeventidを取得して表示するカード
  const [sharedCard, setSharedCard] = useState<NewYearCard | null>(null);
  const [isLoadingSharedCard, setIsLoadingSharedCard] = useState(false);

  // NostrDrawのベースURL
  const BASE_URL = 'https://kojira.github.io/NostrDraw';

  // setSvgをラップして、呼ばれたら送信完了UIをクリア（新しい絵を保存したら送信ボタンを再表示）
  const handleSvgChange = useCallback((svg: string | null) => {
    // 送信完了状態をリセット
    if (lastSentEventId) {
      setLastSentEventId(null);
      setTimelineText('');
      setTimelinePosted(false);
    }
    setSvg(svg);
  }, [lastSentEventId, setSvg]);

  // 描き足しを開始
  const handleExtend = useCallback((card: NewYearCard) => {
    setExtendingCard(card);
    setActiveView('create'); // 作成画面に切り替え
  }, []);

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

  // NIP-07からリレーを取得
  const handleFetchRelaysFromNip07 = useCallback(async () => {
    const nip07Relays = await getRelaysFromNip07();
    if (nip07Relays) {
      updateRelays([...relays, ...nip07Relays.filter(r => !relays.some(existing => existing.url === r.url))]);
    }
    return nip07Relays;
  }, [getRelaysFromNip07, relays, updateRelays]);

  // NIP-65からリレーを取得（npub紐づきリレーリスト）
  const handleFetchRelaysFromNip65 = useCallback(async () => {
    if (!authState.pubkey) return [];
    const currentLang = t('language.label') === 'Language' ? 'en' : 'ja';
    const nip65Relays = await fetchUserRelayList(authState.pubkey, currentLang);
    return nip65Relays;
  }, [getRelaysFromNip07, relays, updateRelays]);

  // 送信後の共有テキストを生成
  const shareText = useMemo(() => {
    if (!lastSentEventId) return '';
    const url = `${BASE_URL}?eventid=${lastSentEventId}`;
    return `🎨 NostrDraw 🎍 New Year 2026\n\n${editorState.message || ''}\n\n${url}\n\n#NostrDraw #年賀状 #NewYear2026`;
  }, [lastSentEventId, editorState.message, BASE_URL]);

  // 共有テキストをコピー
  const handleCopyShareText = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setShareTextCopied(true);
      setTimeout(() => setShareTextCopied(false), 2000);
    } catch (err) {
      console.error('コピーに失敗しました:', err);
    }
  }, [shareText]);

  // 送信（SVGをイベントに直接埋め込み）
  const handleSendCard = async () => {
    if (!editorState.svg) {
      return;
    }

    const eventId = await sendCard({
      recipientPubkey: editorState.recipientPubkey, // nullでもOK
      svg: editorState.svg,
      message: editorState.message,
      layoutId: editorState.layoutId,
      year: 2026,
      allowExtend, // 描き足し許可
      parentEventId: extendingCard?.id || null, // 描き足し元
      parentPubkey: extendingCard?.pubkey || null,
    });

    if (eventId) {
      setLastSentEventId(eventId);
      setExtendingCard(null); // 描き足し元をクリア
      refreshSent();
      setTimelinePosted(false);

      // タイムラインにも投稿するオプションがオンの場合、テキストを準備
      if (postToTimeline) {
        const url = `${BASE_URL}?eventid=${eventId}`;
        // 宛先がある場合はメンションを追加
        const mention = editorState.recipientPubkey 
          ? `\nnostr:${pubkeyToNpub(editorState.recipientPubkey)} さんへ` 
          : '';
        const defaultText = `🎨 NostrDrawで見てね${mention}\n${url}\n#NostrDraw`;
        setTimelineText(defaultText);
      }
    }
  };

  // タイムラインに投稿
  const handlePostToTimeline = async () => {
    if (!timelineText.trim() || !lastSentEventId) return;
    
    // NIP-07ログインが必要
    if (!authState.isNip07) {
      console.error('タイムライン投稿にはNIP-07ログインが必要です');
      return;
    }

    setIsPostingTimeline(true);
    try {
      // ハッシュタグを抽出
      const hashtags = timelineText.match(/#\w+/g) || [];
      const tags: string[][] = hashtags.map(tag => ['t', tag.slice(1)]);
      
      // 宛先がある場合はpタグを追加（メンション通知用）
      if (editorState.recipientPubkey) {
        tags.push(['p', editorState.recipientPubkey]);
      }

      console.log('タイムライン投稿開始:', { timelineText, tags });
      console.log('NIP-07状態:', { isNip07: authState.isNip07, hasNostr: !!window.nostr });
      
      if (!window.nostr) {
        throw new Error('NIP-07拡張機能が利用できません。デスクトップブラウザでnos2xやAlbyなどの拡張機能を使用してください。');
      }
      
      let timelineEvent;
      try {
        timelineEvent = await signEvent({
          kind: 1,
          content: timelineText,
          tags,
          created_at: Math.floor(Date.now() / 1000),
        });
      } catch (signError) {
        console.error('署名エラー:', signError);
        throw new Error(`署名に失敗しました: ${signError instanceof Error ? signError.message : '不明なエラー'}`);
      }
      
      console.log('署名済みイベント:', timelineEvent);

      // タイムラインイベントを発行（sendCardと同じpublishEvent関数を使用）
      console.log('リレーに発行');
      
      try {
        await publishEvent(timelineEvent);
      } catch (publishError) {
        console.error('発行エラー:', publishError);
        throw new Error('リレーへの発行に失敗しました。ネットワーク接続を確認してください。');
      }
      
      console.log('タイムライン投稿成功');
      setTimelinePosted(true);
    } catch (err) {
      console.error('タイムライン投稿に失敗:', err);
      const errorMessage = err instanceof Error ? err.message : 'タイムライン投稿に失敗しました';
      alert(errorMessage);
    } finally {
      setIsPostingTimeline(false);
    }
  };

  // 送信完了ダイアログを閉じる
  const handleCloseSendSuccess = () => {
    setLastSentEventId(null);
    setTimelineText('');
    setTimelinePosted(false);
    resetEditor();
  };

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
      <header className="header">
        <div className="headerTop">
          <h1 className="logo" onClick={goHome} style={{ cursor: 'pointer' }}>🎨 {t('app.title')}</h1>
          <LanguageSwitch />
        </div>
        <p className="tagline">{t('app.subtitle')}</p>
        <div className="campaign">
          <span className="campaignBadge">🎍 New Year 2026</span>
          <span className="campaignText">{t('app.campaign')} 🐴</span>
        </div>
      </header>

      <div className="mainLayout">
        {/* 左サイドバー: 人気の投稿 */}
        <aside className="sidebarLeft">
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

        <main className="main">
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
                        // URLパラメータを削除
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

        {/* モバイル用カルーセル（スマホで表示） */}
        <section className="section mobileCarouselSection">
          <MobileCarousel
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
          <MobileCarousel
            type="recent"
            cards={recentCards}
            isLoading={recentLoading}
            error={recentError}
            onRefresh={refreshRecent}
            onViewAll={() => goToGallery({ tab: 'recent' })}
            userPubkey={authState.pubkey}
            signEvent={authState.isNip07 ? signEvent : undefined}
            onExtend={handleExtend}
          />
        </section>

        {/* 認証セクション */}
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

        {authState.isLoggedIn && (
          <>
            {/* リレー設定 */}
            <section className="section">
              <RelaySettings
                relays={relays}
                onAddRelay={addRelay}
                onRemoveRelay={removeRelay}
                onResetToDefault={resetToDefaultRelays}
                onFetchFromNip07={authState.isNip07 ? handleFetchRelaysFromNip07 : undefined}
                onFetchFromNip65={handleFetchRelaysFromNip65}
                isNip07LoggedIn={authState.isNip07}
                userPubkey={authState.pubkey}
              />
            </section>

            {/* ビュー切り替え */}
            <section className="section">
              <div className="viewToggle">
                <button
                  className={`viewButton ${activeView === 'create' ? 'active' : ''}`}
                  onClick={() => setActiveView('create')}
                >
                  {t('nav.create')}
                </button>
                <button
                  className={`viewButton ${activeView === 'view' ? 'active' : ''}`}
                  onClick={() => setActiveView('view')}
                >
                  {t('nav.inbox')} ({receivedCount})
                </button>
              </div>
            </section>

            {activeView === 'create' ? (
              <>
                {/* 宛先選択 */}
                <section className="section">
                  <RecipientSelect
                    followees={followees}
                    selectedPubkey={editorState.recipientPubkey}
                    onSelect={setRecipient}
                    isLoading={followeesLoading}
                    error={followeesError}
                    onRefresh={refreshFollowees}
                  />
                </section>

                {/* お絵かきエディタ */}
                <section className="section">
                  <CardEditor
                    svg={editorState.svg}
                    message={editorState.message}
                    onSvgChange={handleSvgChange}
                    onMessageChange={setMessage}
                    userPubkey={authState.pubkey}
                    extendingCard={extendingCard}
                  />
                </section>

                {/* 送信ボタン */}
                <section className="section sendSection">
                  {sendError && (
                    <p className="error">{sendError}</p>
                  )}
                  
                  {/* 送信成功時の共有UI */}
                  {lastSentEventId && (
                    <div className="sendSuccess">
                      <h3>{t('send.success')}</h3>
                      
                      {/* タイムライン投稿セクション */}
                      {postToTimeline && timelineText && !timelinePosted && authState.isNip07 && (
                        <div className="timelinePostSection">
                          <p>{t('send.editTimeline')}</p>
                          <textarea
                            className="shareTextarea"
                            value={timelineText}
                            onChange={(e) => setTimelineText(e.target.value)}
                            rows={6}
                          />
                          <button
                            onClick={handlePostToTimeline}
                            disabled={isPostingTimeline || !timelineText.trim()}
                            className="postTimelineButton"
                          >
                            {isPostingTimeline ? t('send.posting') : t('send.postTimeline')}
                          </button>
                        </div>
                      )}
                      
                      {/* NIP-07でない場合の説明 */}
                      {postToTimeline && timelineText && !timelinePosted && !authState.isNip07 && (
                        <div className="timelinePostSection">
                          <p>⚠️ {t('auth.nip07Required')}</p>
                        </div>
                      )}

                      {/* タイムライン投稿完了 */}
                      {timelinePosted && (
                        <div className="timelinePostedMessage">
                          <p>{t('send.posted')}</p>
                        </div>
                      )}

                      {/* タイムライン投稿しない場合の共有UI */}
                      {(!postToTimeline || !timelineText) && !timelinePosted && (
                        <div className="manualShareSection">
                          <p>{t('send.shareHint')}</p>
                          <textarea
                            className="shareTextarea"
                            value={shareText}
                            readOnly
                            rows={6}
                          />
                          <button
                            onClick={handleCopyShareText}
                            className="copyButton"
                          >
                            {shareTextCopied ? t('send.copied') : t('send.copyUrl')}
                          </button>
                        </div>
                      )}

                      <button
                        onClick={handleCloseSendSuccess}
                        className="closeButton"
                      >
                        {t('send.close')}
                      </button>
                    </div>
                  )}
                  
                  {authState.isNip07 && !lastSentEventId && (
                    <>
                      {/* 描き足し中の表示 */}
                      {extendingCard && (
                        <div className="extendingInfo">
                          <span>✏️ {t('editor.extending')}</span>
                          <button 
                            onClick={() => setExtendingCard(null)}
                            className="cancelExtendButton"
                          >
                            {t('editor.cancelExtend')}
                          </button>
                        </div>
                      )}
                      
                      <label className="timelineOption">
                        <input
                          type="checkbox"
                          checked={allowExtend}
                          onChange={(e) => setAllowExtend(e.target.checked)}
                        />
                        <span>{t('send.allowExtend')}</span>
                      </label>
                      <label className="timelineOption">
                        <input
                          type="checkbox"
                          checked={postToTimeline}
                          onChange={(e) => setPostToTimeline(e.target.checked)}
                        />
                        <span>{t('send.postToTimeline')}</span>
                      </label>
                      <button
                        onClick={handleSendCard}
                        disabled={!editorIsValid || isSending}
                        className="sendButton"
                      >
                        {isSending ? t('send.sending') : t('send.button')}
                      </button>
                    </>
                  )}
                  
                  {/* NIP-07未ログイン時の警告 */}
                  {!authState.isNip07 && (
                    <p className="warning">
                      ⚠️ NIP-07拡張機能でログインすると送信できます。
                    </p>
                  )}
                </section>
              </>
            ) : (
              /* お手紙ビューア */
              <section className="section">
                <CardViewer
                  receivedCards={receivedCards}
                  sentCards={sentCards}
                  receivedCount={receivedCount}
                  sentCount={sentCount}
                  isLoadingReceived={receivedLoading}
                  isLoadingSent={sentLoading}
                  errorReceived={receivedError}
                  errorSent={sentError}
                  onRefresh={() => { refreshReceived(); refreshSent(); }}
                  userPubkey={authState.pubkey}
                  signEvent={authState.isNip07 ? signEvent : undefined}
                  onExtend={handleExtend}
                />
              </section>
            )}
          </>
        )}
        </main>

        {/* 右サイドバー: 新着投稿 */}
        <aside className="sidebarRight">
          <SidebarGallery
            type="recent"
            cards={recentCards}
            isLoading={recentLoading}
            error={recentError}
            onRefresh={refreshRecent}
            onViewAll={() => goToGallery({ tab: 'recent' })}
            userPubkey={authState.pubkey}
            signEvent={authState.isNip07 ? signEvent : undefined}
            onExtend={handleExtend}
          />
        </aside>
      </div>

      <footer className="footer">
        <p>
          <strong>{t('app.title')}</strong> - Powered by{' '}
          <a href="https://nostr.com" target="_blank" rel="noopener noreferrer">
            Nostr
          </a>
        </p>
        <p className="footerNote">{t('app.footer')}</p>
      </footer>
    </div>
  );
}

export default App;
