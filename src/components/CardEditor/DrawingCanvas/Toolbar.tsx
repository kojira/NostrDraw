// ツールバーコンポーネント

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
  onToolChange: (tool: ToolType) => void;
  onColorChange: (color: string) => void;
  onLineWidthChange: (width: number) => void;
  onStampScaleChange: (scale: number) => void;
  onMessageBoxChange: (box: MessageBox) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function Toolbar({
  tool,
  color,
  lineWidth,
  stampScale,
  messageBox,
  canUndo,
  canRedo,
  onToolChange,
  onColorChange,
  onLineWidthChange,
  onStampScaleChange,
  onMessageBoxChange,
  onUndo,
  onRedo,
}: ToolbarProps) {
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
        <div className={styles.colorPicker}>
          {COLORS.map((c) => (
            <button
              key={c}
              className={`${styles.colorButton} ${color === c ? styles.active : ''}`}
              style={{ backgroundColor: c }}
              onClick={() => onColorChange(c)}
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
            {COLORS.map((c) => (
              <button
                key={c}
                className={`${styles.colorButton} ${messageBox.color === c ? styles.active : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => onMessageBoxChange({ ...messageBox, color: c })}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

