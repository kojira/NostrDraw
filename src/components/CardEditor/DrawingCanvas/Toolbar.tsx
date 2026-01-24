// ツールバーコンポーネント

import { useState, useMemo } from 'react';
import type { ToolType, MessageBox, GridSize } from './types';
import { COLORS } from './types';
import styles from './DrawingCanvas.module.css';
import { PRESET_PALETTES, getFavoritePaletteIds } from '../../../services/palette';

// パレット型
interface Palette {
  id: string;
  name: string;
  colors: string[];
  authorPubkey?: string;
  authorPicture?: string;
  eventId?: string; // お気に入りからインポートした場合のイベントID
  isPreset?: boolean; // プリセットパレットかどうか
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
  // ユーザー情報
  userPubkey?: string | null;
  // 背景色
  backgroundColor?: string;
  onBackgroundColorChange?: (color: string) => void;
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
  // グリッドモード
  gridMode?: boolean;
  gridSize?: GridSize;
  showGrid?: boolean;
  onToggleGridMode?: () => void;
  onGridSizeChange?: (size: GridSize) => void;
  onToggleShowGrid?: () => void;
  onAddPixelLayer?: () => void;
  // ツール変更
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
  userPubkey,
  backgroundColor = '#ffffff',
  onBackgroundColorChange,
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
  gridMode = false,
  gridSize = 32,
  showGrid = true,
  onToggleGridMode,
  onGridSizeChange,
  onToggleShowGrid,
  onAddPixelLayer,
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
  const [showBgColorPicker, setShowBgColorPicker] = useState(false);
  const [bgPickerColor, setBgPickerColor] = useState(backgroundColor);

  // お気に入りのプリセットパレットを取得
  const favoritePresetPalettes = useMemo(() => {
    const favoriteIds = getFavoritePaletteIds(userPubkey || undefined);
    return PRESET_PALETTES.filter(p => favoriteIds.includes(p.id)).map(p => ({
      ...p,
      isPreset: true,
    }));
  }, [showPaletteMenu, userPubkey]); // パレットメニューを開くたびに再取得

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

  const handlePublishPalette = async () => {
    if (!onSavePaletteToCloud || !newPaletteName.trim()) return;
    
    await onSavePaletteToCloud(undefined, newPaletteName.trim());
    setNewPaletteName('');
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
        {/* グリッドモードトグル */}
        <button
          className={`${styles.toolButton} ${gridMode ? styles.active : ''}`}
          onClick={onToggleGridMode}
          title={gridMode ? 'グリッドモード OFF' : 'グリッドモード ON'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>grid_on</span>
        </button>
      </div>

      {/* 背景色選択 */}
      {onBackgroundColorChange && (
        <div className={styles.toolGroup}>
          <span className={styles.bgLabel}>背景:</span>
          <button
            className={`${styles.colorButton} ${styles.bgColorButton} ${backgroundColor === '#ffffff' ? styles.active : ''}`}
            style={{ backgroundColor: '#ffffff', border: '1px solid #ccc' }}
            onClick={() => onBackgroundColorChange('#ffffff')}
            title="白"
          />
          <button
            className={`${styles.colorButton} ${styles.bgColorButton} ${backgroundColor === '#000000' ? styles.active : ''}`}
            style={{ backgroundColor: '#000000' }}
            onClick={() => onBackgroundColorChange('#000000')}
            title="黒"
          />
          <div className={styles.bgColorPickerWrapper}>
            <button
              className={`${styles.colorButton} ${styles.bgColorButton} ${showBgColorPicker ? styles.active : ''}`}
              style={{ 
                background: `linear-gradient(135deg, #ff6b6b, #ffd93d, #6bcb77, #4d96ff, #9b5de5)`,
              }}
              onClick={() => setShowBgColorPicker(!showBgColorPicker)}
              title="その他の色"
            >
              <span style={{ fontSize: '10px' }}>▼</span>
            </button>
            {showBgColorPicker && (
              <div className={styles.bgColorPickerPanel}>
                <div className={styles.bgColorSection}>
                  <span className={styles.bgColorSectionLabel}>プリセット</span>
                  <div className={styles.bgColorPresets}>
                    {[
                      // 淡い色
                      '#f5f5dc', '#ffe4e1', '#e0ffff', '#f0fff0',
                      // 鮮やかな色
                      '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
                      // 濃い色
                      '#2d3436', '#6c5ce7', '#e17055', '#00b894',
                    ].map((c) => (
                      <button
                        key={c}
                        className={`${styles.colorButton} ${backgroundColor === c ? styles.active : ''}`}
                        style={{ backgroundColor: c }}
                        onClick={() => {
                          onBackgroundColorChange(c);
                          setShowBgColorPicker(false);
                        }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
                <div className={styles.bgColorSection}>
                  <span className={styles.bgColorSectionLabel}>8bit パレット</span>
                  <div className={styles.bgColorPresets}>
                    {[
                      // ファミコンパレットから代表的な背景色
                      '#000000', '#7C7C7C', '#BCBCBC', '#F8F8F8',
                      '#0000FC', '#3CBCFC', '#F83800', '#F87858',
                      '#00B800', '#58D854', '#F8B800', '#F8D878',
                    ].map((c) => (
                      <button
                        key={c}
                        className={`${styles.colorButton} ${backgroundColor === c ? styles.active : ''}`}
                        style={{ backgroundColor: c }}
                        onClick={() => {
                          onBackgroundColorChange(c);
                          setShowBgColorPicker(false);
                        }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
                {customColors.length > 0 && (
                  <div className={styles.bgColorSection}>
                    <span className={styles.bgColorSectionLabel}>マイパレット</span>
                    <div className={styles.bgColorPresets}>
                      {customColors.map((c) => (
                        <button
                          key={c}
                          className={`${styles.colorButton} ${backgroundColor === c ? styles.active : ''}`}
                          style={{ backgroundColor: c }}
                          onClick={() => {
                            onBackgroundColorChange(c);
                            setShowBgColorPicker(false);
                          }}
                          title={c}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div className={styles.bgColorSection}>
                  <span className={styles.bgColorSectionLabel}>カスタム</span>
                  <div className={styles.bgColorCustom}>
                    <input
                      type="color"
                      value={bgPickerColor}
                      onChange={(e) => setBgPickerColor(e.target.value)}
                      className={styles.colorInputSmall}
                    />
                    <button
                      className={styles.bgColorApplyButton}
                      onClick={() => {
                        onBackgroundColorChange(bgPickerColor);
                        setShowBgColorPicker(false);
                      }}
                    >
                      適用
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* グリッドモードUI */}
      {gridMode && (
        <div className={styles.toolGroup}>
          {/* ピクセルツール */}
          <button
            className={`${styles.toolButton} ${tool === 'pixel' ? styles.active : ''}`}
            onClick={() => onToolChange('pixel')}
            title="ピクセルペン"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span>
          </button>
          <button
            className={`${styles.toolButton} ${tool === 'pixelEraser' ? styles.active : ''}`}
            onClick={() => onToolChange('pixelEraser')}
            title="ピクセル消しゴム"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>ink_eraser</span>
          </button>
          <button
            className={`${styles.toolButton} ${tool === 'pixelFill' ? styles.active : ''}`}
            onClick={() => onToolChange('pixelFill')}
            title="塗りつぶし"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>format_color_fill</span>
          </button>
          {/* グリッド表示トグル */}
          <button
            className={`${styles.toolButton} ${showGrid ? styles.active : ''}`}
            onClick={onToggleShowGrid}
            title={showGrid ? 'グリッド非表示' : 'グリッド表示'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>grid_view</span>
          </button>
          {/* グリッドサイズ選択 */}
          <select
            className={styles.gridSizeSelect}
            value={gridSize}
            onChange={(e) => onGridSizeChange?.(parseInt(e.target.value) as GridSize)}
            title="グリッドサイズ"
          >
            <option value={16}>16×16</option>
            <option value={24}>24×24</option>
            <option value={32}>32×32</option>
            <option value={48}>48×48</option>
            <option value={64}>64×64</option>
          </select>
          {/* 新しいピクセルレイヤー追加 */}
          <button
            className={styles.toolButton}
            onClick={onAddPixelLayer}
            title="新しいドット絵レイヤー"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
          </button>
        </div>
      )}

      {/* 色選択（ペンモード・ピクセルモード時） */}
      {(tool === 'pen' || tool === 'pixel' || tool === 'pixelFill') && (
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
                <span className={styles.paletteName}>
                  {(() => {
                    const activePalette = palettes.find(p => p.id === activePaletteId);
                    const name = activePalette?.name || 'マイカラー';
                    return name.length > 10 ? name.slice(0, 10) + '…' : name;
                  })()}
                  {' '}({customColors.length})
                </span>
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
                {/* ローカルパレット（eventIdがないもの） */}
                {palettes.filter(p => !p.eventId).map((p) => (
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
                
                {/* お気に入りパレットがある場合は仕切り線を表示 */}
                {(palettes.some(p => p.eventId) || favoritePresetPalettes.length > 0) && (
                  <div className={styles.paletteDivider}>
                    <span className="material-symbols-outlined" style={{ fontSize: '12px', fontVariationSettings: "'FILL' 1" }}>star</span>
                    <span>お気に入り</span>
                  </div>
                )}
                
                {/* お気に入りのプリセットパレット */}
                {favoritePresetPalettes.map((p) => (
                  <div key={p.id} className={styles.paletteMenuItem}>
                    <button
                      className={`${styles.paletteSelectButton} ${p.id === activePaletteId ? styles.active : ''}`}
                      onClick={() => {
                        onPaletteChange(p.id);
                        setShowPaletteMenu(false);
                      }}
                    >
                      <span className={styles.presetBadge}>プリセット</span>
                      {p.name} ({p.colors.length})
                    </button>
                  </div>
                ))}
                
                {/* お気に入りパレット（eventIdがあるもの） */}
                {palettes.filter(p => p.eventId).map((p) => (
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
                          {p.authorPicture && (
                            <img 
                              src={p.authorPicture} 
                              alt="" 
                              className={styles.paletteAuthorAvatar}
                            />
                          )}
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
                        {onDeletePalette && (
                          <button
                            className={`${styles.paletteDeleteButton} ${styles.favoriteButton}`}
                            onClick={() => onDeletePalette(p.id)}
                            title="お気に入りを解除"
                          >
                            <span 
                              className="material-symbols-outlined" 
                              style={{ fontSize: '12px', fontVariationSettings: "'FILL' 1" }}
                            >
                              star
                            </span>
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
                      onInput={(e) => setNewPaletteName((e.target as HTMLInputElement).value)}
                      placeholder="パレット名"
                      className={styles.newPaletteInput}
                      onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleCreatePalette()}
                    />
                    <button
                      className={styles.newPaletteButton}
                      onClick={handleCreatePalette}
                      disabled={!newPaletteName.trim()}
                      title="ローカルに保存"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add</span>
                    </button>
                  </div>
                )}
                {/* パレットを公開 */}
                {canSaveToNostr && onSavePaletteToCloud && (
                  <button
                    className={styles.publishPaletteButton}
                    onClick={handlePublishPalette}
                    disabled={!newPaletteName.trim() || isSavingPaletteToNostr}
                  >
                    {isSavingPaletteToNostr ? '公開中...' : 'パレットを公開'}
                  </button>
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
                    パレットギャラリー
                  </button>
                )}
              </div>
            )}
            
            {showCustomColors && customColors.length > 0 && (
              <div className={styles.customColorGrid}>
                {customColors.map((c) => (
                  <button
                    key={c}
                    className={`${styles.colorButton} ${styles.paletteColor} ${styles.customColor} ${color === c ? styles.active : ''}`}
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

