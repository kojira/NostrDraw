// ツールバーコンポーネント

import { useState } from 'react';
import type { ToolType, MessageBox } from './types';
import { COLORS } from './types';
import styles from './DrawingCanvas.module.css';

interface ToolbarProps {
  tool: ToolType;
  color: string;
  lineWidth: number;
  stampScale: number;
  messageBox: MessageBox;
  canUndo: boolean;
  canRedo: boolean;
  customColors: string[];
  onToolChange: (tool: ToolType) => void;
  onColorChange: (color: string) => void;
  onLineWidthChange: (width: number) => void;
  onStampScaleChange: (scale: number) => void;
  onMessageBoxChange: (box: MessageBox) => void;
  onUndo: () => void;
  onRedo: () => void;
  onAddCustomColor: (color: string) => void;
  onRemoveCustomColor: (color: string) => void;
}

export function Toolbar({
  tool,
  color,
  lineWidth,
  stampScale,
  messageBox,
  canUndo,
  canRedo,
  customColors,
  onToolChange,
  onColorChange,
  onLineWidthChange,
  onStampScaleChange,
  onMessageBoxChange,
  onUndo,
  onRedo,
  onAddCustomColor,
  onRemoveCustomColor,
}: ToolbarProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [pickerColor, setPickerColor] = useState(color);

  const handleColorPickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    setPickerColor(newColor);
    onColorChange(newColor);
  };

  const handleSaveColor = () => {
    onAddCustomColor(pickerColor);
    setShowColorPicker(false);
  };

  return (
    <div className={styles.toolbar}>
      {/* Undo/Redo */}
      <div className={styles.toolGroup}>
        <button
          className={`${styles.toolButton} ${!canUndo ? styles.disabled : ''}`}
          onClick={onUndo}
          disabled={!canUndo}
          title="元に戻す (Ctrl+Z)"
        >
          ↩️
        </button>
        <button
          className={`${styles.toolButton} ${!canRedo ? styles.disabled : ''}`}
          onClick={onRedo}
          disabled={!canRedo}
          title="やり直し (Ctrl+Shift+Z)"
        >
          ↪️
        </button>
      </div>

      {/* ツール選択 */}
      <div className={styles.toolGroup}>
        <button
          className={`${styles.toolButton} ${tool === 'pen' ? styles.active : ''}`}
          onClick={() => onToolChange('pen')}
          title="ペン"
        >
          ✏️
        </button>
        <button
          className={`${styles.toolButton} ${tool === 'eraser' ? styles.active : ''}`}
          onClick={() => onToolChange('eraser')}
          title="消しゴム"
        >
          🧹
        </button>
        <button
          className={`${styles.toolButton} ${tool === 'stamp' ? styles.active : ''}`}
          onClick={() => onToolChange('stamp')}
          title="スタンプ"
        >
          🖼️
        </button>
        <button
          className={`${styles.toolButton} ${tool === 'text' ? styles.active : ''}`}
          onClick={() => onToolChange('text')}
          title="メッセージ編集"
        >
          📝
        </button>
      </div>

      {/* 色選択（ペンモード時） */}
      {tool === 'pen' && (
        <div className={styles.colorPickerContainer}>
          <div className={styles.colorPicker}>
            {/* プリセットカラー */}
            {COLORS.map((c) => (
              <button
                key={c}
                className={`${styles.colorButton} ${color === c ? styles.active : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => onColorChange(c)}
                title={c}
              />
            ))}
            {/* カスタムカラー */}
            {customColors.map((c) => (
              <button
                key={c}
                className={`${styles.colorButton} ${styles.customColor} ${color === c ? styles.active : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => onColorChange(c)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onRemoveCustomColor(c);
                }}
                title={`${c} (右クリックで削除)`}
              />
            ))}
            {/* カラーピッカーボタン */}
            <button
              className={`${styles.colorButton} ${styles.colorPickerButton} ${showColorPicker ? styles.active : ''}`}
              onClick={() => setShowColorPicker(!showColorPicker)}
              title="カラーピッカー"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>palette</span>
            </button>
          </div>
          {/* カラーピッカーパネル */}
          {showColorPicker && (
            <div className={styles.colorPickerPanel}>
              <input
                type="color"
                value={pickerColor}
                onChange={handleColorPickerChange}
                className={styles.colorInput}
              />
              <button
                className={styles.saveColorButton}
                onClick={handleSaveColor}
                title="パレットに保存"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
                保存
              </button>
            </div>
          )}
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
            onChange={(e) => onLineWidthChange(Number(e.target.value))}
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
            onChange={(e) => onStampScaleChange(Number(e.target.value))}
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
              onChange={(e) => onMessageBoxChange({ ...messageBox, fontSize: Number(e.target.value) })}
              className={styles.sizeSlider}
            />
            <span className={styles.sizeLabel}>{messageBox.fontSize}px</span>
          </div>
          <div className={styles.colorPicker}>
            {/* プリセットカラー */}
            {COLORS.map((c) => (
              <button
                key={c}
                className={`${styles.colorButton} ${messageBox.color === c ? styles.active : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => onMessageBoxChange({ ...messageBox, color: c })}
                title={c}
              />
            ))}
            {/* カスタムカラー */}
            {customColors.map((c) => (
              <button
                key={c}
                className={`${styles.colorButton} ${styles.customColor} ${messageBox.color === c ? styles.active : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => onMessageBoxChange({ ...messageBox, color: c })}
                title={c}
              />
            ))}
            {/* カラーピッカー */}
            <input
              type="color"
              value={messageBox.color}
              onChange={(e) => onMessageBoxChange({ ...messageBox, color: e.target.value })}
              className={styles.colorInputSmall}
              title="カラーピッカー"
            />
          </div>
        </>
      )}
    </div>
  );
}

