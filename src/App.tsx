// Nostr年賀状サービス メインアプリケーション

import { useState, useCallback, useMemo } from 'react';
import { nip19 } from 'nostr-tools';
import { Auth } from './components/Auth';
import { RelaySettings } from './components/RelaySettings';
import { RecipientSelect } from './components/RecipientSelect';
import { CardEditor } from './components/CardEditor';
import { CardViewer } from './components/CardViewer';
import { useAuth } from './hooks/useAuth';
import { useNostr, useFollowees } from './hooks/useNostr';
import { useReceivedCards, useSentCards, useCardEditor, useSendCard } from './hooks/useCards';
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
    if (!editorState.recipientPubkey || !editorState.svg) return '';
    
    const recipientNpub = nip19.npubEncode(editorState.recipientPubkey);
    const lines = [
      '🎍 年賀状 🎍',
      '',
      `To: ${recipientName} (nostr:${recipientNpub})`,
      '',
    ];
    
    if (editorState.message) {
      lines.push(editorState.message);
      lines.push('');
    }
    
    // 注意: SVGは直接埋め込めないので説明を追加
    lines.push('💌 この年賀状は専用クライアントでご覧ください');
    
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

  // 年賀状を送信（SVGをイベントに直接埋め込み）
  const handleSendCard = async () => {
    if (!editorState.recipientPubkey || !editorState.svg) {
      return;
    }

    const success = await sendCard({
      recipientPubkey: editorState.recipientPubkey,
      svg: editorState.svg,
      message: editorState.message,
      layoutId: editorState.layoutId,
      year: 2026, // 2026年の年賀状
    });

    if (success) {
      resetEditor();
      refreshSent();
      alert('年賀状を送信しました！🎍');
    }
  };

  // カード一覧を更新
  const handleRefreshCards = () => {
    refreshReceived();
    refreshSent();
  };

  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">🎍 Nostr年賀状 🎍</h1>
        <p className="tagline">2026年 午年 🐴</p>
      </header>

      <main className="main">
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
                  ✍️ 年賀状を作成
                </button>
                <button
                  className={`viewButton ${activeView === 'view' ? 'active' : ''}`}
                  onClick={() => setActiveView('view')}
                >
                  📬 年賀状を見る ({receivedCount})
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
                  
                  {authState.isNip07 && (
                    <button
                      onClick={handleSendCard}
                      disabled={!editorIsValid || isSending}
                      className="sendButton"
                    >
                      {isSending ? '送信中...' : '🎍 年賀状を送信する'}
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
                        宛先と画像を選択してください
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
          Powered by{' '}
          <a href="https://nostr.com" target="_blank" rel="noopener noreferrer">
            Nostr
          </a>
        </p>
        <p className="footerNote">独自kind: 31989</p>
      </footer>
    </div>
  );
}

export default App;
