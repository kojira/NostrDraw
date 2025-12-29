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
} from './types';

// ローカルストレージのキー
const STORAGE_KEY = 'nostrdraw-canvas-state';

// 保存するデータの型
interface CanvasStorageData {
  strokes: Stroke[];
  placedStamps: PlacedStamp[];
  textBoxes: TextBox[];
  templateId: string;
  savedAt: number;
}

// ローカルストレージからデータを読み込む
function loadCanvasState(): CanvasStorageData | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const data = JSON.parse(saved) as CanvasStorageData;
    // 24時間以上経過したデータは無視
    if (Date.now() - data.savedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return data;
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

export function useDrawingCanvas({ width, height, initialMessage }: UseDrawingCanvasOptions) {
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
  
  // ストロークの履歴（SVG生成用）
  const [strokes, setStrokes] = useState<Stroke[]>(() => savedState?.strokes || []);
  const currentStrokeRef = useRef<Point[]>([]);
  
  // Undo/Redo用の履歴
  const [undoStack, setUndoStack] = useState<Stroke[]>([]);
  
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
  const [placedStamps, setPlacedStamps] = useState<PlacedStamp[]>(() => savedState?.placedStamps || []);
  const [selectedPlacedStampId, setSelectedPlacedStampId] = useState<string | null>(null);
  const [stampScale, setStampScale] = useState(1);
  const [stampTab, setStampTab] = useState<StampTab>('builtin');
  const [stampDragStart, setStampDragStart] = useState<Point | null>(null);
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

  const [textBoxes, setTextBoxes] = useState<TextBox[]>(() => {
    if (savedState?.textBoxes && savedState.textBoxes.length > 0) {
      return savedState.textBoxes;
    }
    return [{
      id: `textbox-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: initialMessage,
      x: 20,
      y: 20,
      width: Math.min(width - 40, 360),
      height: 50,
      fontSize: 16,
      color: '#333333',
      fontFamily: JAPANESE_FONTS[0].family,
      fontId: JAPANESE_FONTS[0].id,
    }];
  });
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

  // キャンバスの初期化と再描画
  const redrawCanvas = useCallback((strokesData: Stroke[], _stampsData: PlacedStamp[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    contextRef.current = ctx;

    const doRedraw = (templateImg: HTMLImageElement) => {
      // 背景をクリア
      ctx.clearRect(0, 0, width, height);
      
      // テンプレートを描画
      ctx.drawImage(templateImg, 0, 0, width, height);
      
      // ストロークを再描画
      strokesData.forEach(stroke => {
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
  }, [templateDataUri, width, height]);

  // 初期化（テンプレート変更時のみ）
  useEffect(() => {
    redrawCanvas(strokes, placedStamps);
  }, [selectedTemplate]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setPlacedStamps(prev => {
          const updated = [...prev, newStamp];
          // スタンプ追加後に再描画
          setTimeout(() => redrawCanvas(strokes, updated), 0);
          return updated;
        });
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
      // 新しいストロークを追加したらundoStackをクリア
      setUndoStack([]);
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
    setStrokes([]);
    setPlacedStamps([]);
    setUndoStack([]);
    // ローカルストレージもクリア
    clearCanvasState();
    // クリア後に再描画
    setTimeout(() => redrawCanvas([], []), 0);
  }, [redrawCanvas]);

  // Undo
  const undo = useCallback(() => {
    if (strokes.length === 0) return;
    
    const lastStroke = strokes[strokes.length - 1];
    const newStrokes = strokes.slice(0, -1);
    
    setStrokes(newStrokes);
    setUndoStack(prev => [...prev, lastStroke]);
    
    // 再描画
    setTimeout(() => redrawCanvas(newStrokes, placedStamps), 0);
  }, [strokes, placedStamps, redrawCanvas]);

  // Redo
  const redo = useCallback(() => {
    if (undoStack.length === 0) return;
    
    const strokeToRestore = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, -1);
    const newStrokes = [...strokes, strokeToRestore];
    
    setStrokes(newStrokes);
    setUndoStack(newUndoStack);
    
    // 再描画
    setTimeout(() => redrawCanvas(newStrokes, placedStamps), 0);
  }, [strokes, undoStack, placedStamps, redrawCanvas]);

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
    const hasContent = strokes.length > 0 || placedStamps.length > 0 || 
      textBoxes.some(tb => tb.text.length > 0);
    if (hasContent) {
      saveCanvasState({
        strokes,
        placedStamps,
        textBoxes,
        templateId: selectedTemplate.id,
      });
    }
  }, [strokes, placedStamps, textBoxes, selectedTemplate.id]);

  // Undo/Redo可能かどうか
  const canUndo = strokes.length > 0;
  const canRedo = undoStack.length > 0;

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
    // 再描画
    setTimeout(() => {
      setPlacedStamps(current => {
        redrawCanvas(strokes, current);
        return current;
      });
    }, 0);
  }, [selectedPlacedStampId, strokes, redrawCanvas]);

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
    if (stampDragStart && stampDragOriginal) {
      // 再描画
      setTimeout(() => redrawCanvas(strokes, placedStamps), 0);
    }
    setStampDragStart(null);
    setStampDragOriginal(null);
    setStampDragMode(null);
  }, [stampDragStart, stampDragOriginal, strokes, placedStamps, redrawCanvas]);

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
      setPlacedStamps(prev => {
        const updated = [...prev, newStamp];
        setTimeout(() => redrawCanvas(strokes, updated), 0);
        return updated;
      });
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
  }, [width, height, selectedStamp, selectedCustomEmoji, stampScale, strokes, redrawCanvas]);

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
  const generateSvg = useCallback((): string => {
    const pathElements = strokes.map((stroke) => {
      const d = pointsToPath(stroke.points);
      return `<path d="${d}" stroke="${stroke.color}" stroke-width="${stroke.lineWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    }).join('\n  ');

    const stampElements = placedStamps.map((placed) => {
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
    }).join('\n  ');

    // 複数テキストボックスをSVGに変換
    const textElements = textBoxes
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
      .join('\n  ');

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  ${selectedTemplate.svg}
  ${pathElements}
  ${stampElements}
  ${textElements}
</svg>`;
  }, [strokes, placedStamps, width, height, pointsToPath, selectedTemplate, textBoxes]);

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
  };
}

