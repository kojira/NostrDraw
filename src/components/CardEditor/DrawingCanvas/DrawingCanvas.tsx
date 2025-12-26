// お絵描きキャンバスコンポーネント（統合）

import { useCallback, useEffect, useRef } from 'react';
import { useDrawingCanvas } from './useDrawingCanvas';
import { TemplateSelector } from './TemplateSelector';
import { Toolbar } from './Toolbar';
import { StampPalette } from './StampPalette';
import { FontSelector } from './FontSelector';
import { STAMPS } from '../../../data/templates';
import type { DrawingCanvasProps, Template } from './types';
import styles from './DrawingCanvas.module.css';

export function DrawingCanvas({
  onSave,
  width = 400,
  height = 300,
  initialMessage = '',
  customEmojis = [],
  isLoadingEmojis = false,
  etoImages = [],
  baseImageSvg,
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
    selectedPlacedStampId,
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
    removePlacedStamp,
    handleStampPointerDown,
    handleStampPointerMove,
    handleStampPointerUp,
    placeStampAtPosition,
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

  // 描き足し元のSVGが渡されたらテンプレートとして設定
  const hasSetBaseImage = useRef(false);
  useEffect(() => {
    if (baseImageSvg && !hasSetBaseImage.current) {
      hasSetBaseImage.current = true;
      
      // SVGの内容を抽出してテンプレートとして設定
      const svgMatch = baseImageSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
      const innerSvg = svgMatch ? svgMatch[1] : baseImageSvg;
      
      const baseTemplate: Template = {
        id: 'extend-base',
        name: '描き足し元',
        svg: innerSvg,
      };
      
      setSelectedTemplate(baseTemplate);
    }
  }, [baseImageSvg, setSelectedTemplate]);

  // baseImageSvgがリセットされたらフラグもリセット
  useEffect(() => {
    if (!baseImageSvg) {
      hasSetBaseImage.current = false;
    }
  }, [baseImageSvg]);

  const handleSave = useCallback(() => {
    const svg = generateSvg();
    onSave(svg, message);
  }, [generateSvg, onSave, message]);

  return (
    <div className={styles.drawingCanvas}>
      {/* 台紙選択 */}
      <TemplateSelector
        selectedTemplate={selectedTemplate}
        onSelect={setSelectedTemplate}
        etoImages={etoImages}
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
        <div className={styles.canvasWrapper}>
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
          
          {/* スタンプオーバーレイ（ドラッグ可能） */}
          <div
            className={styles.canvasOverlay}
            onPointerDown={tool === 'stamp' ? (e) => {
              // オーバーレイ自体をクリックした場合（スタンプ以外の場所）に新規配置
              if (e.target === e.currentTarget && (selectedStamp || selectedCustomEmoji)) {
                placeStampAtPosition(e.clientX, e.clientY);
              }
            } : undefined}
            onPointerMove={tool === 'stamp' ? handleStampPointerMove : undefined}
            onPointerUp={tool === 'stamp' ? handleStampPointerUp : undefined}
            onPointerLeave={tool === 'stamp' ? handleStampPointerUp : undefined}
            onTouchMove={tool === 'stamp' ? handleStampPointerMove : undefined}
            onTouchEnd={tool === 'stamp' ? handleStampPointerUp : undefined}
            style={{ pointerEvents: tool === 'stamp' ? 'auto' : 'none' }}
          >
            {placedStamps.map(stamp => {
              const isCustom = stamp.isCustomEmoji;
              const builtinStamp = !isCustom ? STAMPS.find(s => s.id === stamp.stampId) : null;
              const defaultSize = isCustom ? 50 : (builtinStamp ? Math.max(builtinStamp.width, builtinStamp.height) : 40);
              const size = defaultSize * stamp.scale;
              const isSelected = stamp.id === selectedPlacedStampId;
              
              // ビルトインスタンプのSVGをdata URIに変換
              const builtinSvgDataUri = builtinStamp ? 
                `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${builtinStamp.width} ${builtinStamp.height}">${builtinStamp.svg}</svg>`)}` : 
                null;
              
              return (
                <div
                  key={stamp.id}
                  className={`${styles.placedStamp} ${isSelected ? styles.stampSelected : ''}`}
                  style={{
                    left: `${((stamp.x - size/2) / width) * 100}%`,
                    top: `${((stamp.y - size/2) / height) * 100}%`,
                    width: `${(size / width) * 100}%`,
                    height: `${(size / height) * 100}%`,
                  }}
                  onPointerDown={(e) => handleStampPointerDown(e, stamp.id)}
                  onTouchStart={(e) => handleStampPointerDown(e, stamp.id)}
                >
                  {isCustom ? (
                    <img
                      src={stamp.customEmojiUrl}
                      alt={stamp.stampId}
                      className={styles.stampImage}
                      draggable={false}
                    />
                  ) : builtinSvgDataUri ? (
                    <img
                      src={builtinSvgDataUri}
                      alt={stamp.stampId}
                      className={styles.stampImage}
                      draggable={false}
                    />
                  ) : null}
                  {isSelected && (
                    <>
                      <button
                        className={styles.stampDeleteButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          removePlacedStamp(stamp.id);
                        }}
                      >
                        ✕
                      </button>
                      <div
                        className={styles.stampResizeHandle}
                        onPointerDown={(e) => handleStampPointerDown(e, stamp.id, 'resize')}
                        onTouchStart={(e) => handleStampPointerDown(e, stamp.id, 'resize')}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
          
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
