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
  
  // ストロークの履歴（SVG生成用）
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const currentStrokeRef = useRef<Point[]>([]);
  
  // Undo/Redo用の履歴
  const [undoStack, setUndoStack] = useState<Stroke[]>([]);
  
  // テンプレートとスタンプ
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(TEMPLATES[0]);
  const [selectedStamp, setSelectedStamp] = useState<Stamp | null>(null);
  const [selectedCustomEmoji, setSelectedCustomEmoji] = useState<CustomEmoji | null>(null);
  const [placedStamps, setPlacedStamps] = useState<PlacedStamp[]>([]);
  const [stampScale, setStampScale] = useState(1);
  const [stampTab, setStampTab] = useState<StampTab>('builtin');

  // テキストボックス（複数対応）
  const createTextBox = useCallback((overrides: Partial<TextBox> = {}): TextBox => ({
    id: `textbox-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    text: '',
    x: 20,
    y: height - 80,
    width: width - 40,
    height: 60,
    fontSize: 16,
    color: '#333333',
    fontFamily: JAPANESE_FONTS[0].family,
    fontId: JAPANESE_FONTS[0].id,
    ...overrides,
  }), [width, height]);

  const [textBoxes, setTextBoxes] = useState<TextBox[]>(() => [
    createTextBox({ text: initialMessage }),
  ]);
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
  const redrawCanvas = useCallback((strokesData: Stroke[], stampsData: PlacedStamp[]) => {
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

      // ビルトインスタンプのみキャンバスに再描画
      stampsData.forEach(placed => {
        if (placed.isCustomEmoji) return;
        
        const stamp = STAMPS.find(s => s.id === placed.stampId);
        if (!stamp) return;
        
        const stampImg = new Image();
        const stampSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${stamp.width} ${stamp.height}">${stamp.svg}</svg>`;
        const stampEncoded = btoa(unescape(encodeURIComponent(stampSvg)));
        stampImg.onload = () => {
          const w = stamp.width * placed.scale;
          const h = stamp.height * placed.scale;
          ctx.drawImage(stampImg, placed.x - w/2, placed.y - h/2, w, h);
        };
        stampImg.src = `data:image/svg+xml;base64,${stampEncoded}`;
      });
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
    const newBox = createTextBox({
      y: 20 + textBoxes.length * 70,
    });
    setTextBoxes(prev => [...prev, newBox]);
    setSelectedTextBoxId(newBox.id);
  }, [createTextBox, textBoxes.length]);

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
  };
}

