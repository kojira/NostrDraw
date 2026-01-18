/**
 * 秘密鍵の暗号化・保存・復号モジュール
 * 
 * パスワードからPBKDF2で鍵を導出し、
 * AES-GCMでnsecを暗号化してlocalStorageに保存する
 */

// ストレージキー
const STORAGE_KEY = 'nostrdraw-encrypted-nsec';

// PBKDF2パラメータ
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH = 'SHA-256';

// AES-GCMパラメータ
const AES_KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96bit

/**
 * 暗号化されたnsecの保存形式
 */
interface EncryptedNsecData {
  // base64エンコードされた暗号化データ
  ciphertext: string;
  // base64エンコードされたIV
  iv: string;
  // base64エンコードされたsalt（PBKDF2用）
  salt: string;
  // base64エンコードされたnpub（復号時の検証用）
  npub: string;
  // 入口用アカウントかどうか
  isEntranceKey: boolean;
}

/**
 * バイト配列をbase64に変換
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * base64をバイト配列に変換
 */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Uint8ArrayのbufferをArrayBufferとして取得（TypeScript型互換性対策）
 */
function getArrayBuffer(data: Uint8Array): ArrayBuffer {
  return new Uint8Array(data).buffer as ArrayBuffer;
}

/**
 * パスワードからAES-GCM用の鍵を導出（PBKDF2）
 */
async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  // パスワードをCryptoKeyにインポート
  const passwordBuffer = new TextEncoder().encode(password);
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    getArrayBuffer(passwordBuffer),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  // PBKDF2で鍵を導出
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: getArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    passwordKey,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );

  return derivedKey;
}

/**
 * nsecをパスワードで暗号化してlocalStorageに保存
 * 
 * @param nsec nsec文字列
 * @param password 暗号化用パスワード
 * @param npub npub文字列（復号時の検証用）
 * @param isEntranceKey 入口用アカウントかどうか
 */
export async function saveEncryptedNsec(
  nsec: string,
  password: string,
  npub: string,
  isEntranceKey: boolean = true
): Promise<void> {
  // ランダムなsaltとIVを生成
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // パスワードから鍵を導出
  const key = await deriveKeyFromPassword(password, salt);

  // nsecを暗号化
  const nsecBuffer = new TextEncoder().encode(nsec);
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: getArrayBuffer(iv) },
    key,
    getArrayBuffer(nsecBuffer)
  );

  // 保存形式に変換
  const data: EncryptedNsecData = {
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuffer)),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
    npub,
    isEntranceKey,
  };

  // localStorageに保存
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/**
 * パスワードでlocalStorageからnsecを復号
 * 
 * @param password 復号用パスワード
 * @returns { nsec, npub, isEntranceKey } または null（復号失敗時）
 */
export async function loadDecryptedNsec(
  password: string
): Promise<{ nsec: string; npub: string; isEntranceKey: boolean } | null> {
  // localStorageから読み込み
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return null;
  }

  let data: EncryptedNsecData;
  try {
    data = JSON.parse(stored);
  } catch {
    console.error('Failed to parse encrypted nsec data');
    return null;
  }

  // 必要なフィールドを確認
  if (!data.ciphertext || !data.iv || !data.salt || !data.npub) {
    console.error('Invalid encrypted nsec data structure');
    return null;
  }

  try {
    // base64をデコード
    const ciphertext = base64ToBytes(data.ciphertext);
    const iv = base64ToBytes(data.iv);
    const salt = base64ToBytes(data.salt);

    // パスワードから鍵を導出
    const key = await deriveKeyFromPassword(password, salt);

    // 復号
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: getArrayBuffer(iv) },
      key,
      getArrayBuffer(ciphertext)
    );

    const nsec = new TextDecoder().decode(decryptedBuffer);

    return {
      nsec,
      npub: data.npub,
      isEntranceKey: data.isEntranceKey ?? true,
    };
  } catch (error) {
    // 復号失敗（パスワード違いなど）
    console.error('Failed to decrypt nsec:', error);
    return null;
  }
}

/**
 * 保存されたアカウントがあるかどうか確認
 */
export function hasStoredAccount(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored !== null;
}

/**
 * 保存されたアカウントのnpubを取得（復号なし）
 */
export function getStoredNpub(): string | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    const data: EncryptedNsecData = JSON.parse(stored);
    return data.npub || null;
  } catch {
    return null;
  }
}

/**
 * 保存されたnsecを削除
 */
export function clearStoredNsec(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * 保存されたアカウントが入口用かどうか確認
 */
export function isStoredEntranceKey(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return false;
  }

  try {
    const data: EncryptedNsecData = JSON.parse(stored);
    return data.isEntranceKey ?? true;
  } catch {
    return false;
  }
}
