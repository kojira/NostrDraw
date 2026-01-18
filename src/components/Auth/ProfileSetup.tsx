/**
 * プロフィール設定コンポーネント
 * アカウント作成後に表示名、自己紹介、プロフィール画像を設定
 */

import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import type { EventTemplate, Event } from 'nostr-tools';
import styles from './ProfileSetup.module.css';

interface ProfileSetupProps {
  npub: string;
  isLoading: boolean;
  signEvent?: (event: EventTemplate) => Promise<Event>;
  onSave: (profile: { name: string; about: string; picture: string }) => Promise<boolean>;
  onSkip: () => void;
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

  // クロップ領域を計算
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const cropX = crop.x * scaleX;
  const cropY = crop.y * scaleY;
  const cropWidth = crop.width * scaleX;
  const cropHeight = crop.height * scaleY;

  // キャンバスサイズを設定（256x256）
  canvas.width = maxSize;
  canvas.height = maxSize;

  // クロップした画像を描画
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

  // WebPに変換（品質を調整して60KB以内に収める）
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

// 中央からアスペクト比1:1でクロップを初期化
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

export function ProfileSetup({
  npub,
  isLoading,
  signEvent,
  onSave,
  onSkip,
}: ProfileSetupProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [pictureUrl, setPictureUrl] = useState('');
  const [pictureMode, setPictureMode] = useState<'url' | 'upload'>('upload');
  
  // 画像クロップ関連
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // ファイル選択時
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
    };
    reader.readAsDataURL(file);
  };

  // 画像読み込み時にクロップを初期化
  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, 1));
  }, []);

  // クロップ確定
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
    } catch (err) {
      setError(t('profile.imageProcessError'));
    } finally {
      setIsProcessing(false);
    }
  };

  // クロップをやり直し
  const handleCropReset = () => {
    setCroppedBlob(null);
    setCroppedPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setImageSrc(null);
  };

  // 保存
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(t('profile.nameRequired'));
      return;
    }

    let finalPictureUrl = '';

    if (pictureMode === 'url' && pictureUrl.trim()) {
      finalPictureUrl = pictureUrl.trim();
    } else if (pictureMode === 'upload' && croppedBlob) {
      // 画像をアップロード
      if (!signEvent) {
        console.error('[ProfileSetup] signEvent is not available');
        setError(t('profile.uploadError') + ' (署名機能が利用できません)');
        return;
      }
      console.log('[ProfileSetup] Starting upload, blob size:', croppedBlob.size, 'type:', croppedBlob.type);
      setIsProcessing(true);
      try {
        const { uploadWithNip96 } = await import('../../services/imageUpload');
        const result = await uploadWithNip96(croppedBlob, signEvent);
        console.log('[ProfileSetup] Upload result:', result);
        if (!result.success || !result.url) {
          console.error('[ProfileSetup] Upload failed:', result.error);
          setError(t('profile.uploadError') + (result.error ? `: ${result.error}` : ''));
          setIsProcessing(false);
          return;
        }
        finalPictureUrl = result.url;
      } catch (err) {
        console.error('[ProfileSetup] Upload error:', err);
        setError(t('profile.uploadError') + `: ${err instanceof Error ? err.message : 'Unknown error'}`);
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

    if (!success) {
      setError(t('profile.saveError'));
    }
  };

  const shortenNpub = (npub: string) => {
    if (npub.length <= 20) return npub;
    return `${npub.slice(0, 12)}...${npub.slice(-8)}`;
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>{t('profile.setupTitle')}</h2>
      <p className={styles.subtitle}>{t('profile.setupSubtitle')}</p>

      <div className={styles.npubInfo}>
        <span className={styles.npubLabel}>npub:</span>
        <span className={styles.npub}>{shortenNpub(npub)}</span>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        {/* 表示名（必須） */}
        <div className={styles.field}>
          <label htmlFor="profileName" className={styles.label}>
            {t('profile.displayName')} <span className={styles.required}>*</span>
          </label>
          <input
            id="profileName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('profile.displayNamePlaceholder')}
            className={styles.input}
            disabled={isLoading || isProcessing}
            autoFocus
          />
        </div>

        {/* 自己紹介（任意） */}
        <div className={styles.field}>
          <label htmlFor="profileAbout" className={styles.label}>
            {t('profile.aboutLabel')}
          </label>
          <textarea
            id="profileAbout"
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
          
          {/* モード切り替え */}
          <div className={styles.modeSwitch}>
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

          {pictureMode === 'url' ? (
            <input
              type="url"
              value={pictureUrl}
              onChange={(e) => setPictureUrl(e.target.value)}
              placeholder={t('profile.urlPlaceholder')}
              className={styles.input}
              disabled={isLoading || isProcessing}
            />
          ) : (
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
                  <div className={styles.cropWrapper}>
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
                  </div>
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
            onClick={onSkip}
            className={styles.skipButton}
            disabled={isLoading || isProcessing}
          >
            {t('profile.skipForNow')}
          </button>
          <button
            type="submit"
            className={styles.saveButton}
            disabled={isLoading || isProcessing || !name.trim()}
          >
            {isLoading || isProcessing ? t('profile.saving') : t('profile.save')}
          </button>
        </div>

        <p className={styles.skipHint}>{t('profile.skipHint')}</p>
      </form>
    </div>
  );
}
