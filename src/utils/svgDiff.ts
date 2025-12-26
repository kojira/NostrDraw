/**
 * SVG差分検出ユーティリティ
 * 親SVGと子SVGを比較して、追加された要素を特定する
 */

/**
 * SVGをパースしてDOM要素を取得
 */
function parseSvg(svgString: string): Document | null {
  try {
    const parser = new DOMParser();
    return parser.parseFromString(svgString, 'image/svg+xml');
  } catch {
    return null;
  }
}

/**
 * 要素のシグネチャを生成（比較用）
 * path要素の場合はd属性、それ以外は属性の組み合わせ
 */
function getElementSignature(element: Element): string {
  const tagName = element.tagName.toLowerCase();
  
  if (tagName === 'path') {
    // pathはd属性で比較（小数点を丸めて比較精度を調整）
    const d = element.getAttribute('d') || '';
    // 座標を丸めてノーマライズ
    const normalizedD = d.replace(/(\d+\.\d{1})\d*/g, '$1');
    return `path:${normalizedD}`;
  }
  
  if (tagName === 'circle') {
    const cx = element.getAttribute('cx') || '';
    const cy = element.getAttribute('cy') || '';
    const r = element.getAttribute('r') || '';
    return `circle:${cx},${cy},${r}`;
  }
  
  if (tagName === 'rect') {
    const x = element.getAttribute('x') || '';
    const y = element.getAttribute('y') || '';
    const w = element.getAttribute('width') || '';
    const h = element.getAttribute('height') || '';
    return `rect:${x},${y},${w},${h}`;
  }
  
  if (tagName === 'text') {
    const x = element.getAttribute('x') || '';
    const y = element.getAttribute('y') || '';
    const text = element.textContent || '';
    return `text:${x},${y},${text.substring(0, 20)}`;
  }
  
  if (tagName === 'image') {
    const href = element.getAttribute('href') || element.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
    const x = element.getAttribute('x') || '';
    const y = element.getAttribute('y') || '';
    return `image:${x},${y},${href.substring(0, 50)}`;
  }
  
  if (tagName === 'g') {
    const transform = element.getAttribute('transform') || '';
    // 子要素の数も含める
    const childCount = element.children.length;
    return `g:${transform}:${childCount}`;
  }
  
  // その他の要素
  return `${tagName}:${element.outerHTML.substring(0, 100)}`;
}

/**
 * SVGから描画要素のシグネチャセットを取得
 */
function getElementSignatures(svgDoc: Document): Set<string> {
  const signatures = new Set<string>();
  const svg = svgDoc.querySelector('svg');
  if (!svg) return signatures;
  
  // 描画要素を再帰的に取得
  const drawingElements = ['path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'image', 'g'];
  
  function traverse(element: Element) {
    const tagName = element.tagName.toLowerCase();
    
    if (drawingElements.includes(tagName)) {
      // defs内の要素はスキップ
      if (!element.closest('defs')) {
        signatures.add(getElementSignature(element));
      }
    }
    
    // gグループ以外の子要素も再帰的に処理
    if (tagName !== 'g') {
      for (const child of element.children) {
        traverse(child);
      }
    }
  }
  
  for (const child of svg.children) {
    traverse(child);
  }
  
  return signatures;
}

/**
 * 子SVGに追加された要素にアニメーションクラスを追加
 */
export function addAnimationToNewElements(
  childSvg: string,
  parentSvg: string | null | undefined,
  animationClass: string = 'extended-stroke'
): string {
  if (!parentSvg) {
    // 親がない場合はそのまま返す
    return childSvg;
  }
  
  const parentDoc = parseSvg(parentSvg);
  const childDoc = parseSvg(childSvg);
  
  if (!parentDoc || !childDoc) {
    return childSvg;
  }
  
  const parentSignatures = getElementSignatures(parentDoc);
  const childSvgElement = childDoc.querySelector('svg');
  
  if (!childSvgElement) {
    return childSvg;
  }
  
  // 描画要素にアニメーションクラスを追加
  const drawingElements = ['path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'image', 'g'];
  
  function processElement(element: Element) {
    const tagName = element.tagName.toLowerCase();
    
    if (drawingElements.includes(tagName) && !element.closest('defs')) {
      const signature = getElementSignature(element);
      
      // 親に存在しない要素には新規追加マーク
      if (!parentSignatures.has(signature)) {
        element.classList.add(animationClass);
        
        // path要素の場合はstroke-dasharrayアニメーション用の属性を追加
        if (tagName === 'path') {
          // パスの長さを計算するためのヒント
          element.setAttribute('data-new-stroke', 'true');
        }
      }
    }
    
    // 子要素も処理
    for (const child of element.children) {
      processElement(child);
    }
  }
  
  for (const child of childSvgElement.children) {
    processElement(child);
  }
  
  // シリアライズして返す
  const serializer = new XMLSerializer();
  return serializer.serializeToString(childSvgElement);
}

/**
 * SVGにストロークアニメーション用のスタイルを注入
 */
export function injectStrokeAnimationStyles(svg: string): string {
  const styleContent = `
    <style>
      .extended-stroke {
        animation: drawStroke 1.5s ease-out forwards;
        stroke-dasharray: 2000;
        stroke-dashoffset: 2000;
      }
      @keyframes drawStroke {
        to {
          stroke-dashoffset: 0;
        }
      }
      .extended-stroke[data-new-stroke="true"] {
        animation: drawStroke 1.5s ease-out forwards;
      }
    </style>
  `;
  
  // SVGタグの直後にスタイルを挿入
  return svg.replace(/<svg([^>]*)>/, `<svg$1>${styleContent}`);
}

/**
 * 全てのストローク要素にアニメーションクラスを追加（通常表示用）
 */
export function addAnimationToAllStrokes(
  svg: string,
  animationClass: string = 'extended-stroke'
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  const svgElement = doc.querySelector('svg');
  
  if (!svgElement) {
    return svg;
  }
  
  // 描画要素にアニメーションクラスを追加
  const strokeElements = ['path', 'line', 'polyline', 'polygon'];
  let delay = 0;
  
  function processElement(element: Element) {
    const tagName = element.tagName.toLowerCase();
    
    // defs内の要素はスキップ
    if (element.closest('defs')) {
      return;
    }
    
    if (strokeElements.includes(tagName)) {
      // stroke属性を持つ要素のみ
      const stroke = element.getAttribute('stroke');
      if (stroke && stroke !== 'none') {
        element.classList.add(animationClass);
        element.setAttribute('data-new-stroke', 'true');
        // 連続したアニメーションのためにディレイを追加
        element.setAttribute('style', `animation-delay: ${delay}ms`);
        delay += 50; // 50msずつずらす
      }
    }
    
    // 子要素も処理
    for (const child of element.children) {
      processElement(child);
    }
  }
  
  for (const child of svgElement.children) {
    processElement(child);
  }
  
  // シリアライズして返す
  const serializer = new XMLSerializer();
  return serializer.serializeToString(svgElement);
}

