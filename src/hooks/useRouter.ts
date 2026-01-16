// シンプルなハッシュベースルーター
import { useState, useEffect, useCallback } from 'react';

export interface Route {
  page: 'home' | 'gallery' | 'user' | 'create' | 'notifications' | 'settings' | 'help';
  params: Record<string, string>;
}

function parseHash(hash: string): Route {
  // ハッシュを解析
  // #gallery -> { page: 'gallery', params: {} }
  // #user/npub1xxx -> { page: 'user', params: { npub: 'npub1xxx' } }
  // #gallery?tab=popular&period=week -> { page: 'gallery', params: { tab: 'popular', period: 'week' } }
  
  if (!hash || hash === '' || hash === '#') {
    return { page: 'home', params: {} };
  }

  // #を除去
  const hashContent = hash.startsWith('#') ? hash.slice(1) : hash;
  
  // クエリパラメータを分離
  const [path, queryString] = hashContent.split('?');
  
  // パスを解析
  const segments = path.split('/').filter(Boolean);
  
  // クエリパラメータを解析
  const params: Record<string, string> = {};
  if (queryString) {
    const searchParams = new URLSearchParams(queryString);
    searchParams.forEach((value, key) => {
      params[key] = value;
    });
  }
  
  if (segments[0] === 'gallery') {
    return { page: 'gallery', params };
  }
  
  if (segments[0] === 'user' && segments[1]) {
    return { page: 'user', params: { ...params, npub: segments[1] } };
  }
  
  if (segments[0] === 'create') {
    return { page: 'create', params };
  }
  
  if (segments[0] === 'notifications') {
    return { page: 'notifications', params };
  }
  
  if (segments[0] === 'settings') {
    return { page: 'settings', params };
  }
  
  if (segments[0] === 'help') {
    return { page: 'help', params };
  }
  
  return { page: 'home', params };
}

export function useRouter() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHash(window.location.hash));
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = useCallback((path: string) => {
    // クエリパラメータをクリアしてハッシュを設定
    if (window.location.search) {
      window.history.replaceState(null, '', window.location.pathname + '#' + path);
      setRoute(parseHash('#' + path));
    } else {
      window.location.hash = path;
    }
  }, []);

  const goHome = useCallback(() => {
    // クエリパラメータをクリアしてホームに戻る
    if (window.location.search || window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
      setRoute({ page: 'home', params: {} });
    }
  }, []);

  const goToGallery = useCallback((params?: { tab?: string; period?: string; author?: string }) => {
    let path = 'gallery';
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value) searchParams.set(key, value);
      });
      const queryString = searchParams.toString();
      if (queryString) path += `?${queryString}`;
    }
    // クエリパラメータをクリアしてハッシュを設定
    if (window.location.search) {
      window.history.replaceState(null, '', window.location.pathname + '#' + path);
      setRoute(parseHash('#' + path));
    } else {
      window.location.hash = path;
    }
  }, []);

  const goToUser = useCallback((npub: string) => {
    const path = `user/${npub}`;
    if (window.location.search) {
      window.history.replaceState(null, '', window.location.pathname + '#' + path);
      setRoute(parseHash('#' + path));
    } else {
      window.location.hash = path;
    }
  }, []);

  const goToCreate = useCallback(() => {
    const path = 'create';
    if (window.location.search) {
      window.history.replaceState(null, '', window.location.pathname + '#' + path);
      setRoute(parseHash('#' + path));
    } else {
      window.location.hash = path;
    }
  }, []);

  const goToNotifications = useCallback(() => {
    const path = 'notifications';
    if (window.location.search) {
      window.history.replaceState(null, '', window.location.pathname + '#' + path);
      setRoute(parseHash('#' + path));
    } else {
      window.location.hash = path;
    }
  }, []);

  const goToSettings = useCallback(() => {
    const path = 'settings';
    if (window.location.search) {
      window.history.replaceState(null, '', window.location.pathname + '#' + path);
      setRoute(parseHash('#' + path));
    } else {
      window.location.hash = path;
    }
  }, []);

  const goToHelp = useCallback(() => {
    const path = 'help';
    if (window.location.search) {
      window.history.replaceState(null, '', window.location.pathname + '#' + path);
      setRoute(parseHash('#' + path));
    } else {
      window.location.hash = path;
    }
  }, []);

  return {
    route,
    navigate,
    goHome,
    goToGallery,
    goToUser,
    goToCreate,
    goToNotifications,
    goToSettings,
    goToHelp,
  };
}

