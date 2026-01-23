// DrawingCanvasの状態管理フック

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { TEMPLATES, STAMPS } from '../../../data/templates';
import { JAPANESE_FONTS } from '../../../data/fonts';
import type {
  Point,
  Stroke,
  PlacedStamp,
  TextBox,
  ToolType,
  DragMode,
  StampTab,
  Template,
  Stamp,
  CustomEmoji,
  Layer,
  PixelLayer,
  GridSize,
} from './types';
import { CUSTOM_COLORS_STORAGE_KEY, MAX_CUSTOM_COLORS, MAX_LAYERS, MAX_HISTORY_SIZE, createDefaultLayer, createDefaultPixelLayer, DEFAULT_GRID_SIZE, getPixelScale } from './types';
import { getOrAddPaletteIndex, pixelLayerToSvg } from '../../../utils/pixelFormat';
import { savePaletteToNostr, fetchPalettesFromNostr, syncFavoritePalettes as syncFavoritesFromService, fetchFavoritePaletteData, removeFavoritePalette, saveFavoritePalettesToNostr, getFavoritePaletteIds, type ColorPalette as NostrPalette } from '../../../services/palette';
import { fetchProfile } from '../../../services/profile';

// ローカルストレージのキー
const STORAGE_KEY = 'nostrdraw-canvas-state';

// 保存するデータの型（レイヤー対応）
interface CanvasStorageData {
  layers: Layer[];
  activeLayerId: string;
  templateId: string;
  savedAt: number;
}

// 旧形式のストレージデータ（後方互換性）
interface LegacyCanvasStorageData {
  strokes: Stroke[];
  placedStamps: PlacedStamp[];
  textBoxes: TextBox[];
  templateId: string;
  savedAt: number;
}

// デフォルトのレイヤーを作成
function createInitialLayers(): Layer[] {
  return [createDefaultLayer('layer-1', 'レイヤー 1')];
}

// ローカルストレージからデータを読み込む
function loadCanvasState(): CanvasStorageData | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const data = JSON.parse(saved);
    
    // 24時間以上経過したデータは無視
    if (Date.now() - data.savedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    
    // 新形式（layers配列がある場合）
    if (data.layers && Array.isArray(data.layers)) {
      // レイヤーのvisibleプロパティが欠落または不正な場合はtrueに設定
      const normalizedLayers = data.layers.map((layer: Layer) => ({
        ...layer,
        visible: layer.visible !== false, // undefined や true の場合は true
        locked: layer.locked === true, // undefined の場合は false
        opacity: typeof layer.opacity === 'number' ? layer.opacity : 1,
      }));
      return {
        ...data,
        layers: normalizedLayers,
      } as CanvasStorageData;
    }
    
    // 旧形式からの変換（後方互換性）
    const legacyData = data as LegacyCanvasStorageData;
    const migratedLayer = createDefaultLayer('layer-1', 'レイヤー 1');
    migratedLayer.strokes = legacyData.strokes || [];
    migratedLayer.placedStamps = legacyData.placedStamps || [];
    migratedLayer.textBoxes = legacyData.textBoxes || [];
    
    return {
      layers: [migratedLayer],
      activeLayerId: 'layer-1',
      templateId: legacyData.templateId,
      savedAt: legacyData.savedAt,
    };
  } catch {
    return null;
  }
}

// ローカルストレージにデータを保存
function saveCanvasState(data: Omit<CanvasStorageData, 'savedAt'>): void {
  try {
    const toSave: CanvasStorageData = {
      ...data,
      savedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // ストレージ容量オーバーなどのエラーを無視
  }
}

// ローカルストレージのデータをクリア
function clearCanvasState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // エラーを無視
  }
}

interface UseDrawingCanvasOptions {
  width: number;
  height: number;
  initialMessage: string;
  signEvent?: (event: import('nostr-tools').EventTemplate) => Promise<import('nostr-tools').Event>;
  userPubkey?: string | null;
}

export function useDrawingCanvas({ width, height, initialMessage: _initialMessage, signEvent, userPubkey }: UseDrawingCanvasOptions) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#e94560');
  const [lineWidth, setLineWidth] = useState(3);
  const [tool, setTool] = useState<ToolType>('pen');
  const lastPointRef = useRef<Point | null>(null);
  
  // ローカルストレージから初期状態を読み込む
  const savedState = useMemo(() => loadCanvasState(), []);
  
  // 下書きに内容があるかどうかをチェック
  const hasSavedDraft = useMemo(() => {
    if (!savedState?.layers) return false;
    return savedState.layers.some(layer => 
      layer.strokes.length > 0 || 
      layer.placedStamps.length > 0 || 
      layer.textBoxes.some(tb => tb.text.trim().length > 0)
    );
  }, [savedState]);
  
  // 下書き確認ダイアログの状態
  const [showDraftConfirm, setShowDraftConfirm] = useState(hasSavedDraft);
  
  // レイヤー状態（下書きを使用するかどうかの決定前は空の状態）
  const [layers, setLayers] = useState<Layer[]>(() => {
    // 下書きがあり、まだ決定していない場合は初期レイヤーを使用
    if (hasSavedDraft) {
      return createInitialLayers();
    }
    return savedState?.layers || createInitialLayers();
  });
  const [activeLayerId, setActiveLayerId] = useState<string>(() => {
    if (hasSavedDraft) {
      return 'layer-1';
    }
    return savedState?.activeLayerId || 'layer-1';
  });
  
  // 下書きを使用する
  const useDraft = useCallback(() => {
    if (savedState?.layers) {
      setLayers(savedState.layers);
      setActiveLayerId(savedState.activeLayerId || savedState.layers[0]?.id || 'layer-1');
    }
    setShowDraftConfirm(false);
  }, [savedState]);
  
  // 下書きを破棄する
  const discardDraft = useCallback(() => {
    clearCanvasState();
    setLayers(createInitialLayers());
    setActiveLayerId('layer-1');
    setShowDraftConfirm(false);
  }, []);
  
  // 下書きをクリアする（投稿成功時などに使用）
  const clearDraft = useCallback(() => {
    clearCanvasState();
  }, []);
  
  // アクティブレイヤーの取得
  const activeLayer = useMemo(() => layers.find(l => l.id === activeLayerId) || layers[0], [layers, activeLayerId]);
  
  // ピクセルレイヤー関連のステート
  const [pixelLayers, setPixelLayers] = useState<PixelLayer[]>([]);
  const [activePixelLayerId, setActivePixelLayerId] = useState<string | null>(null);
  const [gridMode, setGridMode] = useState(false);
  const [gridSize, setGridSize] = useState<GridSize>(DEFAULT_GRID_SIZE);
  const [showGrid, setShowGrid] = useState(true);
  
  // アクティブピクセルレイヤーの取得
  const activePixelLayer = useMemo(() => 
    pixelLayers.find(l => l.id === activePixelLayerId) || null, 
    [pixelLayers, activePixelLayerId]
  );
  
  // ピクセルレイヤーのスケール計算（ピクセルパーフェクト）
  const pixelScale = useMemo(() => getPixelScale(gridSize, width, height), [gridSize, width, height]);
  
  // ピクセルレイヤーのオフセット計算（中央寄せ）
  const pixelOffset = useMemo(() => {
    const totalWidth = gridSize * pixelScale;
    const totalHeight = gridSize * pixelScale;
    return {
      x: Math.floor((width - totalWidth) / 2),
      y: Math.floor((height - totalHeight) / 2),
    };
  }, [gridSize, pixelScale, width, height]);
  
  // 後方互換性のためのエイリアス（アクティブレイヤーのデータ）
  const strokes = activeLayer?.strokes || [];
  
  // アクティブレイヤーの配置スタンプ（後方互換性）
  const placedStamps = activeLayer?.placedStamps || [];
  
  // 全レイヤーの配置スタンプを取得（表示中のレイヤーのみ、レンダリング用）
  const allPlacedStamps = useMemo(() => layers.flatMap(l => l.visible ? l.placedStamps : []), [layers]);
  
  // アクティブレイヤーのストロークを更新
  const setStrokes = useCallback((updater: Stroke[] | ((prev: Stroke[]) => Stroke[])) => {
    setLayers(prevLayers => prevLayers.map(layer =>
      layer.id === activeLayerId
        ? { ...layer, strokes: typeof updater === 'function' ? updater(layer.strokes) : updater }
        : layer
    ));
  }, [activeLayerId]);
  
  // アクティブレイヤーの配置スタンプを更新
  const setPlacedStamps = useCallback((updater: PlacedStamp[] | ((prev: PlacedStamp[]) => PlacedStamp[])) => {
    setLayers(prevLayers => prevLayers.map(layer =>
      layer.id === activeLayerId
        ? { ...layer, placedStamps: typeof updater === 'function' ? updater(layer.placedStamps) : updater }
        : layer
    ));
  }, [activeLayerId]);
  
  // アクティブレイヤーのテキストボックスを更新
  const setLayerTextBoxes = useCallback((updater: TextBox[] | ((prev: TextBox[]) => TextBox[])) => {
    setLayers(prevLayers => prevLayers.map(layer =>
      layer.id === activeLayerId
        ? { ...layer, textBoxes: typeof updater === 'function' ? updater(layer.textBoxes) : updater }
        : layer
    ));
  }, [activeLayerId]);
  
  const currentStrokeRef = useRef<Point[]>([]);
  
  // Undo/Redo用の履歴（レイヤー全体のスナップショット）
  interface HistorySnapshot {
    layers: Layer[];
    pixelLayers: PixelLayer[];
  }
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyIndexRef = useRef(-1);
  const isUndoRedoRef = useRef(false); // Undo/Redo操作中かどうか
  const isInitializedRef = useRef(false); // 初期化完了フラグ
  
  // historyIndexが変更されたらrefも更新
  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);
  
  // レイヤーの深いコピーを作成
  const deepCopyLayers = useCallback((layersToClone: Layer[]): Layer[] => {
    return layersToClone.map(layer => ({
      ...layer,
      strokes: layer.strokes.map(s => ({ ...s, points: [...s.points] })),
      placedStamps: layer.placedStamps.map(p => ({ ...p })),
      textBoxes: layer.textBoxes.map(t => ({ ...t })),
    }));
  }, []);
  
  // ピクセルレイヤーの深いコピーを作成
  const deepCopyPixelLayers = useCallback((pixelLayersToClone: PixelLayer[]): PixelLayer[] => {
    return pixelLayersToClone.map(layer => ({
      ...layer,
      pixels: new Uint8Array(layer.pixels),
      palette: [...layer.palette],
    }));
  }, []);
  
  // 履歴スナップショットの作成用ref（pixelLayers参照用）
  const pixelLayersRef = useRef<PixelLayer[]>(pixelLayers);
  useEffect(() => {
    pixelLayersRef.current = pixelLayers;
  }, [pixelLayers]);
  
  // 履歴に状態を追加（内部用）
  const addToHistory = useCallback((newLayers: Layer[], newPixelLayers?: PixelLayer[]) => {
    const snapshot: HistorySnapshot = {
      layers: deepCopyLayers(newLayers),
      pixelLayers: deepCopyPixelLayers(newPixelLayers ?? pixelLayersRef.current),
    };
    const currentIndex = historyIndexRef.current;
    
    console.log('[addToHistory] called, currentIndex:', currentIndex);
    
    setHistory(prev => {
      // 現在位置より後の履歴を削除して新しい状態を追加
      const newHistory = [...prev.slice(0, currentIndex + 1), snapshot];
      // 最大サイズを超えたら古い履歴を削除
      if (newHistory.length > MAX_HISTORY_SIZE) {
        return newHistory.slice(newHistory.length - MAX_HISTORY_SIZE);
      }
      return newHistory;
    });
    
    const newIndex = Math.min(currentIndex + 1, MAX_HISTORY_SIZE - 1);
    setHistoryIndex(newIndex);
    historyIndexRef.current = newIndex;
    console.log('[addToHistory] newIndex:', newIndex);
  }, [deepCopyLayers, deepCopyPixelLayers]);
  
  // layersが変更されたら自動的に履歴に追加（Undo/Redo以外の変更のみ）
  useEffect(() => {
    // Undo/Redo操作中は履歴に追加しない
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }
    
    // 初回は初期状態を保存
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      addToHistory(layers);
      return;
    }
    
    // 通常の変更は履歴に追加
    addToHistory(layers);
  }, [layers, addToHistory]);
  
  
  // レイヤー操作関数
  const addLayer = useCallback(() => {
    if (layers.length >= MAX_LAYERS) return;
    const newId = `layer-${Date.now()}`;
    const newLayer = createDefaultLayer(newId, `レイヤー ${layers.length + 1}`);
    setLayers(prev => [...prev, newLayer]);
    setActiveLayerId(newId);
  }, [layers]);

  const removeLayer = useCallback((layerId: string) => {
    if (layers.length <= 1) return; // 最低1レイヤーは必要
    setLayers(prev => prev.filter(l => l.id !== layerId));
    if (activeLayerId === layerId) {
      const remaining = layers.filter(l => l.id !== layerId);
      setActiveLayerId(remaining[0]?.id || '');
    }
  }, [layers, activeLayerId]);

  const selectLayer = useCallback((layerId: string) => {
    setActiveLayerId(layerId);
  }, []);

  const toggleLayerVisibility = useCallback((layerId: string) => {
    setLayers(prev => prev.map(layer =>
      layer.id === layerId ? { ...layer, visible: !layer.visible } : layer
    ));
  }, []);

  const toggleLayerLock = useCallback((layerId: string) => {
    setLayers(prev => prev.map(layer =>
      layer.id === layerId ? { ...layer, locked: !layer.locked } : layer
    ));
  }, []);

  const setLayerOpacity = useCallback((layerId: string, opacity: number) => {
    setLayers(prev => prev.map(layer =>
      layer.id === layerId ? { ...layer, opacity: Math.max(0, Math.min(1, opacity)) } : layer
    ));
  }, []);

  const reorderLayers = useCallback((fromIndex: number, toIndex: number) => {
    setLayers(prev => {
      const result = [...prev];
      const [removed] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, removed);
      return result;
    });
  }, []);

  const renameLayer = useCallback((layerId: string, newName: string) => {
    setLayers(prev => prev.map(layer =>
      layer.id === layerId ? { ...layer, name: newName } : layer
    ));
  }, []);
  
  // テンプレートとスタンプ
  const [selectedTemplate, setSelectedTemplateState] = useState<Template>(() => {
    if (savedState?.templateId) {
      const found = TEMPLATES.find(t => t.id === savedState.templateId);
      if (found) return found;
    }
    return TEMPLATES[0];
  });
  
  // 背景色（テンプレートのデフォルト or ユーザー指定）
  const [backgroundColor, setBackgroundColor] = useState<string>(() => {
    if (savedState?.templateId) {
      const found = TEMPLATES.find(t => t.id === savedState.templateId);
      if (found?.backgroundColor) return found.backgroundColor;
    }
    return TEMPLATES[0].backgroundColor || '#ffffff';
  });
  
  // テンプレート選択時に背景色も自動設定
  const setSelectedTemplate = useCallback((template: Template) => {
    setSelectedTemplateState(template);
    // テンプレートに背景色が設定されていれば適用
    if (template.backgroundColor) {
      setBackgroundColor(template.backgroundColor);
    }
  }, []);
  
  const [selectedStamp, setSelectedStamp] = useState<Stamp | null>(null);
  const [selectedCustomEmoji, setSelectedCustomEmoji] = useState<CustomEmoji | null>(null);
  const [selectedPlacedStampId, setSelectedPlacedStampId] = useState<string | null>(null);
  const [stampScale, setStampScale] = useState(1);
  const [stampTab, setStampTab] = useState<StampTab>('builtin');
  const [stampDragStart, setStampDragStart] = useState<Point | null>(null);

  // パレット管理用のローカルストレージキー（pubkeyごとに分離）
  const getPalettesKey = useCallback((pubkey?: string | null) => {
    const suffix = pubkey || 'anonymous';
    return `nostrdraw-palettes-${suffix}`;
  }, []);
  
  const getActiveKey = useCallback((pubkey?: string | null) => {
    const suffix = pubkey || 'anonymous';
    return `nostrdraw-active-palette-${suffix}`;
  }, []);

  // パレット型
  interface LocalPalette {
    id: string;
    name: string;
    colors: string[];
    authorPubkey?: string; // インポート元の作者pubkey
    authorPicture?: string; // 作者のアバター画像URL
    eventId?: string; // お気に入りからインポートした場合のイベントID
  }

  // デフォルトパレット
  const defaultPalette: LocalPalette = { id: 'default', name: 'デフォルト', colors: [] };

  // パレットをローカルストレージから読み込む
  const loadPalettesForUser = useCallback((pubkey?: string | null): LocalPalette[] => {
    try {
      const key = getPalettesKey(pubkey);
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        // 古いフォーマットからの移行
        if (!Array.isArray(parsed)) {
          return [defaultPalette];
        }
        // デフォルトパレットがなければ追加
        if (!parsed.find((p: LocalPalette) => p.id === 'default')) {
          return [defaultPalette, ...parsed];
        }
        return parsed;
      }
      // 古いカスタムカラーからの移行
      const oldColors = localStorage.getItem(CUSTOM_COLORS_STORAGE_KEY);
      if (oldColors) {
        const colors = JSON.parse(oldColors);
        return [{ ...defaultPalette, colors }];
      }
      return [defaultPalette];
    } catch {
      return [defaultPalette];
    }
  }, [getPalettesKey]);

  // パレット一覧
  const [palettes, setPalettes] = useState<LocalPalette[]>(() => loadPalettesForUser(userPubkey));

  // アクティブパレットID
  const [activePaletteId, setActivePaletteId] = useState<string>(() => {
    try {
      const key = getActiveKey(userPubkey);
      return localStorage.getItem(key) || 'default';
    } catch {
      return 'default';
    }
  });

  // userPubkeyが変更されたらパレットを再読み込み
  useEffect(() => {
    const newPalettes = loadPalettesForUser(userPubkey);
    setPalettes(newPalettes);
    
    try {
      const key = getActiveKey(userPubkey);
      const savedActiveId = localStorage.getItem(key) || 'default';
      // パレットが存在するか確認
      const exists = newPalettes.some(p => p.id === savedActiveId);
      setActivePaletteId(exists ? savedActiveId : 'default');
    } catch {
      setActivePaletteId('default');
    }
  }, [userPubkey, loadPalettesForUser, getActiveKey]);

  // アクティブパレットの色
  const customColors = useMemo(() => {
    const palette = palettes.find(p => p.id === activePaletteId);
    return palette?.colors || [];
  }, [palettes, activePaletteId]);

  // アクティブパレット
  const activePalette = useMemo(() => {
    return palettes.find(p => p.id === activePaletteId) || defaultPalette;
  }, [palettes, activePaletteId]);

  // パレットを保存
  const savePalettes = useCallback((newPalettes: LocalPalette[]) => {
    try {
      const key = getPalettesKey(userPubkey);
      localStorage.setItem(key, JSON.stringify(newPalettes));
    } catch {
      // エラーを無視
    }
  }, [getPalettesKey, userPubkey]);

  // パレットを切り替え
  const switchPalette = useCallback((paletteId: string) => {
    setActivePaletteId(paletteId);
    try {
      const key = getActiveKey(userPubkey);
      localStorage.setItem(key, paletteId);
    } catch {
      // エラーを無視
    }
  }, [getActiveKey, userPubkey]);

  // 新しいパレットを作成
  const createPalette = useCallback((name: string) => {
    const newPalette: LocalPalette = {
      id: `palette-${Date.now()}`,
      name,
      colors: [],
    };
    const updated = [...palettes, newPalette];
    setPalettes(updated);
    savePalettes(updated);
    switchPalette(newPalette.id);
  }, [palettes, savePalettes, switchPalette]);

  // パレットを削除（お気に入りからインポートしたパレットの場合はお気に入りも解除）
  const deletePalette = useCallback((paletteId: string) => {
    if (paletteId === 'default') return;
    
    // 削除対象のパレットを取得
    const targetPalette = palettes.find(p => p.id === paletteId);
    
    // お気に入りからインポートしたパレット（eventIdがある）の場合はお気に入りも解除
    if (targetPalette?.eventId) {
      removeFavoritePalette(targetPalette.eventId);
      // Nostrにもお気に入りリストの更新を保存
      if (signEvent) {
        const newFavoriteIds = getFavoritePaletteIds();
        saveFavoritePalettesToNostr(newFavoriteIds, signEvent).catch(err => {
          console.error('Failed to save favorites to Nostr:', err);
        });
      }
    }
    
    const updated = palettes.filter(p => p.id !== paletteId);
    setPalettes(updated);
    savePalettes(updated);
    if (activePaletteId === paletteId) {
      switchPalette('default');
    }
  }, [palettes, activePaletteId, savePalettes, switchPalette, signEvent]);

  // パレット名を変更（デフォルトパレットも変更可能）
  const renamePalette = useCallback((paletteId: string, newName: string) => {
    setPalettes(prev => {
      const updated = prev.map(p => 
        p.id === paletteId ? { ...p, name: newName } : p
      );
      savePalettes(updated);
      return updated;
    });
  }, [savePalettes]);

  // Nostr保存中フラグ
  const [isSavingPaletteToNostr, setIsSavingPaletteToNostr] = useState(false);

  // パレットをNostrに保存（デフォルトパレットは新しいIDで保存）
  // overrideName: デフォルトパレットに名前を付けて保存する際に使用
  const savePaletteToCloud = useCallback(async (paletteId?: string, overrideName?: string) => {
    if (!signEvent) return false;
    
    const targetId = paletteId || activePaletteId;
    const palette = palettes.find(p => p.id === targetId);
    if (!palette) return false;
    
    // 保存する名前（overrideNameがあればそれを使用）
    const saveName = overrideName || palette.name;
    
    setIsSavingPaletteToNostr(true);
    try {
      // デフォルトパレットの場合は新しいIDを生成
      const saveId = palette.id === 'default' ? `palette-${Date.now()}` : palette.id;
      
      const nostrPalette: NostrPalette = {
        id: saveId,
        name: saveName,
        colors: palette.colors,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const success = await savePaletteToNostr(nostrPalette, signEvent);
      
      // デフォルトパレットを新しいIDに昇格
      if (success && palette.id === 'default') {
        setPalettes(prev => {
          const updated = prev.map(p => 
            p.id === 'default' ? { ...p, id: saveId, name: saveName } : p
          );
          // 新しいデフォルトパレットを追加
          updated.unshift(defaultPalette);
          savePalettes(updated);
          return updated;
        });
        // アクティブパレットを新しいIDに切り替え
        switchPalette(saveId);
      }
      
      return success;
    } catch (error) {
      console.error('Failed to save palette to Nostr:', error);
      return false;
    } finally {
      setIsSavingPaletteToNostr(false);
    }
  }, [activePaletteId, palettes, signEvent, savePalettes, switchPalette]);

  // Nostrからパレットを同期（ローカルパレットを保持しつつマージ）
  const syncPalettesFromCloud = useCallback(async () => {
    if (!userPubkey) return;
    
    try {
      const cloudPalettes = await fetchPalettesFromNostr(userPubkey);
      if (cloudPalettes.length > 0) {
        setPalettes(prev => {
          // ローカルの全パレットをコピー
          const merged: LocalPalette[] = [...prev];
          
          // クラウドのパレットをマージ（同じIDがあれば更新、なければ追加）
          for (const cloud of cloudPalettes) {
            const existingIndex = merged.findIndex(p => p.id === cloud.id);
            const cloudPalette: LocalPalette = {
              id: cloud.id,
              name: cloud.name,
              colors: cloud.colors,
            };
            if (existingIndex >= 0) {
              // クラウドのパレットでローカルを更新
              merged[existingIndex] = cloudPalette;
            } else {
              // 新しいパレットを追加
              merged.push(cloudPalette);
            }
          }
          savePalettes(merged);
          return merged;
        });
      }
    } catch (error) {
      console.error('Failed to sync palettes from Nostr:', error);
    }
  }, [userPubkey, savePalettes]);

  // ログイン時にNostrから同期
  useEffect(() => {
    if (userPubkey) {
      syncPalettesFromCloud();
      syncFavoritePalettes();
    }
  }, [userPubkey, syncPalettesFromCloud]);

  // お気に入りパレットを同期してローカルパレットに追加
  const syncFavoritePalettes = useCallback(async () => {
    if (!userPubkey) return;
    
    try {
      // お気に入りIDを取得（Nostrとローカルをマージ）
      const favoriteIds = await syncFavoritesFromService(userPubkey);
      if (favoriteIds.length === 0) return;
      
      // お気に入りパレットの実データを取得
      const favoritePalettes = await fetchFavoritePaletteData(favoriteIds);
      if (favoritePalettes.length === 0) return;
      
      // 作者のプロフィールを取得してアバター画像を追加
      const palettesWithPictures: LocalPalette[] = [];
      for (const fav of favoritePalettes) {
        let authorPicture: string | undefined;
        if (fav.pubkey) {
          const profile = await fetchProfile(fav.pubkey);
          authorPicture = profile?.picture;
        }
        palettesWithPictures.push({
          id: `favorite-${fav.eventId || fav.id}`,
          name: fav.name,
          colors: fav.colors,
          authorPubkey: fav.pubkey,
          authorPicture,
        });
      }
      
      // ローカルパレットにマージ（既存のお気に入りは更新、新しいものは追加）
      setPalettes(prev => {
        const merged = [...prev];
        for (const favPalette of palettesWithPictures) {
          const existingIndex = merged.findIndex(p => p.id === favPalette.id);
          if (existingIndex >= 0) {
            merged[existingIndex] = favPalette;
          } else {
            merged.push(favPalette);
          }
        }
        savePalettes(merged);
        return merged;
      });
    } catch (error) {
      console.error('Failed to sync favorite palettes:', error);
    }
  }, [userPubkey, savePalettes]);

  // パレットをインポート
  const importPalette = useCallback((palette: NostrPalette, authorPicture?: string) => {
    const newPalette: LocalPalette = {
      id: `imported-${Date.now()}`,
      name: palette.name,
      colors: palette.colors,
      authorPubkey: palette.pubkey,
      authorPicture: authorPicture,
    };
    const updated = [...palettes, newPalette];
    setPalettes(updated);
    savePalettes(updated);
    switchPalette(newPalette.id);
  }, [palettes, savePalettes, switchPalette]);

  // カスタムカラーを保存（アクティブパレットに追加）
  const addCustomColor = useCallback((newColor: string) => {
    setPalettes(prev => {
      const updated = prev.map(p => {
        if (p.id === activePaletteId) {
          const filtered = p.colors.filter(c => c.toLowerCase() !== newColor.toLowerCase());
          return { ...p, colors: [newColor, ...filtered].slice(0, MAX_CUSTOM_COLORS) };
        }
        return p;
      });
      savePalettes(updated);
      return updated;
    });
  }, [activePaletteId, savePalettes]);

  // カスタムカラーを削除
  const removeCustomColor = useCallback((colorToRemove: string) => {
    setPalettes(prev => {
      const updated = prev.map(p => {
        if (p.id === activePaletteId) {
          return { ...p, colors: p.colors.filter(c => c.toLowerCase() !== colorToRemove.toLowerCase()) };
        }
        return p;
      });
      savePalettes(updated);
      return updated;
    });
  }, [activePaletteId, savePalettes]);
  const [stampDragOriginal, setStampDragOriginal] = useState<PlacedStamp | null>(null);
  const [stampDragMode, setStampDragMode] = useState<'move' | 'resize' | null>(null);

  // ピンチズーム・パン
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 });
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);
  const pinchStartCenterRef = useRef<Point | null>(null);
  const panStartOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const isPinchingRef = useRef(false);

  // テキストボックス（複数対応）
  const createTextBox = useCallback((overrides: Partial<TextBox> = {}): TextBox => ({
    id: `textbox-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    text: '',
    x: 20,
    y: 20,
    width: Math.min(width - 40, 360),
    height: 50,
    fontSize: 16,
    color: '#333333',
    fontFamily: JAPANESE_FONTS[0].family,
    fontId: JAPANESE_FONTS[0].id,
    ...overrides,
  }), [width, height]);

  // テキストボックスはアクティブレイヤーから取得
  const textBoxes = activeLayer?.textBoxes || [];
  const setTextBoxes = setLayerTextBoxes;
  const [selectedTextBoxId, setSelectedTextBoxId] = useState<string | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [textBoxStart, setTextBoxStart] = useState<TextBox | null>(null);
  const [fontCategory, setFontCategory] = useState<string>('all');

  // 選択中のテキストボックス
  const selectedTextBox = textBoxes.find(tb => tb.id === selectedTextBoxId) || null;

  // 後方互換性のためのmessageとmessageBox
  const message = selectedTextBox?.text || '';
  const messageBox = selectedTextBox || textBoxes[0] || createTextBox();

  // キャンバスの初期化と再描画（全レイヤー対応）
  // 注意: テンプレートはDOMに直接配置されるため、キャンバスにはストロークのみを描画
  const redrawCanvas = useCallback((layersToRender: Layer[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    contextRef.current = ctx;

    // 背景をクリア（透明）
    ctx.clearRect(0, 0, width, height);
    
    // すべての表示中のレイヤーのストロークを描画（下から上へ）
    layersToRender.forEach(layer => {
      if (!layer.visible) return; // 非表示レイヤーはスキップ
      
      // レイヤーの不透明度を設定
      ctx.globalAlpha = layer.opacity;
      
      // ストロークを再描画
      layer.strokes.forEach(stroke => {
        if (stroke.points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = stroke.lineWidth;
        ctx.strokeStyle = stroke.color;
        ctx.stroke();
      });
    });
    
    // 不透明度をリセット
    ctx.globalAlpha = 1;
    
    // スタンプはオーバーレイで表示するため、キャンバスには描画しない
  }, [width, height]);

  // テンプレートまたはレイヤー変更時に再描画（1つのuseEffectで管理して競合を防ぐ）
  useEffect(() => {
    redrawCanvas(layers);
  }, [selectedTemplate, layers, redrawCanvas]);

  // ポインター位置取得
  const getPointerPosition = useCallback((e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  // キャンバスイベントハンドラ
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // ピンチ操作中は描画しない
    if (isPinchingRef.current) return;
    
    const point = getPointerPosition(e);
    const ctx = contextRef.current;

    if (tool === 'stamp') {
      if (selectedStamp) {
        const newStamp: PlacedStamp = {
          id: `stamp-${Date.now()}`,
          stampId: selectedStamp.id,
          x: point.x,
          y: point.y,
          scale: stampScale,
        };
        setPlacedStamps(prev => [...prev, newStamp]);
        return;
      }
      if (selectedCustomEmoji) {
        const newStamp: PlacedStamp = {
          id: `emoji-${Date.now()}`,
          stampId: selectedCustomEmoji.shortcode,
          x: point.x,
          y: point.y,
          scale: stampScale,
          isCustomEmoji: true,
          customEmojiUrl: selectedCustomEmoji.url,
        };
        setPlacedStamps(prev => [...prev, newStamp]);
        return;
      }
    }

    if (!ctx) return;

    setIsDrawing(true);
    lastPointRef.current = point;
    currentStrokeRef.current = [point];

    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }, [getPointerPosition, tool, selectedStamp, selectedCustomEmoji, stampScale, strokes, redrawCanvas]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // ピンチ操作中は描画しない
    if (isPinchingRef.current) return;
    
    const ctx = contextRef.current;
    if (!isDrawing || !ctx || !lastPointRef.current || tool === 'stamp') return;

    const point = getPointerPosition(e);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;

    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);

    lastPointRef.current = point;
    currentStrokeRef.current.push(point);
  }, [isDrawing, lineWidth, color, tool, getPointerPosition]);

  const handlePointerUp = useCallback(() => {
    const ctx = contextRef.current;
    if (tool === 'stamp') return;
    
    if (isDrawing && currentStrokeRef.current.length > 1) {
      const newStroke: Stroke = {
        points: [...currentStrokeRef.current],
        color: tool === 'eraser' ? '#ffffff' : color,
        lineWidth,
      };
      setStrokes(prev => [...prev, newStroke]);
    }
    setIsDrawing(false);
    lastPointRef.current = null;
    currentStrokeRef.current = [];
    if (ctx) {
      ctx.beginPath();
    }
  }, [isDrawing, color, lineWidth, tool]);

  // キャンバスクリア
  const clearCanvas = useCallback(() => {
    // すべてのレイヤーをクリア
    setLayers(prev => prev.map(layer => ({
      ...layer,
      strokes: [],
      placedStamps: [],
      textBoxes: [],
    })));
    // ローカルストレージもクリア
    clearCanvasState();
  }, []);

  // Undo - 履歴から前の状態を復元
  const undo = useCallback(() => {
    const currentIndex = historyIndexRef.current;
    console.log('[undo] called, currentIndex:', currentIndex, 'history.length:', history.length);
    
    // 戻れる履歴がない場合は何もしない
    if (currentIndex <= 0 || history.length === 0) {
      console.log('[undo] early return - no history to undo');
      return;
    }
    
    // Undo操作中フラグを立てる（useEffectで履歴に追加されないように）
    isUndoRedoRef.current = true;
    
    // 1つ前の状態に戻る
    const newIndex = currentIndex - 1;
    const snapshot = history[newIndex];
    setLayers(deepCopyLayers(snapshot.layers));
    setPixelLayers(deepCopyPixelLayers(snapshot.pixelLayers));
    setHistoryIndex(newIndex);
    historyIndexRef.current = newIndex;
    console.log('[undo] restored to history[', newIndex, ']');
    // 再描画はlayersのuseEffectでトリガーされる
  }, [history, deepCopyLayers, deepCopyPixelLayers]);

  // Redo - 履歴から次の状態を復元
  const redo = useCallback(() => {
    const currentIndex = historyIndexRef.current;
    const nextIndex = currentIndex + 1;
    console.log('[redo] called, currentIndex:', currentIndex, 'nextIndex:', nextIndex, 'history.length:', history.length);
    
    if (nextIndex >= history.length) {
      console.log('[redo] early return - no history to redo');
      return;
    }
    
    // Redo操作中フラグを立てる（useEffectで履歴に追加されないように）
    isUndoRedoRef.current = true;
    
    const snapshot = history[nextIndex];
    setLayers(deepCopyLayers(snapshot.layers));
    setPixelLayers(deepCopyPixelLayers(snapshot.pixelLayers));
    setHistoryIndex(nextIndex);
    historyIndexRef.current = nextIndex;
    console.log('[redo] restored to history[', nextIndex, ']');
    // 再描画はlayersのuseEffectでトリガーされる
  }, [history, deepCopyLayers, deepCopyPixelLayers]);

  // キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z or Cmd+Z for Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Ctrl+Shift+Z or Cmd+Shift+Z or Ctrl+Y or Cmd+Y for Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // デバッグ用: 履歴をwindowに公開
  useEffect(() => {
    (window as unknown as { __undoHistory: { history: HistorySnapshot[], historyIndex: number, historyIndexRef: number } }).__undoHistory = {
      history,
      historyIndex,
      historyIndexRef: historyIndexRef.current,
    };
  }, [history, historyIndex]);

  // 状態が変わったらローカルストレージに保存
  useEffect(() => {
    // 初回レンダリング時は保存しない（復元したデータを上書きしないため）
    const hasContent = layers.some(layer => 
      layer.strokes.length > 0 || 
      layer.placedStamps.length > 0 || 
      layer.textBoxes.some(tb => tb.text.length > 0)
    );
    if (hasContent) {
      saveCanvasState({
        layers,
        activeLayerId,
        templateId: selectedTemplate.id,
      });
    }
  }, [layers, activeLayerId, selectedTemplate.id]);

  // Undo/Redo可能かどうか
  const canUndo = historyIndex >= 0;
  const canRedo = historyIndex < history.length - 1;

  // テキストボックスのテキスト更新
  const setMessage = useCallback((text: string) => {
    if (!selectedTextBoxId) return;
    setTextBoxes(prev => prev.map(tb =>
      tb.id === selectedTextBoxId ? { ...tb, text } : tb
    ));
  }, [selectedTextBoxId]);

  // テキストボックスのスタイル更新（後方互換性用）
  const setMessageBox = useCallback((box: TextBox) => {
    if (!selectedTextBoxId) return;
    setTextBoxes(prev => prev.map(tb =>
      tb.id === selectedTextBoxId ? { ...box, id: tb.id } : tb
    ));
  }, [selectedTextBoxId]);

  // テキストボックスの追加
  const addTextBox = useCallback(() => {
    // キャンバス内に収まるようにy座標を計算
    const baseY = 20 + textBoxes.length * 60;
    const maxY = height - 50; // テキストボックスの高さ分を引く
    const newBox = createTextBox({
      y: Math.min(baseY, maxY),
    });
    setTextBoxes(prev => [...prev, newBox]);
    setSelectedTextBoxId(newBox.id);
  }, [createTextBox, textBoxes.length, height]);

  // テキストボックスの削除
  const removeTextBox = useCallback((id: string) => {
    setTextBoxes(prev => {
      const filtered = prev.filter(tb => tb.id !== id);
      // 最低1つは残す
      if (filtered.length === 0) return prev;
      return filtered;
    });
    if (selectedTextBoxId === id) {
      setSelectedTextBoxId(textBoxes.find(tb => tb.id !== id)?.id || null);
    }
  }, [selectedTextBoxId, textBoxes]);

  // テキストボックスの選択
  const selectTextBox = useCallback((id: string | null) => {
    setSelectedTextBoxId(id);
  }, []);

  // スタンプの選択
  const selectPlacedStamp = useCallback((id: string | null) => {
    setSelectedPlacedStampId(id);
    // スタンプ選択時は新規配置モードを解除
    if (id) {
      setSelectedStamp(null);
      setSelectedCustomEmoji(null);
    }
  }, []);

  // スタンプの削除
  const removePlacedStamp = useCallback((id: string) => {
    setPlacedStamps(prev => prev.filter(s => s.id !== id));
    if (selectedPlacedStampId === id) {
      setSelectedPlacedStampId(null);
    }
  }, [selectedPlacedStampId, setPlacedStamps]);

  // スタンプのドラッグ開始
  const handleStampPointerDown = useCallback((e: React.PointerEvent | React.MouseEvent | React.TouchEvent, id: string, mode: 'move' | 'resize' = 'move') => {
    e.stopPropagation();
    e.preventDefault();
    
    setSelectedPlacedStampId(id);
    setSelectedStamp(null);
    setSelectedCustomEmoji(null);
    setStampDragMode(mode);
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setStampDragStart({ x: clientX, y: clientY });
    
    const stamp = placedStamps.find(s => s.id === id);
    if (stamp) setStampDragOriginal({ ...stamp });
  }, [placedStamps]);

  // スタンプのドラッグ移動
  const handleStampPointerMove = useCallback((e: React.PointerEvent | React.MouseEvent | React.TouchEvent) => {
    if (!stampDragStart || !stampDragOriginal || !selectedPlacedStampId || !stampDragMode) return;
    
    // スマホでのスクロールを防止
    e.preventDefault();
    e.stopPropagation();
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    // オーバーレイのサイズとキャンバスの論理サイズの比率を計算
    const overlay = overlayRef.current;
    if (!overlay) return;
    
    const scaleX = width / overlay.clientWidth;
    const scaleY = height / overlay.clientHeight;
    
    const dx = (clientX - stampDragStart.x) * scaleX;
    const dy = (clientY - stampDragStart.y) * scaleY;
    
    if (stampDragMode === 'move') {
      const newX = Math.max(20, Math.min(width - 20, stampDragOriginal.x + dx));
      const newY = Math.max(20, Math.min(height - 20, stampDragOriginal.y + dy));
      
      setPlacedStamps(prev => prev.map(s =>
        s.id === selectedPlacedStampId ? { ...s, x: newX, y: newY } : s
      ));
    } else if (stampDragMode === 'resize') {
      // リサイズ：ドラッグ距離に応じてスケールを変更
      const distance = Math.sqrt(dx * dx + dy * dy);
      const direction = dx + dy > 0 ? 1 : -1;
      const scaleDelta = (distance / 30) * direction;
      const newScale = Math.max(0.2, Math.min(10, stampDragOriginal.scale + scaleDelta));
      
      setPlacedStamps(prev => prev.map(s =>
        s.id === selectedPlacedStampId ? { ...s, scale: newScale } : s
      ));
    }
  }, [stampDragStart, stampDragOriginal, selectedPlacedStampId, stampDragMode, width, height]);

  // スタンプのドラッグ終了
  const handleStampPointerUp = useCallback(() => {
    setStampDragStart(null);
    setStampDragOriginal(null);
    setStampDragMode(null);
    // スタンプはオーバーレイ表示なのでキャンバス再描画は不要
  }, []);

  // オーバーレイクリックで新規スタンプを配置
  const placeStampAtPosition = useCallback((clientX: number, clientY: number) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    
    const rect = overlay.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    
    if (selectedStamp) {
      const newStamp: PlacedStamp = {
        id: `stamp-${Date.now()}`,
        stampId: selectedStamp.id,
        x,
        y,
        scale: stampScale,
      };
      setPlacedStamps(prev => [...prev, newStamp]);
    } else if (selectedCustomEmoji) {
      const newStamp: PlacedStamp = {
        id: `emoji-${Date.now()}`,
        stampId: selectedCustomEmoji.shortcode,
        x,
        y,
        scale: stampScale,
        isCustomEmoji: true,
        customEmojiUrl: selectedCustomEmoji.url,
      };
      setPlacedStamps(prev => [...prev, newStamp]);
    }
  }, [width, height, selectedStamp, selectedCustomEmoji, stampScale, setPlacedStamps]);

  // ストロークをSVGのpath文字列に変換
  const pointsToPath = useCallback((points: Point[]): string => {
    if (points.length < 2) return '';
    
    const path = [`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`];
    for (let i = 1; i < points.length; i++) {
      path.push(`L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`);
    }
    return path.join(' ');
  }, []);

  // SVGを生成
  // レイヤー内のストロークをSVG pathに変換
  const strokesToSvg = useCallback((layerStrokes: Stroke[]): string => {
    return layerStrokes.map((stroke) => {
      const d = pointsToPath(stroke.points);
      return `<path d="${d}" stroke="${stroke.color}" stroke-width="${stroke.lineWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    }).join('\n    ');
  }, [pointsToPath]);

  // レイヤー内のスタンプをSVGに変換
  const stampsToSvg = useCallback((layerStamps: PlacedStamp[]): string => {
    return layerStamps.map((placed) => {
      if (placed.isCustomEmoji && placed.customEmojiUrl) {
        const defaultSize = 50;
        const w = defaultSize * placed.scale;
        const h = defaultSize * placed.scale;
        const x = placed.x - w/2;
        const y = placed.y - h/2;
        return `<image href="${placed.customEmojiUrl}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`;
      } else {
        const stamp = STAMPS.find(s => s.id === placed.stampId);
        if (!stamp) return '';
        const w = stamp.width * placed.scale;
        const h = stamp.height * placed.scale;
        const x = placed.x - w/2;
        const y = placed.y - h/2;
        return `<g transform="translate(${x.toFixed(2)}, ${y.toFixed(2)}) scale(${placed.scale})">${stamp.svg}</g>`;
      }
    }).join('\n    ');
  }, []);

  // レイヤー内のテキストボックスをSVGに変換
  const textBoxesToSvg = useCallback((layerTextBoxes: TextBox[]): string => {
    return layerTextBoxes
      .filter(tb => tb.text.trim())
      .map(tb => {
        const lines = tb.text.split('\n');
        const lineHeight = tb.fontSize * 1.3;
        const textLines = lines.map((line, i) => {
          const y = tb.y + tb.fontSize + (i * lineHeight);
          const escapedLine = line
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
          return `<tspan x="${tb.x + 5}" y="${y.toFixed(2)}">${escapedLine}</tspan>`;
        }).join('');
        
        const fontFamilyForSvg = tb.fontFamily.split(',')[0].replace(/"/g, '').trim();
        return `<text font-family="${fontFamilyForSvg}, sans-serif" font-size="${tb.fontSize}" fill="${tb.color}">${textLines}</text>`;
      })
      .join('\n    ');
  }, []);

  // SVGを生成（レイヤー対応）
  // レイヤー要素をSVGに変換（共通処理）
  const layersToSvgElements = useCallback((): string => {
    return layers
      .filter(layer => layer.visible)
      .map(layer => {
        const pathElements = strokesToSvg(layer.strokes);
        const stampElements = stampsToSvg(layer.placedStamps);
        const textElements = textBoxesToSvg(layer.textBoxes);
        
        const hasContent = pathElements || stampElements || textElements;
        if (!hasContent) return '';
        
        const opacityAttr = layer.opacity < 1 ? ` opacity="${layer.opacity.toFixed(2)}"` : '';
        
        return `<g data-layer="${layer.id}"${opacityAttr}>
    ${pathElements}
    ${stampElements}
    ${textElements}
  </g>`;
      })
      .filter(Boolean)
      .join('\n  ');
  }, [layers, strokesToSvg, stampsToSvg, textBoxesToSvg]);

  // ピクセルレイヤーをSVG要素に変換
  const pixelLayersToSvgElements = useCallback((): string => {
    return pixelLayers
      .filter(layer => layer.visible)
      .map(layer => {
        const pixelSvg = pixelLayerToSvg(layer, width, height);
        if (!pixelSvg) return '';
        return `<g data-pixel-layer="${layer.id}">${pixelSvg}</g>`;
      })
      .filter(Boolean)
      .join('\n  ');
  }, [pixelLayers, width, height]);

  // 完全なSVGを生成（テンプレート含む）- プレビュー用
  const generateSvg = useCallback((): string => {
    const layerElements = layersToSvgElements();
    
    // テンプレートのviewBoxを解析
    const viewBox = selectedTemplate.viewBox || '0 0 400 300';
    const [, , vbWidth, vbHeight] = viewBox.split(/\s+/).map(Number);
    const templateWidth = vbWidth || 400;
    const templateHeight = vbHeight || 300;
    
    // 描き足し元の場合はそのまま使用（元のviewBoxを保持）
    const isExtendBase = selectedTemplate.id === 'extend-base';
    
    if (isExtendBase) {
      // 描き足し元：元のviewBoxサイズでピクセルレイヤーを生成
      const pixelElements = pixelLayers
        .filter(layer => layer.visible)
        .map(layer => {
          const pixelSvg = pixelLayerToSvg(layer, templateWidth, templateHeight);
          if (!pixelSvg) return '';
          return `<g data-pixel-layer="${layer.id}">${pixelSvg}</g>`;
        })
        .filter(Boolean)
        .join('\n  ');
      
      const bgRect = backgroundColor && backgroundColor !== 'transparent'
        ? `<rect width="${templateWidth}" height="${templateHeight}" fill="${backgroundColor}"/>`
        : '';
      
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">
  ${bgRect}
  ${selectedTemplate.svg}
  ${pixelElements}
  ${layerElements}
</svg>`;
    }
    
    // ストロークがあるかどうかチェック
    const hasStrokes = layers.some(layer => layer.visible && layer.strokes.length > 0);
    const hasStamps = layers.some(layer => layer.visible && layer.placedStamps.length > 0);
    const hasTextBoxes = layers.some(layer => layer.visible && layer.textBoxes.length > 0);
    const hasNonPixelContent = hasStrokes || hasStamps || hasTextBoxes;
    
    // ドット絵だけの場合はテンプレートのviewBoxを使用
    // ストローク等がある場合は800x600座標系を維持（座標ずれを防ぐ）
    const useTemplateViewBox = !hasNonPixelContent;
    const outputWidth = useTemplateViewBox ? templateWidth : width;
    const outputHeight = useTemplateViewBox ? templateHeight : height;
    const outputViewBox = useTemplateViewBox ? viewBox : `0 0 ${width} ${height}`;
    
    // ピクセルレイヤーを出力サイズに合わせて生成
    const pixelElements = pixelLayers
      .filter(layer => layer.visible)
      .map(layer => {
        const pixelSvg = pixelLayerToSvg(layer, outputWidth, outputHeight);
        if (!pixelSvg) return '';
        return `<g data-pixel-layer="${layer.id}">${pixelSvg}</g>`;
      })
      .filter(Boolean)
      .join('\n  ');
    
    // 背景色を最初に配置
    const bgRect = backgroundColor && backgroundColor !== 'transparent'
      ? `<rect width="${outputWidth}" height="${outputHeight}" fill="${backgroundColor}"/>`
      : '';
    
    // ストロークがある場合はスケーリングして配置
    let templateContent = selectedTemplate.svg;
    if (hasNonPixelContent && (templateWidth !== width || templateHeight !== height)) {
      const scaleX = width / templateWidth;
      const scaleY = height / templateHeight;
      const scale = Math.min(scaleX, scaleY);
      const scaledWidth = templateWidth * scale;
      const scaledHeight = templateHeight * scale;
      const offsetX = (width - scaledWidth) / 2;
      const offsetY = (height - scaledHeight) / 2;
      templateContent = `<g transform="translate(${offsetX}, ${offsetY}) scale(${scale})">${selectedTemplate.svg}</g>`;
    }
    
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${outputViewBox}">
  ${bgRect}
  ${templateContent}
  ${pixelElements}
  ${layerElements}
</svg>`;
  }, [layersToSvgElements, pixelLayersToSvgElements, pixelLayers, layers, width, height, selectedTemplate, backgroundColor]);

  // 差分SVGを生成（テンプレートを含まない）- 描き足し保存用
  const generateDiffSvg = useCallback((): string => {
    const layerElements = layersToSvgElements();
    
    // 描き足し元の場合は元のviewBoxサイズでピクセルレイヤーを生成
    const isExtendBase = selectedTemplate.id === 'extend-base';
    const viewBox = selectedTemplate.viewBox || '0 0 400 300';
    const [, , vbWidth, vbHeight] = viewBox.split(/\s+/).map(Number);
    const targetWidth = isExtendBase ? (vbWidth || 400) : width;
    const targetHeight = isExtendBase ? (vbHeight || 300) : height;
    
    const pixelElements = pixelLayers
      .filter(layer => layer.visible)
      .map(layer => {
        const pixelSvg = pixelLayerToSvg(layer, targetWidth, targetHeight);
        if (!pixelSvg) return '';
        return `<g data-pixel-layer="${layer.id}">${pixelSvg}</g>`;
      })
      .filter(Boolean)
      .join('\n  ');
    
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${targetWidth} ${targetHeight}">
  ${pixelElements}
  ${layerElements}
</svg>`;
  }, [layersToSvgElements, pixelLayers, selectedTemplate, width, height]);

  // テキストボックスのドラッグハンドラ（マウス・タッチ両対応）
  const handleTextBoxPointerDown = useCallback((e: React.PointerEvent | React.MouseEvent | React.TouchEvent, id: string, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedTextBoxId(id);
    setDragMode(mode);
    
    // タッチとマウス両方に対応
    let clientX: number, clientY: number;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return;
    }
    
    setDragStart({ x: clientX, y: clientY });
    const tb = textBoxes.find(t => t.id === id);
    if (tb) setTextBoxStart({ ...tb });
  }, [textBoxes]);

  const handleOverlayPointerMove = useCallback((e: React.PointerEvent | React.MouseEvent | React.TouchEvent) => {
    if (dragMode === 'none' || !dragStart || !textBoxStart || !selectedTextBoxId) return;

    // スマホでのスクロールを防止
    e.preventDefault();
    e.stopPropagation();

    const overlay = overlayRef.current;
    if (!overlay) return;

    // タッチとマウス両方に対応
    let clientX: number, clientY: number;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return;
    }

    const rect = overlay.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;

    const dx = (clientX - dragStart.x) * scaleX;
    const dy = (clientY - dragStart.y) * scaleY;

    const updateBox = (updates: Partial<TextBox>) => {
      setTextBoxes(prev => prev.map(tb =>
        tb.id === selectedTextBoxId ? { ...tb, ...updates } : tb
      ));
    };

    if (dragMode === 'move') {
      const newX = Math.max(0, Math.min(width - textBoxStart.width, textBoxStart.x + dx));
      const newY = Math.max(0, Math.min(height - textBoxStart.height, textBoxStart.y + dy));
      updateBox({ x: newX, y: newY });
    } else if (dragMode === 'resize-se') {
      const newW = Math.max(80, Math.min(width - textBoxStart.x, textBoxStart.width + dx));
      const newH = Math.max(30, Math.min(height - textBoxStart.y, textBoxStart.height + dy));
      updateBox({ width: newW, height: newH });
    } else if (dragMode === 'resize-sw') {
      const newW = Math.max(80, textBoxStart.width - dx);
      const newX = Math.max(0, textBoxStart.x + textBoxStart.width - newW);
      const newH = Math.max(30, Math.min(height - textBoxStart.y, textBoxStart.height + dy));
      updateBox({ x: newX, width: newW, height: newH });
    } else if (dragMode === 'resize-ne') {
      const newW = Math.max(80, Math.min(width - textBoxStart.x, textBoxStart.width + dx));
      const newH = Math.max(30, textBoxStart.height - dy);
      const newY = Math.max(0, textBoxStart.y + textBoxStart.height - newH);
      updateBox({ y: newY, width: newW, height: newH });
    } else if (dragMode === 'resize-nw') {
      const newW = Math.max(80, textBoxStart.width - dx);
      const newH = Math.max(30, textBoxStart.height - dy);
      const newX = Math.max(0, textBoxStart.x + textBoxStart.width - newW);
      const newY = Math.max(0, textBoxStart.y + textBoxStart.height - newH);
      updateBox({ x: newX, y: newY, width: newW, height: newH });
    }
  }, [dragMode, dragStart, textBoxStart, selectedTextBoxId, width, height]);

  const handleOverlayPointerUp = useCallback(() => {
    setDragMode('none');
    setDragStart(null);
    setTextBoxStart(null);
  }, []);

  // 後方互換性のためのエイリアス
  const handleTextBoxMouseDown = handleTextBoxPointerDown;
  const handleOverlayMouseMove = handleOverlayPointerMove;
  const handleOverlayMouseUp = handleOverlayPointerUp;

  // ツール変更時のリセット
  const selectTool = useCallback((newTool: ToolType) => {
    setTool(newTool);
    if (newTool !== 'stamp') {
      setSelectedStamp(null);
    }
  }, []);

  // ピンチズーム・パンハンドラー
  const handlePinchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      
      // ピンチ開始: 描画を中止
      isPinchingRef.current = true;
      if (isDrawing) {
        setIsDrawing(false);
        // 現在のストロークをキャンセル
        currentStrokeRef.current = [];
        lastPointRef.current = null;
      }
      
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      
      // ピンチ用の距離
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      pinchStartDistanceRef.current = distance;
      pinchStartZoomRef.current = zoomLevel;
      
      // パン用の中心点
      const centerX = (touch1.clientX + touch2.clientX) / 2;
      const centerY = (touch1.clientY + touch2.clientY) / 2;
      pinchStartCenterRef.current = { x: centerX, y: centerY };
      panStartOffsetRef.current = { ...panOffset };
    }
  }, [zoomLevel, panOffset]);

  const handlePinchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDistanceRef.current !== null && pinchStartCenterRef.current !== null) {
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      
      // ズーム計算
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      const scale = distance / pinchStartDistanceRef.current;
      const newZoom = Math.max(0.5, Math.min(3, pinchStartZoomRef.current * scale));
      setZoomLevel(newZoom);
      
      // パン計算（ズーム中のみ有効）
      if (pinchStartZoomRef.current > 1 || newZoom > 1) {
        const centerX = (touch1.clientX + touch2.clientX) / 2;
        const centerY = (touch1.clientY + touch2.clientY) / 2;
        const dx = centerX - pinchStartCenterRef.current.x;
        const dy = centerY - pinchStartCenterRef.current.y;
        setPanOffset({
          x: panStartOffsetRef.current.x + dx,
          y: panStartOffsetRef.current.y + dy,
        });
      }
    }
  }, []);

  const handlePinchEnd = useCallback(() => {
    pinchStartDistanceRef.current = null;
    pinchStartCenterRef.current = null;
    // 少し遅延してフラグを解除（誤タップ防止）
    setTimeout(() => {
      isPinchingRef.current = false;
    }, 100);
  }, []);

  const resetZoom = useCallback(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  // ピクセルレイヤー操作
  const addPixelLayer = useCallback((name?: string, overrideGridSize?: GridSize) => {
    const id = `pixel-${Date.now()}`;
    const sizeToUse = overrideGridSize ?? gridSize;
    const newLayer = createDefaultPixelLayer(id, name || `ドット絵 ${pixelLayers.length + 1}`, sizeToUse);
    setPixelLayers(prev => [...prev, newLayer]);
    setActivePixelLayerId(id);
    setGridMode(true);
    return id;
  }, [pixelLayers.length, gridSize]);

  const removePixelLayer = useCallback((layerId: string) => {
    setPixelLayers(prev => prev.filter(l => l.id !== layerId));
    if (activePixelLayerId === layerId) {
      setActivePixelLayerId(pixelLayers.length > 1 ? pixelLayers[0]?.id || null : null);
    }
  }, [activePixelLayerId, pixelLayers]);

  const selectPixelLayer = useCallback((layerId: string | null) => {
    setActivePixelLayerId(layerId);
    if (layerId) {
      setGridMode(true);
    }
  }, []);

  // ピクセル描画（ドラッグ中に呼び出される）
  const paintingPixelsRef = useRef<Set<string>>(new Set()); // "x,y" 形式で重複防止

  const paintPixel = useCallback((gridX: number, gridY: number) => {
    if (!activePixelLayer) return;

    // 範囲外チェック（アクティブレイヤーのgridSizeを使用）
    const layerGridSize = activePixelLayer.gridSize;
    if (gridX < 0 || gridX >= layerGridSize || gridY < 0 || gridY >= layerGridSize) return;

    // 同一ドラッグ中の重複防止
    const key = `${gridX},${gridY}`;
    if (paintingPixelsRef.current.has(key)) return;
    paintingPixelsRef.current.add(key);

    setPixelLayers(prev => prev.map(layer => {
      if (layer.id !== activePixelLayerId) return layer;

      const newPixels = new Uint8Array(layer.pixels);
      const index = gridY * layer.gridSize + gridX;

      if (tool === 'pixelEraser') {
        // 消しゴム：透明（0）にする
        newPixels[index] = 0;
      } else {
        // ペン：色を追加
        const palette = [...layer.palette];
        const colorIndex = getOrAddPaletteIndex(palette, color);
        newPixels[index] = colorIndex;
        return { ...layer, pixels: newPixels, palette };
      }

      return { ...layer, pixels: newPixels };
    }));
  }, [activePixelLayer, activePixelLayerId, gridSize, tool, color]);

  // ドラッグ開始時の履歴保存用
  const pixelLayerBeforeDragRef = useRef<PixelLayer | null>(null);

  const startPixelPainting = useCallback(() => {
    paintingPixelsRef.current.clear();
    // 履歴用にドラッグ前の状態を保存
    if (activePixelLayer) {
      pixelLayerBeforeDragRef.current = {
        ...activePixelLayer,
        pixels: new Uint8Array(activePixelLayer.pixels),
        palette: [...activePixelLayer.palette],
      };
    }
  }, [activePixelLayer]);

  const endPixelPainting = useCallback(() => {
    paintingPixelsRef.current.clear();
    // ピクセル描画の履歴を保存
    if (pixelLayerBeforeDragRef.current) {
      // 現在の状態を履歴に追加（layers は現在の状態、pixelLayers も現在の状態）
      addToHistory(layers, pixelLayers);
    }
    pixelLayerBeforeDragRef.current = null;
  }, [layers, pixelLayers, addToHistory]);

  // 塗りつぶし（Flood fill）
  const fillPixels = useCallback((startX: number, startY: number) => {
    if (!activePixelLayer) return;

    // 範囲外チェック（アクティブレイヤーのgridSizeを使用）
    const layerGridSize = activePixelLayer.gridSize;
    if (startX < 0 || startX >= layerGridSize || startY < 0 || startY >= layerGridSize) return;

    // 新しいpixelLayersを計算
    const newPixelLayers = pixelLayers.map(layer => {
      if (layer.id !== activePixelLayerId) return layer;

      const newPixels = new Uint8Array(layer.pixels);
      const palette = [...layer.palette];
      const newColorIndex = getOrAddPaletteIndex(palette, color);
      const targetColorIndex = layer.pixels[startY * layer.gridSize + startX];

      // 同じ色なら何もしない
      if (targetColorIndex === newColorIndex) return layer;

      // Flood fill (BFS)
      const queue: [number, number][] = [[startX, startY]];
      const visited = new Set<string>();
      visited.add(`${startX},${startY}`);

      while (queue.length > 0) {
        const [x, y] = queue.shift()!;
        const index = y * layer.gridSize + x;

        if (newPixels[index] !== targetColorIndex) continue;

        newPixels[index] = newColorIndex;

        // 4方向を探索
        const neighbors: [number, number][] = [
          [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]
        ];

        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= layer.gridSize || ny < 0 || ny >= layer.gridSize) continue;
          const nKey = `${nx},${ny}`;
          if (visited.has(nKey)) continue;
          visited.add(nKey);
          queue.push([nx, ny]);
        }
      }

      return { ...layer, pixels: newPixels, palette };
    });

    // pixelLayersを更新して履歴に追加
    setPixelLayers(newPixelLayers);
    addToHistory(layers, newPixelLayers);
  }, [activePixelLayer, activePixelLayerId, pixelLayers, gridSize, color, layers, addToHistory]);

  // グリッドモードの切り替え
  const toggleGridMode = useCallback(() => {
    setGridMode(prev => {
      if (!prev && pixelLayers.length === 0) {
        // グリッドモードをONにする際、ピクセルレイヤーがなければ作成
        addPixelLayer();
      }
      return !prev;
    });
  }, [pixelLayers.length, addPixelLayer]);

  // グリッドサイズの変更
  const changeGridSize = useCallback((newSize: GridSize, resize: boolean = false) => {
    setGridSize(newSize);
    
    // アクティブなピクセルレイヤーがある場合
    if (activePixelLayerId) {
      setPixelLayers(prev => prev.map(layer => {
        if (layer.id !== activePixelLayerId) return layer;
        
        const oldSize = layer.gridSize;
        if (oldSize === newSize) return layer;
        
        if (resize) {
          // リサンプリングしてサイズ変更
          const newPixels = new Uint8Array(newSize * newSize);
          
          for (let newY = 0; newY < newSize; newY++) {
            for (let newX = 0; newX < newSize; newX++) {
              const oldX = Math.floor((newX / newSize) * oldSize);
              const oldY = Math.floor((newY / newSize) * oldSize);
              const oldIndex = oldY * oldSize + oldX;
              const newIndex = newY * newSize + newX;
              newPixels[newIndex] = layer.pixels[oldIndex];
            }
          }
          
          return {
            ...layer,
            gridSize: newSize,
            pixels: newPixels,
          };
        } else {
          // ピクセルデータをクリアして新しいサイズに変更
          return {
            ...layer,
            gridSize: newSize,
            pixels: new Uint8Array(newSize * newSize),
            palette: [],
          };
        }
      }));
    }
  }, [activePixelLayerId]);

  return {
    // refs
    canvasRef,
    overlayRef,
    
    // キャンバス状態
    tool,
    color,
    lineWidth,
    strokes,
    
    // テンプレート・スタンプ・背景
    selectedTemplate,
    backgroundColor,
    selectedStamp,
    selectedCustomEmoji,
    placedStamps,
    selectedPlacedStampId,
    stampScale,
    stampTab,
    
    // カスタムカラーパレット
    customColors,
    addCustomColor,
    removeCustomColor,
    // パレット管理
    palettes,
    activePalette,
    activePaletteId,
    switchPalette,
    createPalette,
    deletePalette,
    renamePalette,
    savePaletteToCloud,
    syncPalettesFromCloud,
    syncFavoritePalettes,
    importPalette,
    isSavingPaletteToNostr,
    canSaveToNostr: !!signEvent,
    
    // テキストボックス（複数対応）
    textBoxes,
    selectedTextBoxId,
    selectedTextBox,
    // 後方互換
    message,
    messageBox,
    fontCategory,
    
    // アクション
    setColor,
    setLineWidth,
    selectTool,
    setSelectedTemplate,
    setBackgroundColor,
    setSelectedStamp,
    setSelectedCustomEmoji,
    setStampScale,
    setStampTab,
    setMessage,
    setMessageBox,
    setFontCategory,
    clearCanvas,
    generateSvg,
    generateDiffSvg,
    
    // テキストボックス操作
    addTextBox,
    removeTextBox,
    selectTextBox,
    
    // スタンプ操作
    selectPlacedStamp,
    removePlacedStamp,
    handleStampPointerDown,
    handleStampPointerMove,
    handleStampPointerUp,
    placeStampAtPosition,
    
    // Undo/Redo
    undo,
    redo,
    canUndo,
    canRedo,
    
    // イベントハンドラ
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleTextBoxPointerDown,
    handleTextBoxMouseDown,
    handleOverlayPointerMove,
    handleOverlayMouseMove,
    handleOverlayPointerUp,
    handleOverlayMouseUp,
    
    // ピンチズーム・パン
    zoomLevel,
    panOffset,
    handlePinchStart,
    handlePinchMove,
    handlePinchEnd,
    resetZoom,
    
    // レイヤー機能
    layers,
    activeLayerId,
    activeLayer,
    allPlacedStamps,
    addLayer,
    removeLayer,
    selectLayer,
    toggleLayerVisibility,
    toggleLayerLock,
    setLayerOpacity,
    reorderLayers,
    renameLayer,
    
    // ピクセルレイヤー機能
    pixelLayers,
    activePixelLayerId,
    activePixelLayer,
    gridMode,
    gridSize,
    showGrid,
    pixelScale,
    pixelOffset,
    addPixelLayer,
    removePixelLayer,
    selectPixelLayer,
    paintPixel,
    startPixelPainting,
    endPixelPainting,
    fillPixels,
    toggleGridMode,
    changeGridSize,
    setShowGrid,
    
    // キャンバスサイズ（投稿用）
    canvasSize: { width, height },
    
    // 下書き機能
    hasSavedDraft,
    showDraftConfirm,
    useDraft,
    discardDraft,
    clearDraft,
  };
}

