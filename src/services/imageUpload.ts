// 画像アップロードサービス（NIP-96/NIP-98対応）

import type { ImageUploadConfig } from '../types';
import type { EventTemplate, Event } from 'nostr-tools';

// NIP-96対応サーバーリスト
const NIP96_SERVERS = [
  {
    name: 'yabu.me',
    api: 'https://share.yabu.me/api/v2/media',
    fieldName: 'file',
    parseResponse: (data: { status?: string; nip94_event?: { tags?: string[][] }; data?: Array<{ url?: string }> }) => {
      // NIP-94形式
      if (data.status === 'success' && data.nip94_event?.tags) {
        const urlTag = data.nip94_event.tags.find((t: string[]) => t[0] === 'url');
        if (urlTag?.[1]) return urlTag[1];
      }
      // 別の形式
      if (data.status === 'success' && data.data?.[0]?.url) {
        return data.data[0].url;
      }
      return null;
    },
  },
  {
    name: 'nostr.build',
    api: 'https://nostr.build/api/v2/upload/files',
    fieldName: 'file',
    parseResponse: (data: { status?: string; data?: Array<{ url?: string }> }) => {
      if (data.status === 'success' && data.data?.[0]?.url) {
        return data.data[0].url;
      }
      return null;
    },
  },
  {
    name: 'nostrcheck.me',
    api: 'https://nostrcheck.me/api/v2/media',
    fieldName: 'mediafile',
    parseResponse: (data: { status?: string; nip94_event?: { tags?: string[][] } }) => {
      if (data.status === 'success' && data.nip94_event?.tags) {
        const urlTag = data.nip94_event.tags.find((t: string[]) => t[0] === 'url');
        return urlTag?.[1];
      }
      return null;
    },
  },
];

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1秒

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

// NIP-98認証イベントを作成
function createAuthEvent(url: string, method: string): EventTemplate {
  return {
    kind: 27235, // NIP-98 HTTP Auth
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', url],
      ['method', method],
    ],
    content: '',
  };
}

// 指定時間待機
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 処理完了を待つ（202レスポンスの場合）
async function waitForProcessing(
  processingUrl: string,
  signEvent: (event: EventTemplate) => Promise<Event>,
  maxWaitTime: number = 30000
): Promise<string | null> {
  const startTime = Date.now();
  const pollInterval = 1000; // 1秒間隔

  while (Date.now() - startTime < maxWaitTime) {
    try {
      // 認証イベントを作成
      const authTemplate = createAuthEvent(processingUrl, 'GET');
      const signedAuth = await signEvent(authTemplate);
      const authHeader = 'Nostr ' + btoa(JSON.stringify(signedAuth));

      const response = await fetch(processingUrl, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
        },
      });

      console.log(`[Processing] Status: ${response.status}`);

      // 200または201は成功
      if (response.status === 200 || response.status === 201) {
        const data = await response.json();
        console.log(`[Processing] Complete:`, data);
        
        // NIP-94形式からURLを取得
        if (data.nip94_event?.tags) {
          const urlTag = data.nip94_event.tags.find((t: string[]) => t[0] === 'url');
          if (urlTag?.[1]) {
            return urlTag[1];
          }
        }
        if (data.url) {
          return data.url;
        }
      }

      // まだ処理中の場合は待機
      if (response.status === 202) {
        console.log(`[Processing] Still processing, waiting...`);
        await sleep(pollInterval);
        continue;
      }

      // その他のエラー
      break;
    } catch (error) {
      console.error(`[Processing] Error:`, error);
      break;
    }
  }

  return null;
}

// 単一サーバーへのアップロード（リトライ付き）
async function uploadToServer(
  server: typeof NIP96_SERVERS[0],
  file: File | Blob,
  signEvent: (event: EventTemplate) => Promise<Event>
): Promise<UploadResult> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[${server.name}] Attempt ${attempt}/${MAX_RETRIES}`);
      
      // 毎回新しい認証イベントを作成（created_atを更新）
      const authTemplate = createAuthEvent(server.api, 'POST');
      const signedAuth = await signEvent(authTemplate);
      
      const authHeader = 'Nostr ' + btoa(JSON.stringify(signedAuth));

      const formData = new FormData();
      formData.append(server.fieldName, file, 'image.png');

      const response = await fetch(server.api, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
        },
        body: formData,
      });

      console.log(`[${server.name}] Response status: ${response.status}`);
      
      const responseText = await response.text();
      console.log(`[${server.name}] Response body: ${responseText}`);

      // 500エラーの場合はリトライ
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        console.log(`[${server.name}] Server error, retrying in ${RETRY_DELAY}ms...`);
        await sleep(RETRY_DELAY * attempt); // 徐々に待機時間を増やす
        continue;
      }

      if (!response.ok && response.status !== 202) {
        return {
          success: false,
          error: `${response.status} - ${responseText}`,
        };
      }

      const data = JSON.parse(responseText);
      
      // 202 Accepted - 処理中の場合はポーリング
      if (response.status === 202 && data.processing_url) {
        console.log(`[${server.name}] File enqueued, waiting for processing...`);
        const finalUrl = await waitForProcessing(data.processing_url, signEvent);
        if (finalUrl) {
          console.log(`[${server.name}] Processing complete: ${finalUrl}`);
          return { success: true, url: finalUrl };
        }
        
        // ポーリングで取得できなかった場合、レスポンスのURLを使う
        const urlFromResponse = server.parseResponse(data);
        if (urlFromResponse) {
          console.log(`[${server.name}] Using URL from response: ${urlFromResponse}`);
          return { success: true, url: urlFromResponse };
        }
        
        return {
          success: false,
          error: 'Processing timeout',
        };
      }

      const url = server.parseResponse(data);
      
      if (url) {
        console.log(`[${server.name}] Upload success: ${url}`);
        return { success: true, url };
      }

      return {
        success: false,
        error: 'Unexpected response format',
      };
    } catch (error) {
      console.error(`[${server.name}] Error:`, error);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY * attempt);
        continue;
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  
  return {
    success: false,
    error: 'Max retries exceeded',
  };
}

// NIP-96/NIP-98を使用したアップロード（複数サーバー + リトライ）
export async function uploadWithNip96(
  file: File | Blob,
  signEvent: (event: EventTemplate) => Promise<Event>
): Promise<UploadResult> {
  const errors: string[] = [];

  for (const server of NIP96_SERVERS) {
    console.log(`Trying ${server.name}...`);
    const result = await uploadToServer(server, file, signEvent);
    
    if (result.success) {
      return result;
    }
    
    errors.push(`${server.name}: ${result.error}`);
    console.log(`${server.name} failed, trying next server...`);
  }

  return {
    success: false,
    error: `All servers failed: ${errors.join('; ')}`,
  };
}

// 後方互換性のため（NIP-07なしの場合のフォールバック）
export async function uploadToNostrBuild(_file: File | Blob): Promise<UploadResult> {
  return {
    success: false,
    error: 'NIP-07認証が必要です。NIP-07でログインしてください。',
  };
}

export async function uploadImage(
  file: File | Blob,
  config: ImageUploadConfig
): Promise<UploadResult> {
  if (config.type === 'custom' && config.customUrl) {
    // カスタムURLの場合、ファイルをアップロードせずにURLをそのまま返す
    // この場合、ユーザーが既に画像URLを持っていることを想定
    return {
      success: true,
      url: config.customUrl,
    };
  }

  // デフォルトはnostr.build
  return uploadToNostrBuild(file);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/png');
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// SVGをPNG/WebPに変換する
export async function convertSvgToPng(
  svgUrl: string,
  width: number = 800,
  height: number = 800
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }
      
      // 背景を白で塗りつぶし（透明背景の場合）
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      
      // SVGを描画
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to convert to PNG'));
          }
        },
        'image/png',
        0.95
      );
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load SVG image'));
    };
    
    img.src = svgUrl;
  });
}

// 画像がSVGかどうかを判定
export function isSvgUrl(url: string): boolean {
  return url.toLowerCase().endsWith('.svg') || url.includes('image/svg');
}

// Blobの種類を判定
export function isSvgBlob(blob: Blob): boolean {
  return blob.type === 'image/svg+xml';
}

