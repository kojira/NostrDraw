// お絵描きキャンバスコンポーネント（テンプレート＆スタンプ＆メッセージ配置対応）

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { TEMPLATES, STAMPS, type Template, type Stamp } from '../../../data/templates';
import { JAPANESE_FONTS, FONT_CATEGORIES, type FontOption } from '../../../data/fonts';
import { type CustomEmoji } from '../../../services/emoji';
import styles from './DrawingCanvas.module.css';

interface DrawingCanvasProps {
  onSave: (svg: string, message: string) => void;
  width?: number;
  height?: number;
  initialMessage?: string;
  customEmojis?: CustomEmoji[];
  isLoadingEmojis?: boolean;
}

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  points: Point[];
  color: string;
  lineWidth: number;
}

interface PlacedStamp {
  id: string;
  stampId: string;
  x: number;
  y: number;
  scale: number;
  isCustomEmoji?: boolean;
  customEmojiUrl?: string;
}

// メッセージボックスの状態
interface MessageBox {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
  fontFamily: string;
  fontId: string;
}

type ToolType = 'pen' | 'eraser' | 'stamp' | 'text';
type DragMode = 'none' | 'move' | 'resize-se' | 'resize-sw' | 'resize-ne' | 'resize-nw';

export function DrawingCanvas({
  onSave,
  width = 400,
  height = 300,
  initialMessage = '',
  customEmojis = [],
  isLoadingEmojis = false,
}: DrawingCanvasProps) {
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
  const [stampTab, setStampTab] = useState<'builtin' | 'custom'>('builtin');

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
  const [fontCategory, setFontCategory] = useState<FontOption['category'] | 'all'>('all');

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

      // スタンプを再描画
      placedStamps.forEach(placed => {
        if (placed.isCustomEmoji && placed.customEmojiUrl) {
          // カスタム絵文字スタンプ
          const emojiImg = new Image();
          emojiImg.crossOrigin = 'anonymous';
          emojiImg.onload = () => {
            const defaultSize = 50;
            const w = defaultSize * placed.scale;
            const h = defaultSize * placed.scale;
            ctx.drawImage(emojiImg, placed.x - w/2, placed.y - h/2, w, h);
          };
          emojiImg.src = placed.customEmojiUrl;
        } else {
          // ビルトインスタンプ
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
        }
      });
    };
    img.src = templateDataUri;
    
    setContext(ctx);
  }, [width, height, templateDataUri, strokes, placedStamps]);

  // 初期化
  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

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

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getPointerPosition(e);

    if (tool === 'stamp') {
      // ビルトインスタンプを配置
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
      // カスタム絵文字スタンプを配置
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

    // ペン/消しゴム
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
    // ストローク
    const pathElements = strokes.map((stroke) => {
      const d = pointsToPath(stroke.points);
      return `<path d="${d}" stroke="${stroke.color}" stroke-width="${stroke.lineWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    }).join('\n  ');

    // スタンプ
    const stampElements = placedStamps.map((placed) => {
      if (placed.isCustomEmoji && placed.customEmojiUrl) {
        // カスタム絵文字スタンプ（SVG内に画像として埋め込み）
        const defaultSize = 50;
        const w = defaultSize * placed.scale;
        const h = defaultSize * placed.scale;
        const x = placed.x - w/2;
        const y = placed.y - h/2;
        return `<image href="${placed.customEmojiUrl}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`;
      } else {
        // ビルトインスタンプ
        const stamp = STAMPS.find(s => s.id === placed.stampId);
        if (!stamp) return '';
        const w = stamp.width * placed.scale;
        const h = stamp.height * placed.scale;
        const x = placed.x - w/2;
        const y = placed.y - h/2;
        return `<g transform="translate(${x.toFixed(2)}, ${y.toFixed(2)}) scale(${placed.scale})">${stamp.svg}</g>`;
      }
    }).join('\n  ');

    // メッセージテキスト（改行対応）
    let textElement = '';
    if (message.trim()) {
      const lines = message.split('\n');
      const lineHeight = messageBox.fontSize * 1.3;
      const textLines = lines.map((line, i) => {
        const y = messageBox.y + messageBox.fontSize + (i * lineHeight);
        // XMLエスケープ
        const escapedLine = line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
        return `<tspan x="${messageBox.x + 5}" y="${y.toFixed(2)}">${escapedLine}</tspan>`;
      }).join('');
      
      // フォントファミリー名を抽出（SVG用にシンプルな形式に）
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

  const handleSave = useCallback(() => {
    const svg = generateSvg();
    onSave(svg, message);
  }, [generateSvg, onSave, message]);

  // メッセージボックスのドラッグ開始
  const handleMessageBoxMouseDown = useCallback((e: React.MouseEvent, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault();
    setDragMode(mode);
    setDragStart({ x: e.clientX, y: e.clientY });
    setMessageBoxStart({ ...messageBox });
  }, [messageBox]);

  // メッセージボックスのドラッグ中
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

  // メッセージボックスのドラッグ終了
  const handleOverlayMouseUp = useCallback(() => {
    setDragMode('none');
    setDragStart(null);
    setMessageBoxStart(null);
  }, []);

  const colors = ['#e94560', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#9b5de5', '#000000', '#ffffff'];

  return (
    <div className={styles.drawingCanvas}>
      {/* テンプレート選択 */}
      <div className={styles.templateSection}>
        <span className={styles.sectionLabel}>ベース:</span>
        <div className={styles.templateList}>
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              className={`${styles.templateButton} ${selectedTemplate.id === template.id ? styles.active : ''}`}
              onClick={() => setSelectedTemplate(template)}
            >
              {template.name}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.toolbar}>
        {/* ツール選択 */}
        <div className={styles.toolGroup}>
          <button
            className={`${styles.toolButton} ${tool === 'pen' ? styles.active : ''}`}
            onClick={() => { setTool('pen'); setSelectedStamp(null); }}
            title="ペン"
          >
            ✏️
          </button>
          <button
            className={`${styles.toolButton} ${tool === 'eraser' ? styles.active : ''}`}
            onClick={() => { setTool('eraser'); setSelectedStamp(null); }}
            title="消しゴム"
          >
            🧹
          </button>
          <button
            className={`${styles.toolButton} ${tool === 'stamp' ? styles.active : ''}`}
            onClick={() => setTool('stamp')}
            title="スタンプ"
          >
            🖼️
          </button>
          <button
            className={`${styles.toolButton} ${tool === 'text' ? styles.active : ''}`}
            onClick={() => { setTool('text'); setSelectedStamp(null); }}
            title="メッセージ編集"
          >
            📝
          </button>
        </div>

        {/* 色選択（ペンモード時） */}
        {tool === 'pen' && (
          <div className={styles.colorPicker}>
            {colors.map((c) => (
              <button
                key={c}
                className={`${styles.colorButton} ${color === c ? styles.active : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        )}

        {/* 線の太さ（ペン/消しゴムモード時） */}
        {(tool === 'pen' || tool === 'eraser') && (
          <div className={styles.sizeControl}>
            <input
              type="range"
              min="1"
              max="20"
              value={lineWidth}
              onChange={(e) => setLineWidth(Number(e.target.value))}
              className={styles.sizeSlider}
            />
            <span className={styles.sizeLabel}>{lineWidth}px</span>
          </div>
        )}

        {/* スタンプサイズ（スタンプモード時） */}
        {tool === 'stamp' && (
          <div className={styles.sizeControl}>
            <span className={styles.sizeLabel}>サイズ:</span>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.25"
              value={stampScale}
              onChange={(e) => setStampScale(Number(e.target.value))}
              className={styles.sizeSlider}
            />
            <span className={styles.sizeLabel}>{stampScale}x</span>
          </div>
        )}

        {/* テキスト設定（テキストモード時） */}
        {tool === 'text' && (
          <>
            <div className={styles.sizeControl}>
              <span className={styles.sizeLabel}>文字サイズ:</span>
              <input
                type="range"
                min="10"
                max="36"
                value={messageBox.fontSize}
                onChange={(e) => setMessageBox(prev => ({ ...prev, fontSize: Number(e.target.value) }))}
                className={styles.sizeSlider}
              />
              <span className={styles.sizeLabel}>{messageBox.fontSize}px</span>
            </div>
            <div className={styles.colorPicker}>
              {colors.map((c) => (
                <button
                  key={c}
                  className={`${styles.colorButton} ${messageBox.color === c ? styles.active : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setMessageBox(prev => ({ ...prev, color: c }))}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* フォント選択（テキストモード時） */}
      {tool === 'text' && (
        <div className={styles.fontSection}>
          <div className={styles.fontCategoryTabs}>
            <button
              className={`${styles.fontCategoryTab} ${fontCategory === 'all' ? styles.active : ''}`}
              onClick={() => setFontCategory('all')}
            >
              すべて
            </button>
            {(Object.keys(FONT_CATEGORIES) as Array<keyof typeof FONT_CATEGORIES>).map((cat) => (
              <button
                key={cat}
                className={`${styles.fontCategoryTab} ${fontCategory === cat ? styles.active : ''}`}
                onClick={() => setFontCategory(cat)}
              >
                {FONT_CATEGORIES[cat]}
              </button>
            ))}
          </div>
          <div className={styles.fontList}>
            {JAPANESE_FONTS
              .filter(font => fontCategory === 'all' || font.category === fontCategory)
              .map((font) => (
                <button
                  key={font.id}
                  className={`${styles.fontButton} ${messageBox.fontId === font.id ? styles.active : ''}`}
                  style={{ fontFamily: font.family }}
                  onClick={() => setMessageBox(prev => ({ 
                    ...prev, 
                    fontFamily: font.family,
                    fontId: font.id,
                  }))}
                >
                  {font.name}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* スタンプパレット（スタンプモード時） */}
      {tool === 'stamp' && (
        <div className={styles.stampSection}>
          {/* スタンプタブ */}
          <div className={styles.stampTabs}>
            <button
              className={`${styles.stampTabButton} ${stampTab === 'builtin' ? styles.active : ''}`}
              onClick={() => {
                setStampTab('builtin');
                setSelectedCustomEmoji(null);
              }}
            >
              🎨 内蔵スタンプ
            </button>
            <button
              className={`${styles.stampTabButton} ${stampTab === 'custom' ? styles.active : ''}`}
              onClick={() => {
                setStampTab('custom');
                setSelectedStamp(null);
              }}
            >
              😀 カスタム絵文字 {customEmojis.length > 0 && `(${customEmojis.length})`}
            </button>
          </div>

          {/* 内蔵スタンプパレット */}
          {stampTab === 'builtin' && (
            <div className={styles.stampPalette}>
              {STAMPS.map((stamp) => {
                const dataUri = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${stamp.width} ${stamp.height}">${stamp.svg}</svg>`)))}`;
                return (
                  <button
                    key={stamp.id}
                    className={`${styles.stampButton} ${selectedStamp?.id === stamp.id ? styles.active : ''}`}
                    onClick={() => {
                      setSelectedStamp(stamp);
                      setSelectedCustomEmoji(null);
                    }}
                    title={stamp.name}
                  >
                    <img src={dataUri} alt={stamp.name} className={styles.stampPreview} />
                  </button>
                );
              })}
            </div>
          )}

          {/* カスタム絵文字パレット */}
          {stampTab === 'custom' && (
            <div className={styles.customEmojiPalette}>
              {isLoadingEmojis && (
                <div className={styles.loadingEmojis}>
                  カスタム絵文字を読み込み中...
                </div>
              )}
              {!isLoadingEmojis && customEmojis.length === 0 && (
                <div className={styles.noEmojis}>
                  <p>カスタム絵文字が見つかりません</p>
                  <p className={styles.noEmojisHint}>
                    💡 NIP-30の絵文字リスト (kind 10030) を設定すると、ここにカスタム絵文字が表示されます
                  </p>
                </div>
              )}
              {!isLoadingEmojis && customEmojis.length > 0 && (
                <div className={styles.emojiGrid}>
                  {customEmojis.map((emoji) => (
                    <button
                      key={`${emoji.shortcode}-${emoji.url}`}
                      className={`${styles.emojiButton} ${selectedCustomEmoji?.url === emoji.url ? styles.active : ''}`}
                      onClick={() => {
                        setSelectedCustomEmoji(emoji);
                        setSelectedStamp(null);
                      }}
                      title={`:${emoji.shortcode}:`}
                    >
                      <img 
                        src={emoji.url} 
                        alt={emoji.shortcode} 
                        className={styles.emojiPreview}
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* メッセージ入力（テキストモード時） */}
      {tool === 'text' && (
        <div className={styles.messageInputSection}>
          <textarea
            className={styles.messageTextarea}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="メッセージを入力してください..."
            rows={3}
          />
          <p className={styles.messageHint}>
            💡 下のキャンバス上でテキストボックスをドラッグして位置を調整、角をドラッグしてサイズを変更できます
          </p>
        </div>
      )}

      {/* キャンバス */}
      <div className={styles.canvasContainer}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className={`${styles.canvas} ${tool === 'stamp' && (selectedStamp || selectedCustomEmoji) ? styles.stampCursor : ''} ${tool === 'text' ? styles.textMode : ''}`}
          onPointerDown={tool !== 'text' ? handlePointerDown : undefined}
          onPointerMove={tool !== 'text' ? handlePointerMove : undefined}
          onPointerUp={tool !== 'text' ? handlePointerUp : undefined}
          onPointerLeave={tool !== 'text' ? handlePointerUp : undefined}
        />
        
        {/* メッセージボックスオーバーレイ */}
        <div
          ref={overlayRef}
          className={styles.canvasOverlay}
          onMouseMove={handleOverlayMouseMove}
          onMouseUp={handleOverlayMouseUp}
          onMouseLeave={handleOverlayMouseUp}
          style={{ pointerEvents: tool === 'text' ? 'auto' : 'none' }}
        >
          {/* メッセージボックス */}
          <div
            className={`${styles.messageBox} ${tool === 'text' ? styles.editable : ''}`}
            style={{
              left: `${(messageBox.x / width) * 100}%`,
              top: `${(messageBox.y / height) * 100}%`,
              width: `${(messageBox.width / width) * 100}%`,
              height: `${(messageBox.height / height) * 100}%`,
            }}
          >
            {/* メッセージテキスト表示 */}
            <div
              className={styles.messageText}
              style={{
                fontSize: `${messageBox.fontSize * (overlayRef.current?.clientWidth || width) / width}px`,
                color: messageBox.color,
                fontFamily: messageBox.fontFamily,
              }}
            >
              {message || (tool === 'text' ? 'ここにメッセージが表示されます' : '')}
            </div>

            {/* ドラッグ＆リサイズハンドル（テキストモード時のみ） */}
            {tool === 'text' && (
              <>
                {/* 移動ハンドル（中央） */}
                <div
                  className={styles.moveHandle}
                  onMouseDown={(e) => handleMessageBoxMouseDown(e, 'move')}
                />
                {/* リサイズハンドル（四隅） */}
                <div
                  className={`${styles.resizeHandle} ${styles.resizeNW}`}
                  onMouseDown={(e) => handleMessageBoxMouseDown(e, 'resize-nw')}
                />
                <div
                  className={`${styles.resizeHandle} ${styles.resizeNE}`}
                  onMouseDown={(e) => handleMessageBoxMouseDown(e, 'resize-ne')}
                />
                <div
                  className={`${styles.resizeHandle} ${styles.resizeSW}`}
                  onMouseDown={(e) => handleMessageBoxMouseDown(e, 'resize-sw')}
                />
                <div
                  className={`${styles.resizeHandle} ${styles.resizeSE}`}
                  onMouseDown={(e) => handleMessageBoxMouseDown(e, 'resize-se')}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* アクションボタン */}
      <div className={styles.actions}>
        <button onClick={clearCanvas} className={styles.clearButton}>
          クリア
        </button>
        <button onClick={handleSave} className={styles.saveButton}>
          この絵を使う
        </button>
      </div>
    </div>
  );
}

