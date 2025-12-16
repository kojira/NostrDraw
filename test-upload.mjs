// yabu.me ギャラリー画像アップロード
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';

const YABU_API = 'https://share.yabu.me/api/v2/media';

// 秘密鍵（固定で使用）
const sk = generateSecretKey();
const pk = getPublicKey(sk);
console.log('Public key:', pk);

// NIP-98認証イベントを作成
function createAuthEvent(url, method) {
  return {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', url],
      ['method', method],
    ],
    content: '',
  };
}

// SVGをPNGに変換（800x800）
async function convertSvgToPng(svgPath) {
  let svgContent = fs.readFileSync(svgPath, 'utf-8');
  
  // 出力サイズを800x800に固定
  const outputSize = 800;
  
  // SVGにwidth/heightがない場合は追加
  if (!svgContent.includes('width=')) {
    svgContent = svgContent.replace('<svg ', `<svg width="${outputSize}" height="${outputSize}" `);
  }
  
  const canvas = createCanvas(outputSize, outputSize);
  const ctx = canvas.getContext('2d');
  
  // 背景を白に
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outputSize, outputSize);
  
  // SVGを読み込んで描画
  const img = await loadImage(`data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`);
  ctx.drawImage(img, 0, 0, outputSize, outputSize);
  
  return canvas.toBuffer('image/png');
}

// ギャラリー画像リスト
const GALLERY_IMAGES = [
  { id: 'horse-kawaii', path: './public/images/eto/horse-kawaii.svg', name: 'かわいい馬' },
  { id: 'horse-japanese', path: './public/images/eto/horse-japanese.svg', name: '和風（水墨画）' },
  { id: 'horse-modern', path: './public/images/eto/horse-modern.svg', name: 'モダン' },
  { id: 'horse-ema', path: './public/images/eto/horse-ema.svg', name: '絵馬風' },
];

async function uploadImage(pngBuffer, filename) {
  // 認証イベントを作成・署名
  const authTemplate = createAuthEvent(YABU_API, 'POST');
  const signedAuth = finalizeEvent(authTemplate, sk);
  const authHeader = 'Nostr ' + Buffer.from(JSON.stringify(signedAuth)).toString('base64');

  const formData = new FormData();
  const blob = new Blob([pngBuffer], { type: 'image/png' });
  formData.append('file', blob, filename);

  const response = await fetch(YABU_API, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
    },
    body: formData,
  });

  const responseText = await response.text();
  const data = JSON.parse(responseText);
  
  // URLを取得
  if (data.nip94_event?.tags) {
    const urlTag = data.nip94_event.tags.find(t => t[0] === 'url');
    if (urlTag?.[1]) {
      return urlTag[1];
    }
  }
  
  throw new Error(`Upload failed: ${responseText}`);
}

async function uploadAllGalleryImages() {
  const results = {};
  
  for (const image of GALLERY_IMAGES) {
    console.log(`\n=== Uploading ${image.name} (${image.id}) ===`);
    
    try {
      // SVGをPNGに変換
      console.log('Converting SVG to PNG...');
      const pngBuffer = await convertSvgToPng(image.path);
      console.log(`PNG size: ${pngBuffer.length} bytes`);
      
      // アップロード
      console.log('Uploading...');
      const url = await uploadImage(pngBuffer, `${image.id}.png`);
      console.log(`✅ Success: ${url}`);
      
      results[image.id] = url;
    } catch (error) {
      console.error(`❌ Failed: ${error.message}`);
      results[image.id] = null;
    }
    
    // レート制限対策で少し待機
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log('\n\n=== Results ===');
  console.log('Copy this to ETO_IMAGES in App.tsx:\n');
  console.log('const ETO_IMAGES: EtoImage[] = [');
  for (const image of GALLERY_IMAGES) {
    const url = results[image.id];
    if (url) {
      console.log(`  { id: '${image.id}', name: '${image.name}', url: '${url}', year: 2026 },`);
    }
  }
  console.log('];');
}

uploadAllGalleryImages();

