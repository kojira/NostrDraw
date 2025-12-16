// DrawingCanvasの状態管理フック

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { TEMPLATES, STAMPS } from '../../../data/templates';
import { JAPANESE_FONTS } from '../../../data/fonts';
import type {
  Point,
  Stroke,
  PlacedStamp,
  MessageBox,
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
  const [isDrawing, setIsDrawing] = useState(false);
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);
  const [color, setColor] = useState('#e94560');
  const [lineWidth, setLineWidth] = useState(3);
  const [tool, setTool] = useState<ToolType>('pen');
  const lastPointRef = useRef<Point | null>(null);
  
  // ストロークの履歴（SVG生成用）
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const currentStrokeRef = useRef<Point[]>([]);
  
  // テンプレートとスタンプ
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(TEMPLATES[0]);
  const [selectedStamp, setSelectedStamp] = useState<Stamp | null>(null);
  const [selectedCustomEmoji, setSelectedCustomEmoji] = useState<CustomEmoji | null>(null);
  const [placedStamps, setPlacedStamps] = useState<PlacedStamp[]>([]);
  const [stampScale, setStampScale] = useState(1);
  const [stampTab, setStampTab] = useState<StampTab>('builtin');

  // メッセージボックス
  const [message, setMessage] = useState(initialMessage);
  const [messageBox, setMessageBox] = useState<MessageBox>({
    x: 20,
    y: height - 80,
    width: width - 40,
    height: 60,
    fontSize: 16,
    color: '#333333',
    fontFamily: JAPANESE_FONTS[0].family,
    fontId: JAPANESE_FONTS[0].id,
  });
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [messageBoxStart, setMessageBoxStart] = useState<MessageBox | null>(null);
  const [fontCategory, setFontCategory] = useState<string>('all');

  // テンプレートのdata URI
  const templateDataUri = useMemo(() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${selectedTemplate.svg}</svg>`;
    const encoded = btoa(unescape(encodeURIComponent(svg)));
    return `data:image/svg+xml;base64,${encoded}`;
  }, [selectedTemplate, width, height]);

  // キャンバスの初期化と再描画
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 背景をクリア
    ctx.clearRect(0, 0, width, height);

    // テンプレートを描画
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      
      // ストロークを再描画
      strokes.forEach(stroke => {
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
      // カスタム絵文字はCORS制限があるためオーバーレイで表示
      placedStamps.forEach(placed => {
        if (placed.isCustomEmoji) {
          // カスタム絵文字はオーバーレイで表示するためスキップ
          return;
        }
        
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
    img.src = templateDataUri;
    
    setContext(ctx);
  }, [width, height, templateDataUri, strokes, placedStamps]);

  // 初期化
  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

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

    if (!context) return;

    setIsDrawing(true);
    lastPointRef.current = point;
    currentStrokeRef.current = [point];

    context.beginPath();
    context.moveTo(point.x, point.y);
  }, [context, getPointerPosition, tool, selectedStamp, selectedCustomEmoji, stampScale]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !context || !lastPointRef.current || tool === 'stamp') return;

    const point = getPointerPosition(e);

    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = lineWidth;
    context.strokeStyle = tool === 'eraser' ? '#ffffff' : color;

    context.lineTo(point.x, point.y);
    context.stroke();
    context.beginPath();
    context.moveTo(point.x, point.y);

    lastPointRef.current = point;
    currentStrokeRef.current.push(point);
  }, [isDrawing, context, lineWidth, color, tool, getPointerPosition]);

  const handlePointerUp = useCallback(() => {
    if (tool === 'stamp') return;
    
    if (isDrawing && currentStrokeRef.current.length > 1) {
      setStrokes(prev => [...prev, {
        points: [...currentStrokeRef.current],
        color: tool === 'eraser' ? '#ffffff' : color,
        lineWidth,
      }]);
    }
    setIsDrawing(false);
    lastPointRef.current = null;
    currentStrokeRef.current = [];
    if (context) {
      context.beginPath();
    }
  }, [isDrawing, context, color, lineWidth, tool]);

  // キャンバスクリア
  const clearCanvas = useCallback(() => {
    setStrokes([]);
    setPlacedStamps([]);
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

    let textElement = '';
    if (message.trim()) {
      const lines = message.split('\n');
      const lineHeight = messageBox.fontSize * 1.3;
      const textLines = lines.map((line, i) => {
        const y = messageBox.y + messageBox.fontSize + (i * lineHeight);
        const escapedLine = line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
        return `<tspan x="${messageBox.x + 5}" y="${y.toFixed(2)}">${escapedLine}</tspan>`;
      }).join('');
      
      const fontFamilyForSvg = messageBox.fontFamily.split(',')[0].replace(/"/g, '').trim();
      textElement = `<text font-family="${fontFamilyForSvg}, sans-serif" font-size="${messageBox.fontSize}" fill="${messageBox.color}">${textLines}</text>`;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  ${selectedTemplate.svg}
  ${pathElements}
  ${stampElements}
  ${textElement}
</svg>`;
  }, [strokes, placedStamps, width, height, pointsToPath, selectedTemplate, message, messageBox]);

  // メッセージボックスのドラッグハンドラ
  const handleMessageBoxMouseDown = useCallback((e: React.MouseEvent, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault();
    setDragMode(mode);
    setDragStart({ x: e.clientX, y: e.clientY });
    setMessageBoxStart({ ...messageBox });
  }, [messageBox]);

  const handleOverlayMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragMode === 'none' || !dragStart || !messageBoxStart) return;

    const overlay = overlayRef.current;
    if (!overlay) return;

    const rect = overlay.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;

    const dx = (e.clientX - dragStart.x) * scaleX;
    const dy = (e.clientY - dragStart.y) * scaleY;

    if (dragMode === 'move') {
      const newX = Math.max(0, Math.min(width - messageBoxStart.width, messageBoxStart.x + dx));
      const newY = Math.max(0, Math.min(height - messageBoxStart.height, messageBoxStart.y + dy));
      setMessageBox(prev => ({ ...prev, x: newX, y: newY }));
    } else if (dragMode === 'resize-se') {
      const newW = Math.max(80, Math.min(width - messageBoxStart.x, messageBoxStart.width + dx));
      const newH = Math.max(30, Math.min(height - messageBoxStart.y, messageBoxStart.height + dy));
      setMessageBox(prev => ({ ...prev, width: newW, height: newH }));
    } else if (dragMode === 'resize-sw') {
      const newW = Math.max(80, messageBoxStart.width - dx);
      const newX = Math.max(0, messageBoxStart.x + messageBoxStart.width - newW);
      const newH = Math.max(30, Math.min(height - messageBoxStart.y, messageBoxStart.height + dy));
      setMessageBox(prev => ({ ...prev, x: newX, width: newW, height: newH }));
    } else if (dragMode === 'resize-ne') {
      const newW = Math.max(80, Math.min(width - messageBoxStart.x, messageBoxStart.width + dx));
      const newH = Math.max(30, messageBoxStart.height - dy);
      const newY = Math.max(0, messageBoxStart.y + messageBoxStart.height - newH);
      setMessageBox(prev => ({ ...prev, y: newY, width: newW, height: newH }));
    } else if (dragMode === 'resize-nw') {
      const newW = Math.max(80, messageBoxStart.width - dx);
      const newH = Math.max(30, messageBoxStart.height - dy);
      const newX = Math.max(0, messageBoxStart.x + messageBoxStart.width - newW);
      const newY = Math.max(0, messageBoxStart.y + messageBoxStart.height - newH);
      setMessageBox(prev => ({ ...prev, x: newX, y: newY, width: newW, height: newH }));
    }
  }, [dragMode, dragStart, messageBoxStart, width, height]);

  const handleOverlayMouseUp = useCallback(() => {
    setDragMode('none');
    setDragStart(null);
    setMessageBoxStart(null);
  }, []);

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
    
    // メッセージ
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
    
    // イベントハンドラ
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleMessageBoxMouseDown,
    handleOverlayMouseMove,
    handleOverlayMouseUp,
  };
}

