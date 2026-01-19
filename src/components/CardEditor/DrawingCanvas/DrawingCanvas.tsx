// お絵描きキャンバスコンポーネント（統合）

import { useCallback, useEffect, useRef } from 'react';
import { useDrawingCanvas } from './useDrawingCanvas';
import { TemplateSelector } from './TemplateSelector';
import { Toolbar } from './Toolbar';
import { StampPalette } from './StampPalette';
import { FontSelector } from './FontSelector';
import { LayerPanel } from './LayerPanel';
import { STAMPS } from '../../../data/templates';
import type { DrawingCanvasProps, Template } from './types';
import styles from './DrawingCanvas.module.css';

export function DrawingCanvas({
  onSave,
  onPost,
  isPosting = false,
  postSuccess = false,
  onNewPost,
  onGoHome,
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
    selectedPlacedStampId,
    stampScale,
    stampTab,
    customColors,
    addCustomColor,
    removeCustomColor,
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
    generateDiffSvg,
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
    zoomLevel,
    panOffset,
    handlePinchStart,
    handlePinchMove,
    handlePinchEnd,
    resetZoom,
    // レイヤー機能
    layers,
    activeLayerId,
    allPlacedStamps,
    addLayer,
    removeLayer,
    selectLayer,
    toggleLayerVisibility,
    toggleLayerLock,
    setLayerOpacity,
    reorderLayers,
    renameLayer,
    // キャンバスサイズ
    canvasSize,
    // 下書き機能
    hasSavedDraft,
    showDraftConfirm,
    useDraft,
    discardDraft,
    clearDraft,
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

  // 投稿成功時に下書きをクリア
  useEffect(() => {
    if (postSuccess) {
      clearDraft();
    }
  }, [postSuccess, clearDraft]);

  const handleSave = useCallback(() => {
    const svg = generateSvg();
    onSave(svg, message);
  }, [generateSvg, onSave, message]);

  const handlePost = useCallback(async () => {
    if (onPost) {
      const svg = generateSvg();
      const diffSvg = generateDiffSvg();
      const isExtend = !!baseImageSvg; // 描き足し元がある場合はtrue
      await onPost({
        svg,
        diffSvg,
        message,
        layers,
        canvasSize,
        templateId: selectedTemplate?.id || null,
        isExtend,
      });
    }
  }, [generateSvg, generateDiffSvg, onPost, message, layers, canvasSize, selectedTemplate, baseImageSvg]);

  return (
    <div className={styles.drawingCanvas}>
      {/* 下書き確認ダイアログ */}
      {showDraftConfirm && hasSavedDraft && (
        <div className={styles.draftConfirmOverlay}>
          <div className={styles.draftConfirmModal}>
            <h3 className={styles.draftConfirmTitle}>📝 下書きがあります</h3>
            <p className={styles.draftConfirmMessage}>
              前回の下書きが保存されています。<br />
              続きから描きますか？
            </p>
            <div className={styles.draftConfirmActions}>
              <button
                className={styles.draftConfirmButtonPrimary}
                onClick={useDraft}
              >
                ✏️ 下書きを使う
              </button>
              <button
                className={styles.draftConfirmButtonSecondary}
                onClick={discardDraft}
              >
                🗑️ 新規作成
              </button>
            </div>
          </div>
        </div>
      )}

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
        customColors={customColors}
        onToolChange={selectTool}
        onColorChange={setColor}
        onLineWidthChange={setLineWidth}
        onStampScaleChange={setStampScale}
        onMessageBoxChange={setMessageBox}
        onUndo={undo}
        onRedo={redo}
        onAddCustomColor={addCustomColor}
        onRemoveCustomColor={removeCustomColor}
      />

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

      {/* キャンバス */}
      <div 
        className={styles.canvasContainer}
        onTouchStart={handlePinchStart}
        onTouchMove={handlePinchMove}
        onTouchEnd={handlePinchEnd}
      >
        {/* 投稿成功オーバーレイ */}
        {postSuccess && (
          <div className={styles.successOverlay}>
            <div className={styles.successContent}>
              <div className={styles.successIcon}>🎉</div>
              <h3 className={styles.successTitle}>投稿完了！</h3>
              <p className={styles.successMessage}>あなたの作品が投稿されました</p>
              <div className={styles.successActions}>
                <button 
                  className={styles.successButtonPrimary}
                  onClick={() => {
                    clearCanvas();
                    onNewPost?.();
                  }}
                >
                  ✏️ もう一枚描く
                </button>
                <button 
                  className={styles.successButtonSecondary}
                  onClick={onGoHome}
                >
                  🏠 ホームに戻る
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ズームリセットボタン（ズーム中のみ表示） */}
        {zoomLevel !== 1 && (
          <button 
            className={styles.zoomResetButton}
            onClick={resetZoom}
            type="button"
          >
            🔍 {Math.round(zoomLevel * 100)}% → リセット
          </button>
        )}
        <div 
          className={styles.canvasWrapper}
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
            transformOrigin: 'center center',
          }}
        >
          {/* 背景SVG（キャンバスの後ろに配置、外部画像参照が正しく表示される） */}
          <div 
            className={styles.backgroundSvg}
            dangerouslySetInnerHTML={{ 
              __html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">${selectedTemplate.svg}</svg>` 
            }}
          />
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className={`${styles.canvas} ${tool === 'stamp' && (selectedStamp || selectedCustomEmoji) ? styles.stampCursor : ''} ${tool === 'text' ? styles.textMode : ''}`}
            style={{ pointerEvents: (tool === 'stamp' || tool === 'text') ? 'none' : 'auto' }}
            onPointerDown={tool !== 'text' && tool !== 'stamp' ? handlePointerDown : undefined}
            onPointerMove={tool !== 'text' && tool !== 'stamp' ? handlePointerMove : undefined}
            onPointerUp={tool !== 'text' && tool !== 'stamp' ? handlePointerUp : undefined}
            onPointerLeave={tool !== 'text' && tool !== 'stamp' ? handlePointerUp : undefined}
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
            {allPlacedStamps.map(stamp => {
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

      {/* レイヤーパネルとテキストオプションの横並びコンテナ */}
      <div className={styles.bottomSection}>
        {/* レイヤーパネル */}
        <LayerPanel
          layers={layers}
          activeLayerId={activeLayerId}
          onAddLayer={addLayer}
          onRemoveLayer={removeLayer}
          onSelectLayer={selectLayer}
          onToggleVisibility={toggleLayerVisibility}
          onToggleLock={toggleLayerLock}
          onSetOpacity={setLayerOpacity}
          onReorderLayers={reorderLayers}
          onRenameLayer={renameLayer}
        />

        {/* テキストモード時のオプション（キャンバスの下に配置） */}
        {tool === 'text' && (
          <div className={styles.textOptionsSection}>
            {/* テキストボックス操作 */}
            <div className={styles.textBoxControls}>
              <button
                className={styles.addTextBoxButton}
                onClick={addTextBox}
                title="テキストボックスを追加"
              >
                ➕ テキスト追加
              </button>
              {textBoxes.length > 0 && selectedTextBoxId && (
                <button
                  className={styles.removeTextBoxButton}
                  onClick={() => removeTextBox(selectedTextBoxId)}
                  title="選択中のテキストボックスを削除"
                >
                  🗑️ 削除
                </button>
              )}
              {textBoxes.length > 0 && (
                <span className={styles.textBoxLabel}>
                  {selectedTextBox 
                    ? `${textBoxes.findIndex(tb => tb.id === selectedTextBoxId) + 1}/${textBoxes.length}を編集中`
                    : `${textBoxes.length}個のテキスト`
                  }
                </span>
              )}
            </div>

            {/* フォント選択とテキスト入力（テキストボックス選択時のみ） */}
            {selectedTextBox && (
              <div className={styles.textEditSection}>
                <FontSelector
                  messageBox={messageBox}
                  fontCategory={fontCategory}
                  onMessageBoxChange={setMessageBox}
                  onFontCategoryChange={setFontCategory}
                />
                <textarea
                  className={styles.messageTextarea}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="メッセージを入力..."
                  rows={2}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* アクションボタン */}
      <div className={styles.actions}>
        <button onClick={clearCanvas} className={styles.clearButton}>
          クリア
        </button>
        <button 
          onClick={onPost ? handlePost : handleSave} 
          className={styles.saveButton}
          disabled={isPosting}
        >
          {isPosting ? '投稿中...' : '📤 投稿する'}
        </button>
      </div>
    </div>
  );
}
