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
    textBoxes,
    selectedTextBoxId,
    selectedTextBox,
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
    addTextBox,
    removeTextBox,
    selectTextBox,
    undo,
    redo,
    canUndo,
    canRedo,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleTextBoxPointerDown,
    handleOverlayPointerMove,
    handleOverlayPointerUp,
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
        canUndo={canUndo}
        canRedo={canRedo}
        onToolChange={selectTool}
        onColorChange={setColor}
        onLineWidthChange={setLineWidth}
        onStampScaleChange={setStampScale}
        onMessageBoxChange={setMessageBox}
        onUndo={undo}
        onRedo={redo}
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
          <div className={styles.textBoxControls}>
            <span className={styles.textBoxLabel}>
              テキストボックス: {textBoxes.length}個
              {selectedTextBox && ` (${textBoxes.findIndex(tb => tb.id === selectedTextBoxId) + 1}番目を編集中)`}
            </span>
            <button
              className={styles.addTextBoxButton}
              onClick={addTextBox}
              title="テキストボックスを追加"
            >
              ➕ 追加
            </button>
            {textBoxes.length > 1 && selectedTextBoxId && (
              <button
                className={styles.removeTextBoxButton}
                onClick={() => removeTextBox(selectedTextBoxId)}
                title="選択中のテキストボックスを削除"
              >
                🗑️ 削除
              </button>
            )}
          </div>
          <textarea
            className={styles.messageTextarea}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={selectedTextBox ? "メッセージを入力してください..." : "下のキャンバスでテキストボックスをクリックして選択"}
            rows={3}
            disabled={!selectedTextBox}
          />
          <p className={styles.messageHint}>
            💡 キャンバス上でテキストボックスをクリックして選択、ドラッグで移動、角をドラッグでサイズ変更
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
        
        {/* テキストボックスオーバーレイ（複数対応） */}
        <div
          ref={overlayRef}
          className={styles.canvasOverlay}
          onPointerMove={handleOverlayPointerMove}
          onPointerUp={handleOverlayPointerUp}
          onPointerLeave={handleOverlayPointerUp}
          onTouchMove={handleOverlayPointerMove}
          onTouchEnd={handleOverlayPointerUp}
          style={{ pointerEvents: tool === 'text' ? 'auto' : 'none' }}
        >
          {textBoxes.map((tb) => {
            const isSelected = tb.id === selectedTextBoxId;
            return (
              <div
                key={tb.id}
                className={`${styles.messageBox} ${tool === 'text' ? styles.editable : ''} ${isSelected ? styles.selected : ''}`}
                style={{
                  left: `${(tb.x / width) * 100}%`,
                  top: `${(tb.y / height) * 100}%`,
                  width: `${(tb.width / width) * 100}%`,
                  height: `${(tb.height / height) * 100}%`,
                }}
                onClick={() => tool === 'text' && selectTextBox(tb.id)}
              >
                <div
                  className={styles.messageText}
                  style={{
                    fontSize: `${tb.fontSize * (overlayRef.current?.clientWidth || width) / width}px`,
                    color: tb.color,
                    fontFamily: tb.fontFamily,
                  }}
                >
                  {tb.text || (tool === 'text' && isSelected ? 'テキストを入力...' : '')}
                </div>

                {tool === 'text' && isSelected && (
                  <>
                    <div
                      className={styles.moveHandle}
                      onPointerDown={(e) => handleTextBoxPointerDown(e, tb.id, 'move')}
                      onTouchStart={(e) => handleTextBoxPointerDown(e, tb.id, 'move')}
                    />
                    <div
                      className={`${styles.resizeHandle} ${styles.resizeNW}`}
                      onPointerDown={(e) => handleTextBoxPointerDown(e, tb.id, 'resize-nw')}
                      onTouchStart={(e) => handleTextBoxPointerDown(e, tb.id, 'resize-nw')}
                    />
                    <div
                      className={`${styles.resizeHandle} ${styles.resizeNE}`}
                      onPointerDown={(e) => handleTextBoxPointerDown(e, tb.id, 'resize-ne')}
                      onTouchStart={(e) => handleTextBoxPointerDown(e, tb.id, 'resize-ne')}
                    />
                    <div
                      className={`${styles.resizeHandle} ${styles.resizeSW}`}
                      onPointerDown={(e) => handleTextBoxPointerDown(e, tb.id, 'resize-sw')}
                      onTouchStart={(e) => handleTextBoxPointerDown(e, tb.id, 'resize-sw')}
                    />
                    <div
                      className={`${styles.resizeHandle} ${styles.resizeSE}`}
                      onPointerDown={(e) => handleTextBoxPointerDown(e, tb.id, 'resize-se')}
                      onTouchStart={(e) => handleTextBoxPointerDown(e, tb.id, 'resize-se')}
                    />
                  </>
                )}
              </div>
            );
          })}
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
