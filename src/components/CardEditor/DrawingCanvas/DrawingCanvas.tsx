// お絵描きキャンバスコンポーネント（統合）

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDrawingCanvas } from './useDrawingCanvas';
import { TemplateSelector } from './TemplateSelector';
import { Toolbar } from './Toolbar';
import { StampPalette } from './StampPalette';
import { FontSelector } from './FontSelector';
import { LayerPanel } from './LayerPanel';
import { PaletteGallery } from '../../PaletteGallery';
import { STAMPS } from '../../../data/templates';
import type { DrawingCanvasProps, Template, GridSize } from './types';
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
  signEvent,
  userPubkey,
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
    // パレット管理
    palettes,
    activePaletteId,
    switchPalette,
    createPalette,
    deletePalette,
    renamePalette,
    savePaletteToCloud,
    syncFavoritePalettes,
    isSavingPaletteToNostr,
    canSaveToNostr,
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
    // ピクセルレイヤー機能
    pixelLayers,
    activePixelLayer,
    gridMode,
    gridSize,
    showGrid,
    addPixelLayer,
    paintPixel,
    startPixelPainting,
    endPixelPainting,
    fillPixels,
    toggleGridMode,
    changeGridSize,
    setShowGrid,
    // キャンバスサイズ
    canvasSize,
    // 下書き機能
    hasSavedDraft,
    showDraftConfirm,
    useDraft,
    discardDraft,
    clearDraft,
  } = useDrawingCanvas({ width, height, initialMessage, signEvent, userPubkey });

  // パレットギャラリーモーダル
  const [showPaletteGallery, setShowPaletteGallery] = useState(false);
  
  // グリッドサイズ変更確認ダイアログ
  const [showGridSizeDialog, setShowGridSizeDialog] = useState(false);
  const [pendingGridSize, setPendingGridSize] = useState<GridSize | null>(null);
  
  // ピクセルが描画されているか確認
  const hasPixelContent = useCallback(() => {
    if (!activePixelLayer) return false;
    return activePixelLayer.pixels.some(p => p !== 0);
  }, [activePixelLayer]);
  
  // グリッドサイズ変更のハンドラー（ダイアログ表示）
  const handleGridSizeChange = useCallback((newSize: GridSize) => {
    if (hasPixelContent() && activePixelLayer && activePixelLayer.gridSize !== newSize) {
      setPendingGridSize(newSize);
      setShowGridSizeDialog(true);
    } else {
      changeGridSize(newSize);
    }
  }, [hasPixelContent, activePixelLayer, changeGridSize]);
  
  // リサイズして変更
  const handleResizeAndChange = useCallback(() => {
    if (pendingGridSize && activePixelLayer) {
      // リサンプリングしてサイズ変更
      const oldSize = activePixelLayer.gridSize;
      const newPixels = new Uint8Array(pendingGridSize * pendingGridSize);
      
      for (let newY = 0; newY < pendingGridSize; newY++) {
        for (let newX = 0; newX < pendingGridSize; newX++) {
          const oldX = Math.floor((newX / pendingGridSize) * oldSize);
          const oldY = Math.floor((newY / pendingGridSize) * oldSize);
          const oldIndex = oldY * oldSize + oldX;
          const newIndex = newY * pendingGridSize + newX;
          newPixels[newIndex] = activePixelLayer.pixels[oldIndex];
        }
      }
      
      // useDrawingCanvasの関数を直接呼び出す代わりに、changeGridSizeを呼んでから手動でリサイズ
      // 注: これはuseDrawingCanvas側でリサイズ版を追加する必要あり
      changeGridSize(pendingGridSize, true); // resizeフラグ付き
    }
    setShowGridSizeDialog(false);
    setPendingGridSize(null);
  }, [pendingGridSize, activePixelLayer, changeGridSize]);
  
  // そのまま維持して新しいレイヤーを追加
  const handleKeepAndChange = useCallback(() => {
    if (pendingGridSize) {
      // 既存のピクセルレイヤーはそのまま維持し、新しいサイズで新しいレイヤーを追加
      // changeGridSizeは呼ばない（既存レイヤーを変更しない）
      addPixelLayer(undefined, pendingGridSize); // 明示的に新しいサイズを渡す
    }
    setShowGridSizeDialog(false);
    setPendingGridSize(null);
  }, [pendingGridSize, addPixelLayer]);
  
  // ダイアログをキャンセル
  const handleCancelGridChange = useCallback(() => {
    setShowGridSizeDialog(false);
    setPendingGridSize(null);
  }, []);

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
        palettes={palettes}
        activePaletteId={activePaletteId}
        onPaletteChange={switchPalette}
        onCreatePalette={createPalette}
        onDeletePalette={deletePalette}
        onRenamePalette={renamePalette}
        onSavePaletteToCloud={savePaletteToCloud}
        isSavingPaletteToNostr={isSavingPaletteToNostr}
        canSaveToNostr={canSaveToNostr}
        onOpenPaletteGallery={() => setShowPaletteGallery(true)}
        gridMode={gridMode}
        gridSize={activePixelLayer?.gridSize || gridSize}
        showGrid={showGrid}
        onToggleGridMode={toggleGridMode}
        onGridSizeChange={handleGridSizeChange}
        onToggleShowGrid={() => setShowGrid(!showGrid)}
        onAddPixelLayer={() => addPixelLayer()}
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
              __html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%" preserveAspectRatio="none">${selectedTemplate.svg}</svg>` 
            }}
          />
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className={`${styles.canvas} ${tool === 'stamp' && (selectedStamp || selectedCustomEmoji) ? styles.stampCursor : ''} ${tool === 'text' ? styles.textMode : ''}`}
            style={{ pointerEvents: (tool === 'stamp' || tool === 'text' || gridMode) ? 'none' : 'auto' }}
            onPointerDown={tool !== 'text' && tool !== 'stamp' && !gridMode ? handlePointerDown : undefined}
            onPointerMove={tool !== 'text' && tool !== 'stamp' && !gridMode ? handlePointerMove : undefined}
            onPointerUp={tool !== 'text' && tool !== 'stamp' && !gridMode ? handlePointerUp : undefined}
            onPointerLeave={tool !== 'text' && tool !== 'stamp' && !gridMode ? handlePointerUp : undefined}
          />
          
          {/* ピクセルレイヤー表示（正方形を維持してキャンバス中央に配置） */}
          {pixelLayers.filter(l => l.visible).map(layer => {
            // 正方形領域を計算（キャンバスの短辺に合わせる）
            const squareSize = Math.min(width, height);
            const leftOffset = (width - squareSize) / 2;
            const topOffset = (height - squareSize) / 2;
            const leftPercent = (leftOffset / width) * 100;
            const topPercent = (topOffset / height) * 100;
            const sizePercentW = (squareSize / width) * 100;
            const sizePercentH = (squareSize / height) * 100;
            const cellWidthPercent = 100 / layer.gridSize;
            const cellHeightPercent = 100 / layer.gridSize;
            
            return (
              <div
                key={layer.id}
                className={styles.pixelLayerCanvas}
                style={{
                  position: 'absolute',
                  left: `${leftPercent}%`,
                  top: `${topPercent}%`,
                  width: `${sizePercentW}%`,
                  height: `${sizePercentH}%`,
                  pointerEvents: 'none',
                }}
              >
                {/* ピクセルを描画 */}
                {Array.from({ length: layer.gridSize * layer.gridSize }).map((_, idx) => {
                  const colorIndex = layer.pixels[idx];
                  if (colorIndex === 0) return null; // 透明はスキップ
                  const x = idx % layer.gridSize;
                  const y = Math.floor(idx / layer.gridSize);
                  const color = layer.palette[colorIndex - 1] || '#000000';
                  return (
                    <div
                      key={idx}
                      style={{
                        position: 'absolute',
                        left: `${x * cellWidthPercent}%`,
                        top: `${y * cellHeightPercent}%`,
                        width: `${cellWidthPercent}%`,
                        height: `${cellHeightPercent}%`,
                        backgroundColor: color,
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
          
          {/* グリッドオーバーレイ（SVGで正確に描画、正方形を維持） */}
          {gridMode && showGrid && activePixelLayer && (() => {
            const layerGridSize = activePixelLayer.gridSize;
            
            // 正方形領域を計算
            const squareSize = Math.min(width, height);
            const leftOffset = (width - squareSize) / 2;
            const topOffset = (height - squareSize) / 2;
            const leftPercent = (leftOffset / width) * 100;
            const topPercent = (topOffset / height) * 100;
            const sizePercentW = (squareSize / width) * 100;
            const sizePercentH = (squareSize / height) * 100;
            
            // SVGでグリッド線を描画
            const gridLines: React.ReactNode[] = [];
            for (let i = 0; i <= layerGridSize; i++) {
              const pos = (i / layerGridSize) * 100;
              // 縦線
              gridLines.push(
                <line
                  key={`v-${i}`}
                  x1={`${pos}%`}
                  y1="0%"
                  x2={`${pos}%`}
                  y2="100%"
                  stroke="rgba(128, 128, 128, 0.4)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              );
              // 横線
              gridLines.push(
                <line
                  key={`h-${i}`}
                  x1="0%"
                  y1={`${pos}%`}
                  x2="100%"
                  y2={`${pos}%`}
                  stroke="rgba(128, 128, 128, 0.4)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              );
            }
            
            return (
              <svg
                className={styles.pixelGridOverlay}
                style={{
                  position: 'absolute',
                  left: `${leftPercent}%`,
                  top: `${topPercent}%`,
                  width: `${sizePercentW}%`,
                  height: `${sizePercentH}%`,
                  pointerEvents: 'none',
                }}
                preserveAspectRatio="none"
              >
                {gridLines}
              </svg>
            );
          })()}
          
          {/* ピクセル描画オーバーレイ（正方形を維持） */}
          {gridMode && activePixelLayer && (() => {
            const layerGridSize = activePixelLayer.gridSize;
            
            // 正方形領域を計算
            const squareSize = Math.min(width, height);
            const leftOffset = (width - squareSize) / 2;
            const topOffset = (height - squareSize) / 2;
            const leftPercent = (leftOffset / width) * 100;
            const topPercent = (topOffset / height) * 100;
            const sizePercentW = (squareSize / width) * 100;
            const sizePercentH = (squareSize / height) * 100;
            
            // DOM座標からピクセルグリッド座標に変換（レイヤーのgridSizeを使用）
            const getGridCoords = (e: React.PointerEvent<HTMLDivElement>) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const localX = e.clientX - rect.left;
              const localY = e.clientY - rect.top;
              const gridX = Math.floor((localX / rect.width) * layerGridSize);
              const gridY = Math.floor((localY / rect.height) * layerGridSize);
              return { gridX, gridY };
            };
            
            return (
              <div
                className={styles.pixelDrawOverlay}
                style={{
                  position: 'absolute',
                  left: `${leftPercent}%`,
                  top: `${topPercent}%`,
                  width: `${sizePercentW}%`,
                  height: `${sizePercentH}%`,
                  cursor: tool === 'pixelFill' ? 'crosshair' : 'default',
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  const { gridX, gridY } = getGridCoords(e);
                  
                  if (tool === 'pixelFill') {
                    fillPixels(gridX, gridY);
                  } else {
                    startPixelPainting();
                    paintPixel(gridX, gridY);
                  }
                }}
                onPointerMove={(e) => {
                  if (e.buttons !== 1 || tool === 'pixelFill') return;
                  e.preventDefault();
                  const { gridX, gridY } = getGridCoords(e);
                  paintPixel(gridX, gridY);
                }}
                onPointerUp={() => {
                  if (tool !== 'pixelFill') {
                    endPixelPainting();
                  }
                }}
                onPointerLeave={() => {
                  if (tool !== 'pixelFill') {
                    endPixelPainting();
                  }
                }}
              />
            );
          })()}
          
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

      {/* パレットギャラリーモーダル */}
      {showPaletteGallery && (
        <div className={styles.paletteGalleryModal}>
          <div className={styles.paletteGalleryContent}>
            <div className={styles.paletteGalleryHeader}>
              <h3>パレットギャラリー</h3>
              <button
                className={styles.paletteGalleryClose}
                onClick={() => setShowPaletteGallery(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <PaletteGallery 
              signEvent={signEvent}
              onFavoriteChange={() => {
                // お気に入りが変更されたらパレットを再読み込み
                syncFavoritePalettes();
              }}
            />
          </div>
        </div>
      )}

      {/* グリッドサイズ変更確認ダイアログ */}
      {showGridSizeDialog && pendingGridSize && (
        <div className={styles.dialogOverlay} onClick={handleCancelGridChange}>
          <div className={styles.dialogContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogHeader}>
              <span className="material-symbols-outlined" style={{ fontSize: '24px', color: 'var(--color-warning)' }}>
                warning
              </span>
              <h3 className={styles.dialogTitle}>グリッドサイズの変更</h3>
            </div>
            <p className={styles.dialogMessage}>
              現在のグリッドサイズ <strong>{activePixelLayer?.gridSize}×{activePixelLayer?.gridSize}</strong> から{' '}
              <strong>{pendingGridSize}×{pendingGridSize}</strong> に変更します。
            </p>
            <p className={styles.dialogSubMessage}>
              描画済みのピクセルをどのように処理しますか？
            </p>
            <div className={styles.dialogOptions}>
              <button
                className={styles.dialogOptionButton}
                onClick={handleResizeAndChange}
              >
                <span className="material-symbols-outlined">aspect_ratio</span>
                <div className={styles.dialogOptionText}>
                  <span className={styles.dialogOptionTitle}>リサイズする</span>
                  <span className={styles.dialogOptionDescription}>
                    新しいサイズに合わせてピクセルを拡大/縮小
                  </span>
                </div>
              </button>
              <button
                className={styles.dialogOptionButton}
                onClick={handleKeepAndChange}
              >
                <span className="material-symbols-outlined">layers</span>
                <div className={styles.dialogOptionText}>
                  <span className={styles.dialogOptionTitle}>そのまま残す</span>
                  <span className={styles.dialogOptionDescription}>
                    現在のレイヤーを保持し、新しいサイズのレイヤーを追加
                  </span>
                </div>
              </button>
            </div>
            <button
              className={styles.dialogCancelButton}
              onClick={handleCancelGridChange}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
