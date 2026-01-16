// レイヤーパネルコンポーネント

import { useState, useCallback } from 'react';
import type { Layer } from './types';
import { MAX_LAYERS } from './types';
import styles from './LayerPanel.module.css';

// Material Symbols アイコンコンポーネント
const Icon = ({ name, size = 18 }: { name: string; size?: number }) => (
  <span className="material-symbols-outlined" style={{ fontSize: size }}>
    {name}
  </span>
);

interface LayerPanelProps {
  layers: Layer[];
  activeLayerId: string;
  onAddLayer: () => void;
  onRemoveLayer: (layerId: string) => void;
  onSelectLayer: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onToggleLock: (layerId: string) => void;
  onSetOpacity: (layerId: string, opacity: number) => void;
  onReorderLayers: (fromIndex: number, toIndex: number) => void;
  onRenameLayer: (layerId: string, name: string) => void;
}

export function LayerPanel({
  layers,
  activeLayerId,
  onAddLayer,
  onRemoveLayer,
  onSelectLayer,
  onToggleVisibility,
  onToggleLock,
  onSetOpacity,
  onReorderLayers,
  onRenameLayer,
}: LayerPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ layerId: string; layerName: string } | null>(null);

  const activeLayer = layers.find(l => l.id === activeLayerId);

  // 削除確認
  const handleDeleteClick = useCallback((layerId: string, layerName: string) => {
    setDeleteConfirm({ layerId, layerName });
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (deleteConfirm) {
      onRemoveLayer(deleteConfirm.layerId);
      setDeleteConfirm(null);
    }
  }, [deleteConfirm, onRemoveLayer]);

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirm(null);
  }, []);

  // ドラッグ開始
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  // ドラッグオーバー
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  // ドロップ
  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      onReorderLayers(draggedIndex, dropIndex);
    }
    setDraggedIndex(null);
  }, [draggedIndex, onReorderLayers]);

  // ドラッグ終了
  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
  }, []);

  // タッチでの並び替え（簡易版）
  const handleMoveUp = useCallback((index: number) => {
    if (index > 0) {
      onReorderLayers(index, index - 1);
    }
  }, [onReorderLayers]);

  const handleMoveDown = useCallback((index: number) => {
    if (index < layers.length - 1) {
      onReorderLayers(index, index + 1);
    }
  }, [layers.length, onReorderLayers]);

  // 名前編集開始
  const handleStartEdit = useCallback((layer: Layer) => {
    setEditingLayerId(layer.id);
    setEditingName(layer.name);
  }, []);

  // 名前編集確定
  const handleFinishEdit = useCallback(() => {
    if (editingLayerId && editingName.trim()) {
      onRenameLayer(editingLayerId, editingName.trim());
    }
    setEditingLayerId(null);
    setEditingName('');
  }, [editingLayerId, editingName, onRenameLayer]);

  // 名前編集キャンセル
  const handleCancelEdit = useCallback(() => {
    setEditingLayerId(null);
    setEditingName('');
  }, []);

  // レイヤーは上から下へ描画順（上が前面）なので、表示は逆順
  const reversedLayers = [...layers].reverse();

  return (
    <div className={`${styles.layerPanel} ${isCollapsed ? styles.collapsed : ''}`}>
      {/* ヘッダー */}
      <div className={styles.header}>
        <button
          className={styles.collapseButton}
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'レイヤーパネルを開く' : 'レイヤーパネルを閉じる'}
        >
          <Icon name={isCollapsed ? 'chevron_left' : 'chevron_right'} size={16} /> レイヤー
        </button>
        {!isCollapsed && (
          <button
            className={styles.addButton}
            onClick={onAddLayer}
            disabled={layers.length >= MAX_LAYERS}
            title={layers.length >= MAX_LAYERS ? `最大${MAX_LAYERS}レイヤーまで` : 'レイヤーを追加'}
          >
            <Icon name="add" size={18} />
          </button>
        )}
      </div>

      {/* レイヤーリスト */}
      {!isCollapsed && (
        <>
          <div className={styles.layerList}>
            {reversedLayers.map((layer, reversedIndex) => {
              const originalIndex = layers.length - 1 - reversedIndex;
              const isActive = layer.id === activeLayerId;
              const isDragging = draggedIndex === originalIndex;
              const isEditing = editingLayerId === layer.id;

              return (
                <div
                  key={layer.id}
                  className={`${styles.layerItem} ${isActive ? styles.active : ''} ${isDragging ? styles.dragging : ''} ${!layer.visible ? styles.hidden : ''} ${layer.locked ? styles.locked : ''}`}
                  draggable={!isEditing}
                  onDragStart={(e) => handleDragStart(e, originalIndex)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, originalIndex)}
                  onDragEnd={handleDragEnd}
                  onClick={() => !isEditing && onSelectLayer(layer.id)}
                >
                  {/* ドラッグハンドル */}
                  <div className={styles.dragHandle} title="ドラッグで並び替え">
                    <Icon name="drag_indicator" size={16} />
                  </div>

                  {/* レイヤー名 */}
                  <div className={styles.layerName}>
                    {isEditing ? (
                      <input
                        type="text"
                        className={styles.nameInput}
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={handleFinishEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleFinishEdit();
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(layer);
                        }}
                        title="ダブルクリックで名前変更"
                      >
                        {layer.name}
                      </span>
                    )}
                  </div>

                  {/* コントロールボタン */}
                  <div className={styles.controls}>
                    {/* 並び替えボタン（モバイル用） */}
                    <button
                      className={styles.moveButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveUp(originalIndex);
                      }}
                      disabled={originalIndex === layers.length - 1}
                      title="上に移動"
                    >
                      <Icon name="arrow_upward" size={14} />
                    </button>
                    <button
                      className={styles.moveButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveDown(originalIndex);
                      }}
                      disabled={originalIndex === 0}
                      title="下に移動"
                    >
                      <Icon name="arrow_downward" size={14} />
                    </button>

                    {/* 表示/非表示 */}
                    <button
                      className={`${styles.iconButton} ${layer.visible ? styles.on : styles.off}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleVisibility(layer.id);
                      }}
                      title={layer.visible ? '非表示にする' : '表示する'}
                    >
                      <Icon name={layer.visible ? 'visibility' : 'visibility_off'} size={16} />
                    </button>

                    {/* ロック */}
                    <button
                      className={`${styles.iconButton} ${layer.locked ? styles.on : styles.off}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleLock(layer.id);
                      }}
                      title={layer.locked ? 'ロック解除' : 'ロック'}
                    >
                      <Icon name={layer.locked ? 'lock' : 'lock_open'} size={16} />
                    </button>

                    {/* 削除 */}
                    <button
                      className={styles.deleteButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (layers.length > 1) {
                          handleDeleteClick(layer.id, layer.name);
                        }
                      }}
                      disabled={layers.length <= 1}
                      title={layers.length <= 1 ? '最後のレイヤーは削除できません' : 'レイヤーを削除'}
                    >
                      <Icon name="delete" size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 不透明度スライダー（アクティブレイヤー用） */}
          {activeLayer && (
            <div className={styles.opacityControl}>
              <label className={styles.opacityLabel}>
                不透明度: {Math.round(activeLayer.opacity * 100)}%
              </label>
              <input
                type="range"
                className={styles.opacitySlider}
                min="0"
                max="100"
                value={Math.round(activeLayer.opacity * 100)}
                onChange={(e) => onSetOpacity(activeLayerId, Number(e.target.value) / 100)}
              />
            </div>
          )}

          {/* レイヤー数表示 */}
          <div className={styles.layerCount}>
            {layers.length} / {MAX_LAYERS} レイヤー
          </div>
        </>
      )}

      {/* 削除確認モーダル */}
      {deleteConfirm && (
        <div className={styles.modalOverlay} onClick={handleCancelDelete}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <Icon name="warning" size={24} />
              <span>レイヤーの削除</span>
            </div>
            <div className={styles.modalBody}>
              <p>「{deleteConfirm.layerName}」を削除しますか？</p>
              <p className={styles.modalWarning}>この操作は取り消せません。</p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.modalCancelButton} onClick={handleCancelDelete}>
                キャンセル
              </button>
              <button className={styles.modalDeleteButton} onClick={handleConfirmDelete}>
                <Icon name="delete" size={16} />
                削除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
