/**
 * 決定論的nsec生成モジュール
 * 
 * 入力（アカウント名・パスワード・追加シークレット）から
 * Argon2idを使って決定論的にnsec（秘密鍵）を生成する
 */

import { argon2id } from 'hash-wasm';
import { nip19 } from 'nostr-tools';
import { getPublicKey } from 'nostr-tools';

// secp256k1の曲線位数 n
// n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
const SECP256K1_ORDER = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');

// コンテキスト文字列
const CONTEXT = 'nostr-login-v1';

/**
 * バイト配列を16進文字列に変換
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 16進文字列をバイト配列に変換
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * SHA-256ハッシュ（SubtleCrypto API使用）
 */
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  // TypeScript 5.9+のSharedArrayBuffer型互換性対策
  const buffer = new Uint8Array(data).buffer as ArrayBuffer;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return new Uint8Array(hashBuffer);
}

/**
 * バイト配列をBigIntに変換（ビッグエンディアン）
 */
function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt('0x' + bytesToHex(bytes));
}

/**
 * BigIntをバイト配列に変換（ビッグエンディアン、32バイト固定）
 */
function bigIntToBytes32(n: bigint): Uint8Array {
  const hex = n.toString(16).padStart(64, '0');
  return hexToBytes(hex);
}

/**
 * 入力を正規化
 */
function normalizeInput(accountName: string, extraSecret: string): { normName: string; normExtra: string } {
  // アカウント名: trim + Unicode NFC
  const normName = accountName.trim().normalize('NFC');
  // 追加シークレット: Unicode NFC（trimなし）
  const normExtra = extraSecret.normalize('NFC');
  return { normName, normExtra };
}

/**
 * Argon2idの進捗コールバック型
 */
export type DeriveProgressCallback = (progress: number) => void;

/**
 * 決定論的にnsecを生成
 * 
 * @param accountName アカウント名（漢字・絵文字可）
 * @param password パスワード（8文字以上）
 * @param extraSecret 追加シークレット（4文字以上、漢字・絵文字可）
 * @param onProgress 進捗コールバック（0-100）
 * @returns nsec文字列
 */
export async function deriveNsec(
  accountName: string,
  password: string,
  extraSecret: string,
  onProgress?: DeriveProgressCallback
): Promise<string> {
  // 入力検証
  if (password.length < 8) {
    throw new Error('パスワードは8文字以上である必要があります');
  }
  if (extraSecret.length < 4) {
    throw new Error('追加シークレットは4文字以上である必要があります');
  }

  // 1. 正規化
  const { normName, normExtra } = normalizeInput(accountName, extraSecret);
  
  onProgress?.(10);

  // 2. salt = SHA256("salt:" + ctx + ":" + account_name)
  const saltInput = `salt:${CONTEXT}:${normName}`;
  const saltInputBytes = new TextEncoder().encode(saltInput);
  const salt = await sha256(saltInputBytes);
  
  onProgress?.(20);

  // 3. ikm = UTF8("ikm:" + ctx + ":" + account_name + ":" + password + ":" + extra_secret)
  const ikmString = `ikm:${CONTEXT}:${normName}:${password}:${normExtra}`;
  const ikm = new TextEncoder().encode(ikmString);
  
  onProgress?.(30);

  // 4. k0 = Argon2id(password=ikm, salt=salt, time_cost=2, memory_cost=64MB, parallelism=1, output_length=32)
  const k0 = await argon2id({
    password: ikm,
    salt: salt,
    iterations: 2,
    memorySize: 65536, // 64MB in KiB
    parallelism: 1,
    hashLength: 32,
    outputType: 'binary',
  });
  
  onProgress?.(80);

  // 5. k = (OS2IP(k0) mod (n - 1)) + 1
  // OS2IP: Octet String to Integer Primitive（ビッグエンディアンでバイト列を整数に変換）
  const k0BigInt = bytesToBigInt(k0);
  const k = (k0BigInt % (SECP256K1_ORDER - 1n)) + 1n;
  
  // 6. kを32バイトに変換し、bech32エンコードしてnsecを生成
  const secretKeyBytes = bigIntToBytes32(k);
  const nsec = nip19.nsecEncode(secretKeyBytes);
  
  onProgress?.(100);

  return nsec;
}

/**
 * nsecからpubkeyとnpubを導出
 * 
 * @param nsec nsec文字列
 * @returns { pubkey: hex文字列, npub: npub文字列 }
 */
export function derivePublicKeyFromNsec(nsec: string): { pubkey: string; npub: string } {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') {
    throw new Error('Invalid nsec format');
  }
  const secretKey = decoded.data;
  const pubkey = getPublicKey(secretKey);
  const npub = nip19.npubEncode(pubkey);
  return { pubkey, npub };
}

/**
 * nsecから秘密鍵バイト列を取得
 * 
 * @param nsec nsec文字列
 * @returns 秘密鍵のUint8Array
 */
export function nsecToSecretKey(nsec: string): Uint8Array {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') {
    throw new Error('Invalid nsec format');
  }
  return decoded.data;
}
