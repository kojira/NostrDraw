// 年賀状データ管理フック

import { useState, useCallback, useEffect } from 'react';
import type { NewYearCard, LayoutType } from '../types';
import { fetchReceivedCards, fetchSentCards, sendCard, type SendCardParams } from '../services/card';
import type { Event, EventTemplate } from 'nostr-tools';

export function useReceivedCards(pubkey: string | null) {
  const [cards, setCards] = useState<NewYearCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCards = useCallback(async () => {
    if (!pubkey) {
      setCards([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const receivedCards = await fetchReceivedCards(pubkey);
      setCards(receivedCards);
    } catch (err) {
      setError(err instanceof Error ? err.message : '年賀状の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [pubkey]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  return {
    cards,
    count: cards.length,
    isLoading,
    error,
    refresh: loadCards,
  };
}

export function useSentCards(pubkey: string | null) {
  const [cards, setCards] = useState<NewYearCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCards = useCallback(async () => {
    if (!pubkey) {
      setCards([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const sentCards = await fetchSentCards(pubkey);
      setCards(sentCards);
    } catch (err) {
      setError(err instanceof Error ? err.message : '送信済み年賀状の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [pubkey]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  return {
    cards,
    count: cards.length,
    isLoading,
    error,
    refresh: loadCards,
  };
}

export function useSendCard(signEvent: (event: EventTemplate) => Promise<Event>) {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEventId, setLastEventId] = useState<string | null>(null);

  const send = useCallback(async (params: SendCardParams): Promise<string | null> => {
    setIsSending(true);
    setError(null);
    setLastEventId(null);

    try {
      const event = await sendCard(params, signEvent);
      setLastEventId(event.id);
      return event.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : '送信に失敗しました');
      return null;
    } finally {
      setIsSending(false);
    }
  }, [signEvent]);

  return {
    send,
    isSending,
    error,
    lastEventId,
  };
}

// 年賀状エディタの状態管理
export interface CardEditorState {
  recipientPubkey: string | null;
  svg: string | null; // SVGデータ
  message: string;
  layoutId: LayoutType;
}

export function useCardEditor() {
  const [state, setState] = useState<CardEditorState>({
    recipientPubkey: null,
    svg: null,
    message: '',
    layoutId: 'vertical',
  });

  const setRecipient = useCallback((pubkey: string | null) => {
    setState(prev => ({ ...prev, recipientPubkey: pubkey }));
  }, []);

  const setSvg = useCallback((svg: string | null) => {
    setState(prev => ({ ...prev, svg }));
  }, []);

  const setMessage = useCallback((message: string) => {
    setState(prev => ({ ...prev, message }));
  }, []);

  const setLayout = useCallback((layoutId: LayoutType) => {
    setState(prev => ({ ...prev, layoutId }));
  }, []);

  const reset = useCallback(() => {
    setState({
      recipientPubkey: null,
      svg: null,
      message: '',
      layoutId: 'vertical',
    });
  }, []);

  const isValid = !!(state.recipientPubkey && state.svg);

  return {
    state,
    setRecipient,
    setSvg,
    setMessage,
    setLayout,
    reset,
    isValid,
  };
}

