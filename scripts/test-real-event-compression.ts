/**
 * 実際のNostrイベントでのSVG圧縮テスト
 * 
 * 実行方法: npx tsx scripts/test-real-event-compression.ts
 */

import pako from 'pako';

// 実際のNostrイベント
const realEvent = {"kind":31898,"created_at":1766781305,"tags":[["d","2026-public-1766781305"],["client","nostrdraw"],["v","1"],["message",""],["layout","vertical"],["year","2026"],["allow_extend","true"],["e","94b33c74b6e463c64b06955688f1561e31fd12355283341ed1f03b2e241f1906","","reply"],["parent_p","b3e43e8cc7e6dff23a33d9213a3e912d895b1c3e4250240e0c99dbefe3068b5f"]],"content":"{\"message\":\"\",\"svg\":\"<svg xmlns=\\\"http://www.w3.org/2000/svg\\\" viewBox=\\\"0 0 400 300\\\">\\n  \\n  <defs>\\n    <linearGradient id=\\\"woodGrad\\\" x1=\\\"0%\\\" y1=\\\"0%\\\" x2=\\\"0%\\\" y2=\\\"100%\\\">\\n      <stop offset=\\\"0%\\\" style=\\\"stop-color:#DEB887\\\"/>\\n      <stop offset=\\\"50%\\\" style=\\\"stop-color:#D2B48C\\\"/>\\n      <stop offset=\\\"100%\\\" style=\\\"stop-color:#C4A574\\\"/>\\n    </linearGradient>\\n  </defs>\\n  <rect width=\\\"400\\\" height=\\\"300\\\" fill=\\\"#f5f5dc\\\"/>\\n  <path d=\\\"M40 80 L200 30 L360 80 L360 250 Q200 270 40 250 Z\\\" fill=\\\"url(#woodGrad)\\\" stroke=\\\"#8B4513\\\" stroke-width=\\\"4\\\"/>\\n  <g stroke=\\\"#C4A574\\\" stroke-width=\\\"0.5\\\" opacity=\\\"0.5\\\">\\n    <path d=\\\"M60 120 Q200 110 340 120\\\"/>\\n    <path d=\\\"M50 170 Q200 160 350 170\\\"/>\\n    <path d=\\\"M60 220 Q200 210 340 220\\\"/>\\n  </g>\\n  <circle cx=\\\"200\\\" cy=\\\"55\\\" r=\\\"10\\\" fill=\\\"#8B4513\\\"/>\\n  <circle cx=\\\"200\\\" cy=\\\"55\\\" r=\\\"6\\\" fill=\\\"#5D3A1A\\\"/>\\n  <path d=\\\"M190 55 Q160 35 150 15 Q140 0 160 0 Q180 5 192 30\\\" stroke=\\\"#e94560\\\" stroke-width=\\\"4\\\" fill=\\\"none\\\"/>\\n  <path d=\\\"M210 55 Q240 35 250 15 Q260 0 240 0 Q220 5 208 30\\\" stroke=\\\"#e94560\\\" stroke-width=\\\"4\\\" fill=\\\"none\\\"/>\\n  <path d=\\\"M 168.04 151.99 L 168.04 151.88 L 167.90 151.50 L 167.61 150.77 L 167.16 149.98 L 166.71 149.38 L 166.28 148.80 L 165.28 147.40 L 164.25 145.86 L 163.75 145.36 L 163.12 144.59 L 162.48 143.80 L 161.84 142.99 L 161.20 142.19 L 160.61 141.60 L 159.81 140.80 L 159.13 140.11 L 158.66 139.65 L 158.08 139.07 L 157.30 138.29 L 156.48 137.59 L 155.83 137.07 L 155.20 136.46 L 154.57 135.85 L 154.12 135.25 L 153.68 134.67 L 153.11 134.10 L 152.06 133.05 L 151.58 132.57 L 150.99 131.98 L 150.38 131.50 L 149.75 130.86 L 149.10 130.07 L 148.48 129.45 L 147.89 128.86 L 147.09 128.05 L 146.39 127.26 L 145.91 126.65 L 145.30 125.86 L 144.63 124.74 L 143.93 123.56 L 143.26 122.53 L 142.55 121.30 L 142.01 120.08 L 141.50 119.07 L 141.02 118.11 L 140.86 117.16 L 140.71 116.41 L 140.57 114.86 L 140.57 114.19 L 140.57 113.37 L 140.57 112.40 L 140.57 111.41 L 140.57 110.40 L 140.57 109.42 L 140.73 108.26 L 141.09 107.30 L 141.58 106.55 L 142.09 105.60 L 142.62 104.45 L 143.28 103.25 L 143.94 102.20 L 144.64 100.97 L 145.18 99.75 L 145.69 98.74 L 146.32 97.77 L 147.85 95.99 L 149.26 94.04 L 150.11 93.31 L 151.14 92.43 L 152.18 91.55 L 153.19 90.85 L 154.24 89.96 L 155.26 89.27 L 156.41 88.77 L 157.49 88.22 L 158.76 87.66 L 160.34 86.94 L 161.80 86.23 L 163.48 85.63 L 165.39 85.18 L 167.13 84.93 L 168.88 84.89 L 170.57 84.88 L 171.98 84.87 L 174.57 84.87 L 177.68 84.87 L 178.68 85.00 L 179.91 85.29 L 181.32 85.78 L 182.57 86.44 L 183.83 87.13 L 185.03 87.81 L 185.98 88.44 L 186.71 88.93 L 187.49 89.58 L 188.47 90.38 L 189.45 91.07 L 190.30 91.74 L 191.17 92.56 L 192.23 93.61 L 193.12 94.64 L 193.84 95.86 L 194.54 97.25 L 195.78 99.85 L 196.75 102.96 L 197.04 104.12 L 197.40 105.76 L 197.77 107.43 L 197.98 108.91 L 198.00 110.64 L 198.01 112.32 L 198.01 113.94 L 198.01 115.39 L 198.01 116.84 L 198.01 118.90 L 198.01 120.84 L 197.82 123.38 L 197.47 125.77 L 196.92 127.70 L 196.30 130.20 L 195.51 132.45 L 194.57 134.38 L 193.82 136.22 L 193.08 138.07 L 191.75 141.27 L 191.16 142.43 L 190.45 143.86 L 189.75 145.11 L 189.07 146.16 L 188.39 147.19 L 187.75 148.00 L 186.98 148.62 L 186.20 149.40 L 185.60 149.96 L 184.83 150.34 L 183.87 150.80 L 182.89 151.28 L 181.89 151.78 L 180.88 152.14 L 179.87 152.48 L 178.86 152.82 L 177.87 153.15 L 176.18 153.30 L 174.63 153.30 L 173.98 153.30 L 173.33 153.30 L 172.84 153.30 L 172.63 153.19\\\" stroke=\\\"#000000\\\" stroke-width=\\\"3\\\" fill=\\\"none\\\" stroke-linecap=\\\"round\\\" stroke-linejoin=\\\"round\\\"/>\\n  <path d=\\\"M 225.57 144.66 L 225.34 144.66 L 224.99 144.66 L 224.73 144.66 L 224.30 144.66 L 223.71 144.66 L 223.30 144.66 L 222.95 144.66 L 221.98 144.66 L 221.61 144.66 L 221.05 144.66 L 220.60 144.66 L 220.14 144.52 L 219.36 144.22 L 218.60 143.77 L 218.02 143.20 L 217.45 142.72 L 216.94 142.23 L 216.26 141.61 L 215.50 140.98 L 214.98 140.21 L 214.47 139.55 L 213.86 139.04 L 213.25 138.43 L 212.95 137.84 L 212.66 137.27 L 212.02 136.54 L 211.46 135.69 L 211.21 135.18 L 211.03 134.72 L 210.86 134.26 L 210.57 133.66 L 210.41 133.05 L 210.25 132.29 L 210.09 131.53 L 210.00 131.07 L 209.77 130.61 L 209.46 129.88 L 209.15 129.11 L 208.96 128.30 L 208.79 127.50 L 208.63 126.85 L 208.46 126.04 L 208.16 125.26 L 207.86 124.50 L 207.55 123.74 L 206.99 122.21 L 206.74 121.56 L 206.55 120.75 L 206.37 119.79 L 206.20 118.79 L 206.03 117.78 L 205.71 116.78 L 205.54 115.82 L 205.54 114.88 L 205.45 114.12 L 205.20 113.36 L 205.00 112.41 L 204.81 111.43 L 204.64 110.42 L 204.48 109.58 L 204.32 108.74 L 204.30 107.74 L 204.29 106.95 L 204.29 106.18 L 204.29 105.42 L 204.29 104.66 L 204.29 103.42 L 204.29 102.76 L 204.29 101.98 L 204.29 101.35 L 204.29 100.54 L 204.29 99.75 L 204.45 98.96 L 204.94 97.81 L 205.46 96.85 L 205.96 96.09 L 206.62 94.97 L 207.29 93.80 L 207.96 92.76 L 208.66 91.54 L 209.36 90.32 L 210.00 89.46 L 210.48 88.65 L 210.96 87.70 L 211.72 86.48 L 212.89 85.30 L 213.38 84.80 L 213.98 84.20 L 214.76 83.57 L 215.55 82.93 L 216.18 82.45 L 216.95 81.98 L 217.89 81.50 L 218.64 81.16 L 219.39 80.66 L 220.50 80.13 L 221.66 79.61 L 222.89 78.94 L 224.12 78.39 L 225.16 77.87 L 226.18 77.36 L 227.17 77.02 L 228.13 76.85 L 229.06 76.69 L 230.77 76.43 L 231.40 76.29 L 232.21 76.24 L 233.15 76.22 L 234.14 76.21 L 235.15 76.21 L 236.37 76.20 L 237.55 76.20 L 238.71 76.20 L 239.66 76.29 L 240.62 76.84 L 241.83 77.77 L 243.11 78.82 L 244.43 79.93 L 245.60 81.23 L 246.81 82.77 L 248.00 84.33 L 249.17 85.88 L 255.23 100.01 L 255.61 101.72 L 255.98 103.38 L 256.14 105.55 L 256.14 107.43 L 256.14 108.68 L 256.14 110.45 L 256.14 112.54 L 256.14 114.73 L 255.98 116.75 L 255.46 118.76 L 254.54 120.75 L 253.61 122.48 L 252.68 124.13 L 250.69 126.97 L 249.79 128.16 L 248.52 129.50 L 247.21 130.86 L 245.83 132.25 L 244.45 133.64 L 243.27 134.98 L 242.15 136.10 L 241.27 137.14 L 240.43 138.13 L 239.62 138.94 L 238.96 139.71 L 238.27 140.66 L 237.42 141.67 L 236.58 142.56 L 235.75 143.27 L 234.77 143.96 L 233.77 144.63 L 232.77 145.30 L 231.58 145.81 L 229.13 146.42 L 225.33 147.05 L 223.96 147.05 L 221.87 147.05 L 219.70 147.05 L 217.92 147.05 L 216.60 147.05 L 215.57 147.05 L 214.79 147.05\\\" stroke=\\\"#000000\\\" stroke-width=\\\"3\\\" fill=\\\"none\\\" stroke-linecap=\\\"round\\\" stroke-linejoin=\\\"round\\\"/>\\n  <path d=\\\"M 186.59 129.72 L 186.48 129.72 L 186.10 129.72 L 185.76 129.72 L 185.44 129.61 L 185.03 129.27 L 184.70 128.60 L 184.24 127.86 L 183.79 127.22 L 183.44 126.42 L 182.95 125.44 L 182.46 124.63 L 182.18 124.18 L 182.04 123.77 L 181.75 123.19 L 181.46 122.64 L 181.46 122.27 L 181.46 122.03 L 181.46 121.64 L 181.46 121.24 L 181.46 120.98 L 181.46 120.75 L 181.46 120.53 L 181.46 120.15 L 181.46 119.73 L 181.46 119.44 L 181.46 119.15 L 181.61 118.71 L 181.88 118.29 L 182.29 117.87 L 183.32 117.21 L 184.48 116.34 L 184.99 116.08 L 185.75 115.63 L 186.54 115.16 L 187.17 114.83 L 187.77 114.66 L 188.54 114.50 L 189.47 114.34 L 190.11 114.34 L 190.71 114.34 L 191.61 114.34 L 192.41 114.34 L 193.23 114.34 L 194.20 114.34 L 195.02 114.34 L 195.66 114.34 L 196.11 114.34 L 196.36 114.34 L 196.83 114.34 L 197.35 114.42 L 197.57 114.64 L 197.84 114.91 L 198.00 115.19 L 198.02 115.46 L 198.02 115.73 L 198.02 116.15 L 198.02 116.91 L 198.02 117.65 L 198.02 118.27 L 198.02 119.23 L 197.89 120.36 L 197.45 121.56 L 196.82 122.78 L 196.16 123.82 L 195.64 124.84 L 195.14 125.82 L 194.53 126.59 L 193.13 127.67 L 191.83 128.46 L 191.00 128.73 L 190.18 129.05 L 189.36 129.36 L 188.54 129.68 L 187.91 129.84 L 187.32 129.99 L 186.90 130.13\\\" stroke=\\\"#000000\\\" stroke-width=\\\"3\\\" fill=\\\"none\\\" stroke-linecap=\\\"round\\\" stroke-linejoin=\\\"round\\\"/>\\n  <path d=\\\"M 241.44 126.39 L 241.18 126.39 L 240.79 126.39 L 240.55 126.39 L 240.14 126.39 L 239.72 126.39 L 239.33 126.39 L 238.96 126.28 L 238.74 126.06 L 238.60 125.67 L 238.57 125.10 L 238.42 124.50 L 238.28 123.89 L 238.27 123.12 L 238.27 122.36 L 238.27 121.91 L 238.27 121.45 L 238.27 120.86 L 238.27 120.27 L 238.14 119.66 L 238.01 119.18 L 237.99 118.71 L 237.98 118.13 L 237.97 117.72 L 237.97 117.26 L 237.97 117.04 L 237.97 116.77 L 237.97 116.50 L 237.97 116.08 L 237.97 115.66 L 237.97 115.39 L 237.97 115.13 L 238.14 114.92 L 238.47 114.70 L 238.91 114.30 L 239.47 113.88 L 240.06 113.55 L 240.53 113.24 L 240.99 112.94 L 241.43 112.64 L 241.71 112.37 L 242.13 112.24 L 242.55 112.11 L 242.96 111.83 L 243.70 111.59 L 244.19 111.46 L 244.79 111.29 L 245.39 111.01 L 246.00 110.85 L 246.61 110.68 L 247.20 110.54 L 247.61 110.40 L 247.91 110.27 L 248.24 110.17 L 248.68 110.05 L 249.11 110.03 L 249.55 110.01 L 249.99 110.00 L 250.44 110.00 L 250.88 110.00 L 251.32 109.99 L 251.74 109.99 L 252.00 109.99 L 252.41 109.99 L 252.83 109.99 L 253.30 109.99 L 253.54 110.10 L 253.81 110.34 L 254.08 110.60 L 254.36 110.87 L 254.49 111.29 L 254.65 112.05 L 254.89 112.68 L 255.00 113.13 L 255.16 113.71 L 255.31 114.29 L 255.34 114.90 L 255.36 115.38 L 255.36 115.83 L 255.36 116.43 L 255.36 117.03 L 255.36 117.46 L 255.36 118.44 L 255.36 119.05 L 255.36 119.69 L 255.36 120.29 L 255.22 121.06 L 254.81 121.87 L 254.21 122.69 L 253.56 123.68 L 252.75 124.49 L 251.80 125.13 L 251.05 125.62 L 250.14 126.13 L 249.01 126.66 L 248.00 127.05 L 246.97 127.41 L 245.95 127.75 L 244.94 127.95 L 243.92 127.98 L 242.91 127.98 L 241.95 127.98 L 241.00 127.98 L 240.06 127.98\\\" stroke=\\\"#000000\\\" stroke-width=\\\"3\\\" fill=\\\"none\\\" stroke-linecap=\\\"round\\\" stroke-linejoin=\\\"round\\\"/>\\n</svg>\",\"layoutId\":\"vertical\",\"year\":2026,\"version\":\"1\",\"isPublic\":true,\"allowExtend\":true,\"parentEventId\":\"94b33c74b6e463c64b06955688f1561e31fd12355283341ed1f03b2e241f1906\"}","pubkey":"b3e43e8cc7e6dff23a33d9213a3e912d895b1c3e4250240e0c99dbefe3068b5f","id":"a643be0fca18e0b697c5fce398b1209b0f62cc3e7bea235ed4b27d1df04a814b","sig":"ac2ea746fb7684aacb0b7990a6a35bf3aca972d175f7ed693aeb7303c0e9e1b9c720e34486350731512e325d7bb9455dadd3269915f5d69c72c1e6a13a68fbdf"};

// 1. SVG最適化
function optimizeSvg(svg: string): string {
  let optimized = svg;
  
  // 小数点を2桁に丸める
  optimized = optimized.replace(/(\d+\.\d{2})\d+/g, '$1');
  
  // 不要な空白を削除
  optimized = optimized.replace(/>\s+</g, '><');
  optimized = optimized.replace(/\s+/g, ' ');
  
  // 0.00 -> 0 に簡略化
  optimized = optimized.replace(/([^0-9])0\.00([^0-9])/g, '$10$2');
  
  // 冗長な属性値を短縮
  optimized = optimized.replace(/stroke-width="(\d+)\.00"/g, 'stroke-width="$1"');
  
  return optimized.trim();
}

// 2. gzip圧縮 + base64エンコード
function compressToBase64(data: string): string {
  const uint8Array = new TextEncoder().encode(data);
  const compressed = pako.deflate(uint8Array, { level: 9 });
  return Buffer.from(compressed).toString('base64');
}

// 3. base64デコード + 解凍
function decompressFromBase64(base64: string): string {
  const compressed = Buffer.from(base64, 'base64');
  const decompressed = pako.inflate(compressed);
  return new TextDecoder().decode(decompressed);
}

// テスト実行
console.log('🧪 実際のNostrイベント圧縮テスト');
console.log('='.repeat(60));

// イベント全体のサイズ
const eventJson = JSON.stringify(realEvent);
const eventSize = Buffer.byteLength(eventJson, 'utf8');
console.log(`\n📦 元のイベントサイズ: ${eventSize.toLocaleString()} bytes`);

// contentの解析
const content = JSON.parse(realEvent.content);
const svg = content.svg;
const svgSize = Buffer.byteLength(svg, 'utf8');
console.log(`📄 SVGサイズ: ${svgSize.toLocaleString()} bytes (イベント全体の${((svgSize / eventSize) * 100).toFixed(1)}%)`);

// Step 1: SVG最適化
const optimizedSvg = optimizeSvg(svg);
const optimizedSvgSize = Buffer.byteLength(optimizedSvg, 'utf8');
const svgReduction = ((1 - optimizedSvgSize / svgSize) * 100).toFixed(1);
console.log(`\n📐 SVG最適化後: ${optimizedSvgSize.toLocaleString()} bytes (${svgReduction}% 削減)`);

// Step 2: gzip圧縮 + base64
const compressedSvg = compressToBase64(optimizedSvg);
const compressedSvgSize = Buffer.byteLength(compressedSvg, 'utf8');
const compressionRatio = ((1 - compressedSvgSize / svgSize) * 100).toFixed(1);
console.log(`🗜️  gzip+base64: ${compressedSvgSize.toLocaleString()} bytes (${compressionRatio}% 削減)`);

// 検証: 解凍して元に戻るか
const decompressedSvg = decompressFromBase64(compressedSvg);
const isValid = decompressedSvg === optimizedSvg;
console.log(`\n✅ 解凍検証: ${isValid ? '成功' : '失敗'}`);

// 新しいcontent構造を作成（圧縮SVG版）
const compressedContent = {
  ...content,
  svg: undefined,  // 元のSVGは削除
  svgCompressed: compressedSvg,  // 圧縮版を追加
  compression: 'gzip+base64'
};
const compressedContentJson = JSON.stringify(compressedContent);
const compressedContentSize = Buffer.byteLength(compressedContentJson, 'utf8');

// 新しいイベント全体のサイズを見積もる
const newEventSize = eventSize - Buffer.byteLength(realEvent.content, 'utf8') + compressedContentSize;
const eventReduction = ((1 - newEventSize / eventSize) * 100).toFixed(1);

console.log('\n📊 圧縮後のイベント見積もり');
console.log('━'.repeat(60));
console.log(`元のイベント:    ${eventSize.toLocaleString()} bytes`);
console.log(`圧縮後イベント:  ${newEventSize.toLocaleString()} bytes`);
console.log(`削減率:          ${eventReduction}%`);

// リレー制限チェック
const maxEventSize = 65536; // 64KB
console.log(`\n📡 リレー制限 (64KB): ${newEventSize <= maxEventSize ? '✅ OK' : '❌ 超過'}`);

// 詳細な内訳
console.log('\n📋 詳細な内訳');
console.log('━'.repeat(60));
console.log(`| 項目               | サイズ     | 削減後    | 削減率  |`);
console.log('━'.repeat(60));
console.log(`| SVG                | ${svgSize.toString().padStart(8)} | ${compressedSvgSize.toString().padStart(8)} | ${compressionRatio.padStart(5)}% |`);
console.log(`| イベント全体       | ${eventSize.toString().padStart(8)} | ${newEventSize.toString().padStart(8)} | ${eventReduction.padStart(5)}% |`);
console.log('━'.repeat(60));

// Contentも最適化した場合
const optimizedContent = {
  message: content.message,
  svgCompressed: compressedSvg,
  compression: 'gzip+base64',
  layoutId: content.layoutId,
  year: content.year,
  version: content.version,
  isPublic: content.isPublic,
  allowExtend: content.allowExtend,
  parentEventId: content.parentEventId
};
const optimizedContentJson = JSON.stringify(optimizedContent);
const optimizedContentSize = Buffer.byteLength(optimizedContentJson, 'utf8');
const finalEventSize = eventSize - Buffer.byteLength(realEvent.content, 'utf8') + optimizedContentSize;

console.log(`\n🎯 最適化版イベントサイズ: ${finalEventSize.toLocaleString()} bytes`);
console.log(`   (元の ${((finalEventSize / eventSize) * 100).toFixed(1)}%、${((1 - finalEventSize / eventSize) * 100).toFixed(1)}% 削減)`);

