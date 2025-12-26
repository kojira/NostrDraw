// NostrDraw - Nostrで絵を描いて送るサービス

import { useState, useCallback, useMemo, useEffect } from 'react';
import { nip19 } from 'nostr-tools';
import type { NewYearCard } from './types';
import { Auth } from './components/Auth';
import { RelaySettings } from './components/RelaySettings';
import { RecipientSelect } from './components/RecipientSelect';
import { CardEditor } from './components/CardEditor';
import { CardViewer } from './components/CardViewer';
import { useAuth } from './hooks/useAuth';
import { useNostr, useFollowees } from './hooks/useNostr';
import { useReceivedCards, useSentCards, useCardEditor, useSendCard } from './hooks/useCards';
import { fetchCardById } from './services/card';
import { CardFlip } from './components/CardViewer/CardFlip';
import { ETO_IMAGES } from './data/etoGallery';
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
    state: editorState,
    setRecipient,
    setSvg,
    setMessage,
    setLayout,
    reset: resetEditor,
    isValid: editorIsValid,
  } = useCardEditor();

  const { send: sendCard, isSending, error: sendError } = useSendCard(signEvent);

  const [activeView, setActiveView] = useState<'create' | 'view'>('create');
  const [copied, setCopied] = useState(false);
  const [lastSentEventId, setLastSentEventId] = useState<string | null>(null);
  const [shareTextCopied, setShareTextCopied] = useState(false);
  
  // URLパラメータからeventidを取得して表示するカード
  const [sharedCard, setSharedCard] = useState<NewYearCard | null>(null);
  const [isLoadingSharedCard, setIsLoadingSharedCard] = useState(false);

  // NostrDrawのベースURL
  const BASE_URL = 'https://kojira.github.io/NostrDraw';

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

  // 宛先のプロフィール名を取得
  const recipientName = useMemo(() => {
    if (!editorState.recipientPubkey) return '';
    const profile = followees.find(f => f.pubkey === editorState.recipientPubkey);
    if (profile?.display_name) return profile.display_name;
    if (profile?.name) return profile.name;
    return nip19.npubEncode(editorState.recipientPubkey).slice(0, 16) + '...';
  }, [editorState.recipientPubkey, followees]);

  // kind 1用のテキストを生成（SVGはdata URIとして埋め込み）
  const kind1Text = useMemo(() => {
    if (!editorState.svg) return '';
    
    const lines = [
      '🎨 NostrDraw 🎍 New Year 2026',
      '',
    ];
    
    // 宛先がある場合のみTo:を追加
    if (editorState.recipientPubkey) {
      const recipientNpub = nip19.npubEncode(editorState.recipientPubkey);
      lines.push(`To: ${recipientName} (nostr:${recipientNpub})`);
      lines.push('');
    }
    
    if (editorState.message) {
      lines.push(editorState.message);
      lines.push('');
    }
    
    // 注意: SVGは直接埋め込めないので説明を追加
    lines.push('💌 NostrDrawでご覧ください');
    
    return lines.join('\n');
  }, [editorState.recipientPubkey, editorState.svg, editorState.message, recipientName]);

  // テキストをクリップボードにコピー
  const handleCopyKind1 = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(kind1Text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('コピーに失敗しました:', err);
    }
  }, [kind1Text]);

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
    });

    if (eventId) {
      setLastSentEventId(eventId);
      refreshSent();
    }
  };

  // 送信完了ダイアログを閉じる
  const handleCloseSendSuccess = () => {
    setLastSentEventId(null);
    resetEditor();
  };

  // カード一覧を更新
  const handleRefreshCards = () => {
    refreshReceived();
    refreshSent();
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
                  <CardFlip card={sharedCard} />
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

                {/* 年賀状エディタ */}
                <section className="section">
                  <CardEditor
                    svg={editorState.svg}
                    message={editorState.message}
                    layoutId={editorState.layoutId}
                    onSvgChange={setSvg}
                    onMessageChange={setMessage}
                    onLayoutChange={setLayout}
                    etoImages={ETO_IMAGES}
                    userPubkey={authState.pubkey}
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
                      <p>タイムラインで共有してみんなに見てもらおう！</p>
                      <textarea
                        className="shareTextarea"
                        value={shareText}
                        readOnly
                        rows={6}
                      />
                      <div className="shareButtons">
                        <button
                          onClick={handleCopyShareText}
                          className="copyButton"
                        >
                          {shareTextCopied ? '✅ コピーしました！' : '📋 テキストをコピー'}
                        </button>
                        <button
                          onClick={handleCloseSendSuccess}
                          className="closeButton"
                        >
                          閉じる
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {authState.isNip07 && !lastSentEventId && (
                    <button
                      onClick={handleSendCard}
                      disabled={!editorIsValid || isSending}
                      className="sendButton"
                    >
                      {isSending ? '送信中...' : '🎨 送信する'}
                    </button>
                  )}
                  
                  {/* kind 1コピー機能（常に表示） */}
                  <div className="kind1Section">
                    {!authState.isNip07 && (
                      <p className="warning">
                        ⚠️ NIP-07でログインしていないため、独自kindでの送信はできません。
                      </p>
                    )}
                    <p className="kind1Hint">
                      {authState.isNip07 
                        ? '💡 kind 1（通常のノート）として投稿したい場合は、以下のテキストをコピーできます。'
                        : '代わりに、以下のテキストをコピーして他のNostrクライアントからkind 1（通常のノート）として投稿できます。'}
                    </p>
                    
                    {editorIsValid && (
                      <>
                        <textarea
                          className="kind1Textarea"
                          value={kind1Text}
                          readOnly
                          rows={8}
                        />
                        <button
                          onClick={handleCopyKind1}
                          className="copyButton"
                        >
                          {copied ? '✅ コピーしました！' : '📋 テキストをコピー'}
                        </button>
                      </>
                    )}
                    
                    {!editorIsValid && (
                      <p className="kind1Warning">
                        画像を作成してください
                      </p>
                    )}
                  </div>
                </section>
              </>
            ) : (
              /* 年賀状ビューア */
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
                  onRefresh={handleRefreshCards}
                />
              </section>
            )}
          </>
        )}
      </main>

      <footer className="footer">
        <p>
          <strong>NostrDraw</strong> - Powered by{' '}
          <a href="https://nostr.com" target="_blank" rel="noopener noreferrer">
            Nostr
          </a>
        </p>
        <p className="footerNote">kind: 31989 | 🎍 New Year 2026 Campaign</p>
      </footer>
    </div>
  );
}

export default App;
