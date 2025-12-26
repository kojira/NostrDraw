// NostrDraw - Nostrで絵を描いて送るサービス

import { useState, useCallback, useMemo, useEffect } from 'react';
import { SimplePool } from 'nostr-tools';
import type { NewYearCard } from './types';
import { Auth } from './components/Auth';
import { RelaySettings } from './components/RelaySettings';
import { RecipientSelect } from './components/RecipientSelect';
import { CardEditor } from './components/CardEditor';
import { CardViewer } from './components/CardViewer';
import { SidebarGallery } from './components/SidebarGallery';
import { useAuth } from './hooks/useAuth';
import { useNostr, useFollowees } from './hooks/useNostr';
import { useReceivedCards, useSentCards, usePublicGalleryCards, usePopularCards, useCardEditor, useSendCard } from './hooks/useCards';
import { fetchCardById } from './services/card';
import { CardFlip } from './components/CardViewer/CardFlip';
import './App.css';

function App() {
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
        const defaultText = `🎨 NostrDrawで見てね\n${url}\n#NostrDraw`;
        setTimelineText(defaultText);
      }
    }
  };

  // タイムラインに投稿
  const handlePostToTimeline = async () => {
    if (!timelineText.trim() || !lastSentEventId) return;

    setIsPostingTimeline(true);
    try {
      // ハッシュタグを抽出
      const hashtags = timelineText.match(/#\w+/g) || [];
      const tags = hashtags.map(tag => ['t', tag.slice(1)]);

      const timelineEvent = await signEvent({
        kind: 1,
        content: timelineText,
        tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      // タイムラインイベントを発行
      const relayUrls = relays.map(r => r.url);
      const pool = new SimplePool();
      await Promise.any(pool.publish(relayUrls, timelineEvent));
      pool.close(relayUrls);
      setTimelinePosted(true);
    } catch (err) {
      console.error('タイムライン投稿に失敗:', err);
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

  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">🎨 NostrDraw</h1>
        <p className="tagline">Nostrで絵を描いて送ろう</p>
        <div className="campaign">
          <span className="campaignBadge">🎍 New Year 2026</span>
          <span className="campaignText">年賀状キャンペーン開催中！ 🐴</span>
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
            userPubkey={authState.pubkey}
            signEvent={authState.isNip07 ? signEvent : undefined}
            onExtend={handleExtend}
          />
        </aside>

        <main className="main">
          {/* 共有カード表示（URLパラメータからeventidがある場合） */}
          {(sharedCard || isLoadingSharedCard) && (
            <section className="section sharedCardSection">
              <h2 className="sharedCardTitle">🎨 共有されたカード</h2>
              {isLoadingSharedCard ? (
                <p className="loading">読み込み中...</p>
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
                      閉じる
                    </button>
                  </div>
                </>
              ) : (
                <p className="error">カードが見つかりませんでした</p>
              )}
            </section>
          )}

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
                isNip07LoggedIn={authState.isNip07}
              />
            </section>

            {/* ビュー切り替え */}
            <section className="section">
              <div className="viewToggle">
                <button
                  className={`viewButton ${activeView === 'create' ? 'active' : ''}`}
                  onClick={() => setActiveView('create')}
                >
                  ✍️ 絵を描く
                </button>
                <button
                  className={`viewButton ${activeView === 'view' ? 'active' : ''}`}
                  onClick={() => setActiveView('view')}
                >
                  📬 受信ボックス ({receivedCount})
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
                      <h3>🎉 送信完了！</h3>
                      
                      {/* タイムライン投稿セクション */}
                      {postToTimeline && timelineText && !timelinePosted && (
                        <div className="timelinePostSection">
                          <p>タイムラインに投稿する内容を編集できます：</p>
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
                            {isPostingTimeline ? '投稿中...' : '📢 タイムラインに投稿する'}
                          </button>
                        </div>
                      )}

                      {/* タイムライン投稿完了 */}
                      {timelinePosted && (
                        <div className="timelinePostedMessage">
                          <p>✅ タイムラインに投稿しました！</p>
                        </div>
                      )}

                      {/* タイムライン投稿しない場合の共有UI */}
                      {(!postToTimeline || !timelineText) && !timelinePosted && (
                        <div className="manualShareSection">
                          <p>タイムラインで共有してみんなに見てもらおう！</p>
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
                            {shareTextCopied ? '✅ コピーしました！' : '📋 テキストをコピー'}
                          </button>
                        </div>
                      )}

                      <button
                        onClick={handleCloseSendSuccess}
                        className="closeButton"
                      >
                        閉じる
                      </button>
                    </div>
                  )}
                  
                  {authState.isNip07 && !lastSentEventId && (
                    <>
                      {/* 描き足し中の表示 */}
                      {extendingCard && (
                        <div className="extendingInfo">
                          <span>✏️ 描き足し中</span>
                          <button 
                            onClick={() => setExtendingCard(null)}
                            className="cancelExtendButton"
                          >
                            キャンセル
                          </button>
                        </div>
                      )}
                      
                      <label className="timelineOption">
                        <input
                          type="checkbox"
                          checked={allowExtend}
                          onChange={(e) => setAllowExtend(e.target.checked)}
                        />
                        <span>描き足しを許可する</span>
                      </label>
                      <label className="timelineOption">
                        <input
                          type="checkbox"
                          checked={postToTimeline}
                          onChange={(e) => setPostToTimeline(e.target.checked)}
                        />
                        <span>タイムラインにも投稿する</span>
                      </label>
                      <button
                        onClick={handleSendCard}
                        disabled={!editorIsValid || isSending}
                        className="sendButton"
                      >
                        {isSending ? '送信中...' : extendingCard ? '✏️ 描き足して送信' : '🎨 送信する'}
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
            userPubkey={authState.pubkey}
            signEvent={authState.isNip07 ? signEvent : undefined}
            onExtend={handleExtend}
          />
        </aside>
      </div>

      <footer className="footer">
        <p>
          <strong>NostrDraw</strong> - Powered by{' '}
          <a href="https://nostr.com" target="_blank" rel="noopener noreferrer">
            Nostr
          </a>
        </p>
        <p className="footerNote">kind: 31898 | 🎍 New Year 2026 Campaign</p>
      </footer>
    </div>
  );
}

export default App;
