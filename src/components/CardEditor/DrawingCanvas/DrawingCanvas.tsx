// お絵描きキャンバスコンポーネント（統合）

import { useCallback } from 'react';
import { useDrawingCanvas } from './useDrawingCanvas';
import { TemplateSelector } from './TemplateSelector';
import { Toolbar } from './Toolbar';
import { StampPalette } from './StampPalette';
import { FontSelector } from './FontSelector';
import type { DrawingCanvasProps } from './types';
import styles from './DrawingCanvas.module.css';

export function DrawingCanvas({
  onSave,
  width = 400,
  height = 300,
  initialMessage = '',
  customEmojis = [],
  isLoadingEmojis = false,
}: DrawingCanvasProps) {
  const {
    canvasRef,
    overlayRef,
    tool,
    color,
    lineWidth,
    selectedTemplate,
    selectedStamp,
    selectedCustomEmoji,
    placedStamps,
    stampScale,
    stampTab,
    message,
    messageBox,
    fontCategory,
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
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleMessageBoxMouseDown,
    handleOverlayMouseMove,
    handleOverlayMouseUp,
  } = useDrawingCanvas({ width, height, initialMessage });

  const handleSave = useCallback(() => {
    const svg = generateSvg();
    onSave(svg, message);
  }, [generateSvg, onSave, message]);

  return (
    <div className={styles.drawingCanvas}>
      {/* テンプレート選択 */}
      <TemplateSelector
        selectedTemplate={selectedTemplate}
        onSelect={setSelectedTemplate}
      />

      {/* ツールバー */}
      <Toolbar
        tool={tool}
        color={color}
        lineWidth={lineWidth}
        stampScale={stampScale}
        messageBox={messageBox}
        onToolChange={selectTool}
        onColorChange={setColor}
        onLineWidthChange={setLineWidth}
        onStampScaleChange={setStampScale}
        onMessageBoxChange={setMessageBox}
      />

      {/* フォント選択（テキストモード時） */}
      {tool === 'text' && (
        <FontSelector
          messageBox={messageBox}
          fontCategory={fontCategory}
          onMessageBoxChange={setMessageBox}
          onFontCategoryChange={setFontCategory}
        />
      )}

      {/* スタンプパレット（スタンプモード時） */}
      {tool === 'stamp' && (
        <StampPalette
          stampTab={stampTab}
          selectedStamp={selectedStamp}
          selectedCustomEmoji={selectedCustomEmoji}
          customEmojis={customEmojis}
          isLoadingEmojis={isLoadingEmojis}
          onStampTabChange={setStampTab}
          onStampSelect={setSelectedStamp}
          onCustomEmojiSelect={setSelectedCustomEmoji}
        />
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
        
        {/* カスタム絵文字スタンプオーバーレイ（CORS回避用） */}
        {placedStamps.filter(s => s.isCustomEmoji).map(stamp => {
          const defaultSize = 50;
          const size = defaultSize * stamp.scale;
          return (
            <img
              key={stamp.id}
              src={stamp.customEmojiUrl}
              alt={stamp.stampId}
              className={styles.customEmojiStamp}
              style={{
                left: `${((stamp.x - size/2) / width) * 100}%`,
                top: `${((stamp.y - size/2) / height) * 100}%`,
                width: `${(size / width) * 100}%`,
                height: `${(size / height) * 100}%`,
              }}
            />
          );
        })}
        
        {/* メッセージボックスオーバーレイ */}
        <div
          ref={overlayRef}
          className={styles.canvasOverlay}
          onMouseMove={handleOverlayMouseMove}
          onMouseUp={handleOverlayMouseUp}
          onMouseLeave={handleOverlayMouseUp}
          style={{ pointerEvents: tool === 'text' ? 'auto' : 'none' }}
        >
          <div
            className={`${styles.messageBox} ${tool === 'text' ? styles.editable : ''}`}
            style={{
              left: `${(messageBox.x / width) * 100}%`,
              top: `${(messageBox.y / height) * 100}%`,
              width: `${(messageBox.width / width) * 100}%`,
              height: `${(messageBox.height / height) * 100}%`,
            }}
          >
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

            {tool === 'text' && (
              <>
                <div
                  className={styles.moveHandle}
                  onMouseDown={(e) => handleMessageBoxMouseDown(e, 'move')}
                />
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
