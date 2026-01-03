/**
 * SVG圧縮テストスクリプト
 * 
 * 実行方法: npx tsx scripts/test-svg-compression.ts
 */

import pako from 'pako';

// サンプルSVG（実際のNostrDrawで生成されるような複雑なSVG）
const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#ffffff"/>
  <g transform="translate(50, 0) scale(1.5)">
    <svg viewBox="0 0 200 200" width="200" height="200">
      <defs>
        <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#e94560;stop-opacity:1" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="80" fill="url(#grad1)"/>
      <path d="M50,100 Q100,20 150,100 T250,100" stroke="#333" fill="none" stroke-width="3"/>
    </svg>
  </g>
  <path d="M10.123456789,20.987654321 L30.555555555,40.666666666 L50.111111111,60.222222222 L70.333333333,80.444444444 L90.555555555,100.666666666" stroke="#e94560" stroke-width="3.0000000000" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M100.123456789,120.987654321 L130.555555555,140.666666666 L150.111111111,160.222222222" stroke="#4d96ff" stroke-width="5.0000000000" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <image href="https://example.com/image.png" x="200" y="150" width="50" height="50"/>
  <text x="50" y="280" font-family="Noto Sans JP" font-size="16" fill="#333">テストメッセージです。これは長いテキストのテストです。日本語の文字も含まれています。</text>
</svg>`;

// もっと大きなサンプル（ストロークが多い場合）
const largeSvg = generateLargeSvg();

function generateLargeSvg(): string {
  let paths = '';
  for (let i = 0; i < 50; i++) {
    const points = [];
    for (let j = 0; j < 20; j++) {
      const x = Math.random() * 400;
      const y = Math.random() * 300;
      points.push(`${x.toFixed(6)},${y.toFixed(6)}`);
    }
    paths += `  <path d="M${points.join(' L')}" stroke="#e94560" stroke-width="2.000000" fill="none" stroke-linecap="round" stroke-linejoin="round"/>\n`;
  }
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#ffffff"/>
${paths}
  <text x="50" y="280" font-family="Noto Sans JP" font-size="16" fill="#333">テストメッセージ</text>
</svg>`;
}

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
function runTest(name: string, svg: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`テスト: ${name}`);
  console.log('='.repeat(60));
  
  const originalSize = Buffer.byteLength(svg, 'utf8');
  console.log(`\n元のサイズ: ${originalSize.toLocaleString()} bytes`);
  
  // Step 1: SVG最適化
  const optimized = optimizeSvg(svg);
  const optimizedSize = Buffer.byteLength(optimized, 'utf8');
  const optimizedRatio = ((1 - optimizedSize / originalSize) * 100).toFixed(1);
  console.log(`\n📐 SVG最適化後: ${optimizedSize.toLocaleString()} bytes (${optimizedRatio}% 削減)`);
  
  // Step 2: gzip圧縮 + base64
  const compressed = compressToBase64(optimized);
  const compressedSize = Buffer.byteLength(compressed, 'utf8');
  const compressedRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
  console.log(`🗜️  gzip+base64後: ${compressedSize.toLocaleString()} bytes (${compressedRatio}% 削減)`);
  
  // 検証: 解凍して元に戻るか
  const decompressed = decompressFromBase64(compressed);
  const isValid = decompressed === optimized;
  console.log(`\n✅ 解凍検証: ${isValid ? '成功' : '失敗'}`);
  
  // Nostrイベントサイズの見積もり
  const eventOverhead = 500; // タグ、署名などのオーバーヘッド
  const estimatedEventSize = compressedSize + eventOverhead;
  const maxEventSize = 65536; // 一般的なリレーの制限
  console.log(`\n📦 推定イベントサイズ: ${estimatedEventSize.toLocaleString()} bytes`);
  console.log(`   リレー制限 (64KB): ${estimatedEventSize <= maxEventSize ? '✅ OK' : '❌ 超過'}`);
  
  return {
    originalSize,
    optimizedSize,
    compressedSize,
    estimatedEventSize,
  };
}

// 実行
console.log('🧪 SVG圧縮テスト');
console.log('================');

const result1 = runTest('シンプルなSVG', sampleSvg);
const result2 = runTest('複雑なSVG（50ストローク）', largeSvg);

// 描き足しシミュレーション
console.log(`\n${'='.repeat(60)}`);
console.log('描き足しシミュレーション');
console.log('='.repeat(60));

const extendedSvg = largeSvg + largeSvg; // 2倍のサイズ
const result3 = runTest('描き足し後（2倍）', extendedSvg);

console.log('\n\n📊 まとめ');
console.log('━'.repeat(60));
console.log('| ケース                | 元     | 最適化  | 圧縮    | 削減率 |');
console.log('━'.repeat(60));
console.log(`| シンプル              | ${result1.originalSize.toString().padStart(5)} | ${result1.optimizedSize.toString().padStart(6)} | ${result1.compressedSize.toString().padStart(6)} | ${((1 - result1.compressedSize / result1.originalSize) * 100).toFixed(0).padStart(4)}%  |`);
console.log(`| 複雑（50ストローク）   | ${result2.originalSize.toString().padStart(5)} | ${result2.optimizedSize.toString().padStart(6)} | ${result2.compressedSize.toString().padStart(6)} | ${((1 - result2.compressedSize / result2.originalSize) * 100).toFixed(0).padStart(4)}%  |`);
console.log(`| 描き足し後            | ${result3.originalSize.toString().padStart(5)} | ${result3.optimizedSize.toString().padStart(6)} | ${result3.compressedSize.toString().padStart(6)} | ${((1 - result3.compressedSize / result3.originalSize) * 100).toFixed(0).padStart(4)}%  |`);
console.log('━'.repeat(60));



