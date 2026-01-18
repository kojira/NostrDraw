/**
 * プロフィール編集モーダル
 * 自分のプロフィールページから編集できる
 */

import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import type { NostrProfile } from '../../types';
import type { Event, EventTemplate } from 'nostr-tools';
import styles from './ProfileEditModal.module.css';

interface ProfileEditModalProps {
  profile: NostrProfile | null;
  isLoading: boolean;
  onSave: (profile: { name: string; about: string; picture: string }) => Promise<boolean>;
  onClose: () => void;
  signEvent: (event: EventTemplate) => Promise<Event>;
}

// 画像をWebPに変換してリサイズ
async function processImage(
  image: HTMLImageElement,
  crop: Crop,
  maxSize: number = 256,
  maxBytes: number = 60 * 1024
): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // クロップ座標をピクセル単位に変換
  let cropX: number, cropY: number, cropWidth: number, cropHeight: number;
  
  if (crop.unit === '%') {
    // パーセント単位の場合、元画像のサイズに対する比率で計算
    cropX = (crop.x / 100) * image.naturalWidth;
    cropY = (crop.y / 100) * image.naturalHeight;
    cropWidth = (crop.width / 100) * image.naturalWidth;
    cropHeight = (crop.height / 100) * image.naturalHeight;
  } else {
    // ピクセル単位の場合、表示サイズから元サイズにスケール
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    cropX = crop.x * scaleX;
    cropY = crop.y * scaleY;
    cropWidth = crop.width * scaleX;
    cropHeight = crop.height * scaleY;
  }

  // クロップサイズが0の場合はエラー
  if (cropWidth <= 0 || cropHeight <= 0) {
    console.error('Invalid crop size:', { cropWidth, cropHeight });
    return null;
  }

  canvas.width = maxSize;
  canvas.height = maxSize;

  ctx.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    maxSize,
    maxSize
  );

  let quality = 0.9;
  let blob: Blob | null = null;

  while (quality > 0.1) {
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', quality);
    });

    if (blob && blob.size <= maxBytes) {
      break;
    }
    quality -= 0.1;
  }

  return blob;
}

function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number
): Crop {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

export function ProfileEditModal({
  profile,
  isLoading,
  onSave,
  onClose,
  signEvent,
}: ProfileEditModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(profile?.display_name || profile?.name || '');
  const [about, setAbout] = useState(profile?.about || '');
  const [pictureUrl, setPictureUrl] = useState(profile?.picture || '');
  const [pictureMode, setPictureMode] = useState<'url' | 'upload' | 'keep'>('keep');
  
  // 画像クロップ関連
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError(t('profile.invalidImageType'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setCroppedBlob(null);
      setCroppedPreview(null);
      setPictureMode('upload');
    };
    reader.readAsDataURL(file);
  };

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, 1));
  }, []);

  const handleCropComplete = async () => {
    if (!imgRef.current || !crop) return;

    setIsProcessing(true);
    setError(null);

    try {
      const blob = await processImage(imgRef.current, crop);
      if (!blob) {
        setError(t('profile.imageProcessError'));
        return;
      }

      setCroppedBlob(blob);
      setCroppedPreview(URL.createObjectURL(blob));
    } catch {
      setError(t('profile.imageProcessError'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCropReset = () => {
    setCroppedBlob(null);
    setCroppedPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setImageSrc(null);
    setPictureMode('keep');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(t('profile.nameRequired'));
      return;
    }

    let finalPictureUrl = profile?.picture || '';

    if (pictureMode === 'url' && pictureUrl.trim()) {
      finalPictureUrl = pictureUrl.trim();
    } else if (pictureMode === 'upload' && croppedBlob) {
      setIsProcessing(true);
      try {
        const { uploadWithNip96 } = await import('../../services/imageUpload');
        const result = await uploadWithNip96(croppedBlob, signEvent);
        if (!result.success || !result.url) {
          setError(result.error || t('profile.uploadError'));
          setIsProcessing(false);
          return;
        }
        finalPictureUrl = result.url;
      } catch (err) {
        console.error('画像アップロードエラー:', err);
        setError(t('profile.uploadError'));
        setIsProcessing(false);
        return;
      }
      setIsProcessing(false);
    }

    const success = await onSave({
      name: name.trim(),
      about: about.trim(),
      picture: finalPictureUrl,
    });

    if (success) {
      onClose();
    } else {
      setError(t('profile.saveError'));
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>{t('profile.editTitle')}</h2>
          <button 
            className={styles.closeButton} 
            onClick={onClose}
            disabled={isLoading || isProcessing}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* 表示名 */}
          <div className={styles.field}>
            <label htmlFor="editProfileName" className={styles.label}>
              {t('profile.displayName')} <span className={styles.required}>*</span>
            </label>
            <input
              id="editProfileName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('profile.displayNamePlaceholder')}
              className={styles.input}
              disabled={isLoading || isProcessing}
              autoFocus
            />
          </div>

          {/* 自己紹介 */}
          <div className={styles.field}>
            <label htmlFor="editProfileAbout" className={styles.label}>
              {t('profile.aboutLabel')}
            </label>
            <textarea
              id="editProfileAbout"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder={t('profile.aboutPlaceholder')}
              className={styles.textarea}
              disabled={isLoading || isProcessing}
              rows={3}
            />
          </div>

          {/* プロフィール画像 */}
          <div className={styles.field}>
            <label className={styles.label}>{t('profile.pictureLabel')}</label>
            
            {/* 現在の画像プレビュー */}
            {pictureMode === 'keep' && profile?.picture && (
              <div className={styles.currentImage}>
                <img src={profile.picture} alt="" className={styles.currentImagePreview} />
                <p className={styles.keepHint}>{t('profile.keepCurrentImage')}</p>
              </div>
            )}

            {/* モード切り替え */}
            <div className={styles.modeSwitch}>
              {profile?.picture && (
                <button
                  type="button"
                  className={`${styles.modeButton} ${pictureMode === 'keep' ? styles.active : ''}`}
                  onClick={() => {
                    setPictureMode('keep');
                    setImageSrc(null);
                    setCroppedBlob(null);
                    setCroppedPreview(null);
                  }}
                >
                  <span className="material-symbols-outlined">check_circle</span>
                  {t('profile.keepImage')}
                </button>
              )}
              <button
                type="button"
                className={`${styles.modeButton} ${pictureMode === 'upload' ? styles.active : ''}`}
                onClick={() => setPictureMode('upload')}
              >
                <span className="material-symbols-outlined">upload</span>
                {t('profile.uploadImage')}
              </button>
              <button
                type="button"
                className={`${styles.modeButton} ${pictureMode === 'url' ? styles.active : ''}`}
                onClick={() => setPictureMode('url')}
              >
                <span className="material-symbols-outlined">link</span>
                {t('profile.enterUrl')}
              </button>
            </div>

            {pictureMode === 'url' && (
              <input
                type="url"
                value={pictureUrl}
                onChange={(e) => setPictureUrl(e.target.value)}
                placeholder={t('profile.urlPlaceholder')}
                className={styles.input}
                disabled={isLoading || isProcessing}
              />
            )}

            {pictureMode === 'upload' && (
              <div className={styles.uploadArea}>
                {!imageSrc && !croppedPreview && (
                  <div className={styles.dropzone}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className={styles.fileInput}
                      disabled={isLoading || isProcessing}
                    />
                    <span className="material-symbols-outlined">add_photo_alternate</span>
                    <p>{t('profile.selectImage')}</p>
                    <p className={styles.hint}>{t('profile.imageRequirements')}</p>
                  </div>
                )}

                {imageSrc && !croppedPreview && (
                  <div className={styles.cropContainer}>
                    <p className={styles.cropHint}>{t('profile.cropHint')}</p>
                    <ReactCrop
                      crop={crop}
                      onChange={(c) => setCrop(c)}
                      aspect={1}
                      circularCrop
                    >
                      <img
                        ref={imgRef}
                        src={imageSrc}
                        alt="Crop"
                        onLoad={onImageLoad}
                        className={styles.cropImage}
                      />
                    </ReactCrop>
                    <div className={styles.cropActions}>
                      <button
                        type="button"
                        onClick={handleCropReset}
                        className={styles.cancelButton}
                        disabled={isProcessing}
                      >
                        {t('profile.cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={handleCropComplete}
                        className={styles.confirmButton}
                        disabled={isProcessing}
                      >
                        {isProcessing ? t('profile.processing') : t('profile.confirmCrop')}
                      </button>
                    </div>
                  </div>
                )}

                {croppedPreview && (
                  <div className={styles.previewContainer}>
                    <img
                      src={croppedPreview}
                      alt="Preview"
                      className={styles.previewImage}
                    />
                    <button
                      type="button"
                      onClick={handleCropReset}
                      className={styles.changeButton}
                      disabled={isLoading || isProcessing}
                    >
                      <span className="material-symbols-outlined">edit</span>
                      {t('profile.changeImage')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* エラー表示 */}
          {error && <p className={styles.error}>{error}</p>}

          {/* ボタン */}
          <div className={styles.actions}>
            <button
              type="button"
              onClick={onClose}
              className={styles.cancelButton}
              disabled={isLoading || isProcessing}
            >
              {t('profile.cancel')}
            </button>
            <button
              type="submit"
              className={styles.saveButton}
              disabled={isLoading || isProcessing || !name.trim()}
            >
              {isLoading || isProcessing ? t('profile.saving') : t('profile.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
