// ツールバーコンポーネント

import { useState } from 'react';
import type { ToolType, MessageBox } from './types';
import { COLORS } from './types';
import styles from './DrawingCanvas.module.css';

// パレット型
interface Palette {
  id: string;
  name: string;
  colors: string[];
}

interface ToolbarProps {
  tool: ToolType;
  color: string;
  lineWidth: number;
  stampScale: number;
  messageBox: MessageBox;
  canUndo: boolean;
  canRedo: boolean;
  customColors: string[];
  // パレット管理
  palettes?: Palette[];
  activePaletteId?: string;
  onPaletteChange?: (paletteId: string) => void;
  onCreatePalette?: (name: string) => void;
  onDeletePalette?: (paletteId: string) => void;
  onRenamePalette?: (paletteId: string, name: string) => void;
  onSavePaletteToCloud?: (paletteId?: string, overrideName?: string) => Promise<boolean>;
  isSavingPaletteToNostr?: boolean;
  canSaveToNostr?: boolean;
  onOpenPaletteGallery?: () => void;
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
  palettes = [],
  activePaletteId,
  onPaletteChange,
  onCreatePalette,
  onDeletePalette,
  onRenamePalette,
  onSavePaletteToCloud,
  isSavingPaletteToNostr,
  canSaveToNostr,
  onOpenPaletteGallery,
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
  const [showCustomColors, setShowCustomColors] = useState(false);
  const [showPaletteMenu, setShowPaletteMenu] = useState(false);
  const [newPaletteName, setNewPaletteName] = useState('');
  const [editingPaletteId, setEditingPaletteId] = useState<string | null>(null);
  const [editingPaletteName, setEditingPaletteName] = useState('');
  const [pickerColor, setPickerColor] = useState(color);
  // Nostr保存時の名前入力用
  const [showSaveNameInput, setShowSaveNameInput] = useState(false);
  const [saveNameInput, setSaveNameInput] = useState('');

  const handleCreatePalette = () => {
    if (newPaletteName.trim() && onCreatePalette) {
      onCreatePalette(newPaletteName.trim());
      setNewPaletteName('');
      setShowPaletteMenu(false);
    }
  };

  const handleStartEditName = (p: Palette) => {
    setEditingPaletteId(p.id);
    setEditingPaletteName(p.name);
  };

  const handleSaveEditName = () => {
    if (editingPaletteId && editingPaletteName.trim() && onRenamePalette) {
      onRenamePalette(editingPaletteId, editingPaletteName.trim());
    }
    setEditingPaletteId(null);
    setEditingPaletteName('');
  };

  const handleSaveToCloud = async () => {
    if (!onSavePaletteToCloud) return;
    
    const activePalette = palettes.find(p => p.id === activePaletteId);
    
    // 新規パレット名の入力欄に名前が入っている場合は、その名前を使って保存
    if (newPaletteName.trim()) {
      await onSavePaletteToCloud(undefined, newPaletteName.trim());
      setNewPaletteName('');
      return;
    }
    
    // デフォルトパレット（名前が「デフォルト」）の場合は名前入力を促す
    if (activePaletteId === 'default' && activePalette?.name === 'デフォルト') {
      setShowSaveNameInput(true);
      setSaveNameInput('');
      return;
    }
    
    await onSavePaletteToCloud();
  };

  const handleSaveWithName = async () => {
    if (!onSavePaletteToCloud || !saveNameInput.trim()) return;
    
    // 名前を直接渡して保存（状態更新を待つ必要なし）
    await onSavePaletteToCloud(undefined, saveNameInput.trim());
    setShowSaveNameInput(false);
    setSaveNameInput('');
  };

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
          {/* プリセットカラー */}
          <div className={styles.colorPicker}>
            {COLORS.map((c) => (
              <button
                key={c}
                className={`${styles.colorButton} ${color === c ? styles.active : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => onColorChange(c)}
                title={c}
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
          
          {/* カスタムカラーパレット（折りたたみ式） */}
          <div className={styles.customColorSection}>
            <div className={styles.paletteHeader}>
              <button 
                className={styles.customColorToggle}
                onClick={() => setShowCustomColors(!showCustomColors)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                  {showCustomColors ? 'expand_less' : 'expand_more'}
                </span>
                <span>マイカラー ({customColors.length})</span>
              </button>
              {onPaletteChange && (
                <button
                  className={styles.paletteMenuButton}
                  onClick={() => setShowPaletteMenu(!showPaletteMenu)}
                  title="パレット管理"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                    palette
                  </span>
                </button>
              )}
            </div>
            
            {/* パレット切り替えメニュー */}
            {showPaletteMenu && onPaletteChange && (
              <div className={styles.paletteMenu}>
                {palettes.map((p) => (
                  <div key={p.id} className={styles.paletteMenuItem}>
                    {editingPaletteId === p.id ? (
                      <div className={styles.paletteEditForm}>
                        <input
                          type="text"
                          value={editingPaletteName}
                          onChange={(e) => setEditingPaletteName(e.target.value)}
                          className={styles.newPaletteInput}
                          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleSaveEditName()}
                          autoFocus
                        />
                        <button
                          className={styles.newPaletteButton}
                          onClick={handleSaveEditName}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>check</span>
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          className={`${styles.paletteSelectButton} ${p.id === activePaletteId ? styles.active : ''}`}
                          onClick={() => {
                            onPaletteChange(p.id);
                            setShowPaletteMenu(false);
                          }}
                        >
                          {p.name} ({p.colors.length})
                        </button>
                        {onRenamePalette && (
                          <button
                            className={styles.paletteActionButton}
                            onClick={() => handleStartEditName(p)}
                            title="名前変更"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>edit</span>
                          </button>
                        )}
                        {p.id !== 'default' && onDeletePalette && (
                          <button
                            className={styles.paletteDeleteButton}
                            onClick={() => onDeletePalette(p.id)}
                            title="削除"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>close</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ))}
                {/* 新規パレット作成 */}
                {onCreatePalette && (
                  <div className={styles.newPaletteForm}>
                    <input
                      type="text"
                      value={newPaletteName}
                      onChange={(e) => setNewPaletteName(e.target.value)}
                      placeholder="新規パレット名"
                      className={styles.newPaletteInput}
                      onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleCreatePalette()}
                    />
                    <button
                      className={styles.newPaletteButton}
                      onClick={handleCreatePalette}
                      disabled={!newPaletteName.trim()}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add</span>
                    </button>
                  </div>
                )}
                {/* Nostr保存ボタン（常に表示） */}
                {canSaveToNostr && onSavePaletteToCloud && (
                  <>
                    {showSaveNameInput ? (
                      <div className={styles.saveNameForm}>
                        <input
                          type="text"
                          value={saveNameInput}
                          onChange={(e) => setSaveNameInput(e.target.value)}
                          placeholder="パレット名を入力"
                          className={styles.newPaletteInput}
                          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleSaveWithName()}
                          autoFocus
                        />
                        <button
                          className={styles.newPaletteButton}
                          onClick={handleSaveWithName}
                          disabled={!saveNameInput.trim() || isSavingPaletteToNostr}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                            {isSavingPaletteToNostr ? 'hourglass_empty' : 'cloud_upload'}
                          </span>
                        </button>
                        <button
                          className={styles.paletteDeleteButton}
                          onClick={() => setShowSaveNameInput(false)}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>close</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        className={styles.cloudSaveButton}
                        onClick={handleSaveToCloud}
                        disabled={isSavingPaletteToNostr}
                        title="Nostrに保存して公開"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                          {isSavingPaletteToNostr ? 'hourglass_empty' : 'cloud_upload'}
                        </span>
                        {isSavingPaletteToNostr ? '保存中...' : 'Nostrに公開'}
                      </button>
                    )}
                  </>
                )}
                {/* パレットギャラリー */}
                {onOpenPaletteGallery && (
                  <button
                    className={styles.galleryButton}
                    onClick={() => {
                      setShowPaletteMenu(false);
                      onOpenPaletteGallery();
                    }}
                    title="パレットギャラリーを開く"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                      explore
                    </span>
                    ギャラリーからインポート
                  </button>
                )}
              </div>
            )}
            
            {showCustomColors && customColors.length > 0 && (
              <div className={styles.customColorGrid}>
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
              </div>
            )}
            {showCustomColors && customColors.length === 0 && (
              <div className={styles.emptyPalette}>
                カラーピッカーで色を保存してください
              </div>
            )}
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

