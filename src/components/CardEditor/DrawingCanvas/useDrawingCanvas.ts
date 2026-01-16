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
} from './types';
import { CUSTOM_COLORS_STORAGE_KEY, MAX_CUSTOM_COLORS, MAX_LAYERS, MAX_HISTORY_SIZE, createDefaultLayer } from './types';

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
      return data as CanvasStorageData;
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
}

export function useDrawingCanvas({ width, height, initialMessage: _initialMessage }: UseDrawingCanvasOptions) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#e94560');
  const [lineWidth, setLineWidth] = useState(3);
  const [tool, setTool] = useState<ToolType>('pen');
  const lastPointRef = useRef<Point | null>(null);
  const templateImageRef = useRef<HTMLImageElement | null>(null);
  const currentTemplateUri = useRef<string>('');
  
  // ローカルストレージから初期状態を読み込む
  const savedState = useMemo(() => loadCanvasState(), []);
  
  // レイヤー状態
  const [layers, setLayers] = useState<Layer[]>(() => savedState?.layers || createInitialLayers());
  const [activeLayerId, setActiveLayerId] = useState<string>(() => savedState?.activeLayerId || 'layer-1');
  
  // アクティブレイヤーの取得
  const activeLayer = useMemo(() => layers.find(l => l.id === activeLayerId) || layers[0], [layers, activeLayerId]);
  
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
  const [history, setHistory] = useState<Layer[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // レイヤーの深いコピーを作成
  const deepCopyLayers = useCallback((layersToClone: Layer[]): Layer[] => {
    return layersToClone.map(layer => ({
      ...layer,
      strokes: layer.strokes.map(s => ({ ...s, points: [...s.points] })),
      placedStamps: layer.placedStamps.map(p => ({ ...p })),
      textBoxes: layer.textBoxes.map(t => ({ ...t })),
    }));
  }, []);
  
  // 履歴に現在の状態を保存
  const saveToHistory = useCallback((currentLayers: Layer[]) => {
    const snapshot = deepCopyLayers(currentLayers);
    setHistory(prev => {
      // 現在位置より後の履歴を削除して新しい状態を追加
      const newHistory = [...prev.slice(0, historyIndex + 1), snapshot];
      // 最大サイズを超えたら古い履歴を削除
      if (newHistory.length > MAX_HISTORY_SIZE) {
        return newHistory.slice(newHistory.length - MAX_HISTORY_SIZE);
      }
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY_SIZE - 1));
  }, [deepCopyLayers, historyIndex]);
  
  // レイヤー操作関数
  const addLayer = useCallback(() => {
    if (layers.length >= MAX_LAYERS) return;
    // 履歴に保存
    saveToHistory(layers);
    const newId = `layer-${Date.now()}`;
    const newLayer = createDefaultLayer(newId, `レイヤー ${layers.length + 1}`);
    setLayers(prev => [...prev, newLayer]);
    setActiveLayerId(newId);
  }, [layers, saveToHistory]);

  const removeLayer = useCallback((layerId: string) => {
    if (layers.length <= 1) return; // 最低1レイヤーは必要
    // 履歴に保存
    saveToHistory(layers);
    setLayers(prev => prev.filter(l => l.id !== layerId));
    if (activeLayerId === layerId) {
      const remaining = layers.filter(l => l.id !== layerId);
      setActiveLayerId(remaining[0]?.id || '');
    }
  }, [layers, activeLayerId, saveToHistory]);

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
    // 履歴に保存
    saveToHistory(layers);
    setLayers(prev => {
      const result = [...prev];
      const [removed] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, removed);
      return result;
    });
  }, [layers, saveToHistory]);

  const renameLayer = useCallback((layerId: string, newName: string) => {
    setLayers(prev => prev.map(layer =>
      layer.id === layerId ? { ...layer, name: newName } : layer
    ));
  }, []);
  
  // テンプレートとスタンプ
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(() => {
    if (savedState?.templateId) {
      const found = TEMPLATES.find(t => t.id === savedState.templateId);
      if (found) return found;
    }
    return TEMPLATES[0];
  });
  const [selectedStamp, setSelectedStamp] = useState<Stamp | null>(null);
  const [selectedCustomEmoji, setSelectedCustomEmoji] = useState<CustomEmoji | null>(null);
  const [selectedPlacedStampId, setSelectedPlacedStampId] = useState<string | null>(null);
  const [stampScale, setStampScale] = useState(1);
  const [stampTab, setStampTab] = useState<StampTab>('builtin');
  const [stampDragStart, setStampDragStart] = useState<Point | null>(null);

  // カスタムカラーパレット
  const [customColors, setCustomColors] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_COLORS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // カスタムカラーを保存
  const addCustomColor = useCallback((newColor: string) => {
    setCustomColors(prev => {
      // 既に存在する場合は先頭に移動
      const filtered = prev.filter(c => c.toLowerCase() !== newColor.toLowerCase());
      const updated = [newColor, ...filtered].slice(0, MAX_CUSTOM_COLORS);
      try {
        localStorage.setItem(CUSTOM_COLORS_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // ストレージエラーを無視
      }
      return updated;
    });
  }, []);

  // カスタムカラーを削除
  const removeCustomColor = useCallback((colorToRemove: string) => {
    setCustomColors(prev => {
      const updated = prev.filter(c => c.toLowerCase() !== colorToRemove.toLowerCase());
      try {
        localStorage.setItem(CUSTOM_COLORS_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // ストレージエラーを無視
      }
      return updated;
    });
  }, []);
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

  // テンプレートのdata URI
  const templateDataUri = useMemo(() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${selectedTemplate.svg}</svg>`;
    const encoded = btoa(unescape(encodeURIComponent(svg)));
    return `data:image/svg+xml;base64,${encoded}`;
  }, [selectedTemplate, width, height]);

  // キャンバスの初期化と再描画（全レイヤー対応）
  const redrawCanvas = useCallback((layersToRender?: Layer[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    contextRef.current = ctx;

    // 描画対象のレイヤー（引数がない場合は現在のlayers状態を使用）
    const renderLayers = layersToRender || layers;

    const doRedraw = (templateImg: HTMLImageElement) => {
      // 背景をクリア
      ctx.clearRect(0, 0, width, height);
      
      // テンプレートを描画
      ctx.drawImage(templateImg, 0, 0, width, height);
      
      // すべての表示中のレイヤーのストロークを描画（下から上へ）
      renderLayers.forEach(layer => {
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
    };

    // テンプレートが変わった場合のみ画像を再読み込み
    if (currentTemplateUri.current !== templateDataUri || !templateImageRef.current) {
      const img = new Image();
      img.onload = () => {
        templateImageRef.current = img;
        currentTemplateUri.current = templateDataUri;
        doRedraw(img);
      };
      img.src = templateDataUri;
    } else {
      // キャッシュされた画像を使用して同期的に描画
      doRedraw(templateImageRef.current);
    }
  }, [templateDataUri, width, height, layers]);

  // 初期化（テンプレート変更時）
  useEffect(() => {
    redrawCanvas();
  }, [selectedTemplate]); // eslint-disable-line react-hooks/exhaustive-deps

  // レイヤー変更時に再描画
  useEffect(() => {
    redrawCanvas();
  }, [layers]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // ストローク追加前に履歴を保存
      saveToHistory(layers);
      setStrokes(prev => [...prev, newStroke]);
      // 注: ストローク追加時は再描画しない（既に描画済み）
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
    // クリア前に履歴を保存
    saveToHistory(layers);
    
    // すべてのレイヤーをクリア
    setLayers(prev => prev.map(layer => ({
      ...layer,
      strokes: [],
      placedStamps: [],
      textBoxes: [],
    })));
    // ローカルストレージもクリア
    clearCanvasState();
    // 再描画はlayersのuseEffectでトリガーされる
  }, [layers, saveToHistory]);

  // Undo - 履歴から前の状態を復元
  const undo = useCallback(() => {
    if (historyIndex < 0) return;
    
    // 最初のundoの場合、現在の状態を保存してから1つ前に戻る
    if (historyIndex === history.length - 1) {
      // 現在の状態がまだ保存されていない場合は保存
      const currentSnapshot = deepCopyLayers(layers);
      setHistory(prev => {
        if (prev.length === 0 || JSON.stringify(prev[prev.length - 1]) !== JSON.stringify(currentSnapshot)) {
          return [...prev, currentSnapshot];
        }
        return prev;
      });
    }
    
    const newIndex = historyIndex - 1;
    if (newIndex >= 0) {
      const previousState = deepCopyLayers(history[newIndex]);
      setLayers(previousState);
      setHistoryIndex(newIndex);
    }
    // 再描画はlayersのuseEffectでトリガーされる
  }, [historyIndex, history, layers, deepCopyLayers]);

  // Redo - 履歴から次の状態を復元
  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    
    const newIndex = historyIndex + 1;
    const nextState = deepCopyLayers(history[newIndex]);
    setLayers(nextState);
    setHistoryIndex(newIndex);
    // 再描画はlayersのuseEffectでトリガーされる
  }, [historyIndex, history, deepCopyLayers]);

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
    // 履歴に保存
    saveToHistory(layers);
    // キャンバス内に収まるようにy座標を計算
    const baseY = 20 + textBoxes.length * 60;
    const maxY = height - 50; // テキストボックスの高さ分を引く
    const newBox = createTextBox({
      y: Math.min(baseY, maxY),
    });
    setTextBoxes(prev => [...prev, newBox]);
    setSelectedTextBoxId(newBox.id);
  }, [createTextBox, textBoxes.length, height, layers, saveToHistory]);

  // テキストボックスの削除
  const removeTextBox = useCallback((id: string) => {
    // 履歴に保存
    saveToHistory(layers);
    setTextBoxes(prev => {
      const filtered = prev.filter(tb => tb.id !== id);
      // 最低1つは残す
      if (filtered.length === 0) return prev;
      return filtered;
    });
    if (selectedTextBoxId === id) {
      setSelectedTextBoxId(textBoxes.find(tb => tb.id !== id)?.id || null);
    }
  }, [selectedTextBoxId, textBoxes, layers, saveToHistory]);

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
    // 履歴に保存
    saveToHistory(layers);
    setPlacedStamps(prev => prev.filter(s => s.id !== id));
    if (selectedPlacedStampId === id) {
      setSelectedPlacedStampId(null);
    }
    // 再描画はlayersのuseEffectでトリガーされる
  }, [selectedPlacedStampId, setPlacedStamps, layers, saveToHistory]);

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
      // 履歴に保存
      saveToHistory(layers);
      const newStamp: PlacedStamp = {
        id: `stamp-${Date.now()}`,
        stampId: selectedStamp.id,
        x,
        y,
        scale: stampScale,
      };
      setPlacedStamps(prev => [...prev, newStamp]);
    } else if (selectedCustomEmoji) {
      // 履歴に保存
      saveToHistory(layers);
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
    // スタンプはオーバーレイ表示なのでキャンバス再描画は不要
  }, [width, height, selectedStamp, selectedCustomEmoji, stampScale, setPlacedStamps, layers, saveToHistory]);

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
  const generateSvg = useCallback((): string => {
    // 表示中のレイヤーのみをSVGに変換
    const layerElements = layers
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

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  ${selectedTemplate.svg}
  ${layerElements}
</svg>`;
  }, [layers, width, height, selectedTemplate, strokesToSvg, stampsToSvg, textBoxesToSvg]);

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

  return {
    // refs
    canvasRef,
    overlayRef,
    
    // キャンバス状態
    tool,
    color,
    lineWidth,
    strokes,
    
    // テンプレート・スタンプ
    selectedTemplate,
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
    setSelectedStamp,
    setSelectedCustomEmoji,
    setStampScale,
    setStampTab,
    setMessage,
    setMessageBox,
    setFontCategory,
    clearCanvas,
    generateSvg,
    
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
    
    // キャンバスサイズ（投稿用）
    canvasSize: { width, height },
  };
}

