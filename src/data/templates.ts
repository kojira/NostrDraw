// お絵描き用テンプレートとスタンプ

export interface Template {
  id: string;
  name: string;
  svg: string; // viewBox="0 0 400 300" 想定
}

export interface Stamp {
  id: string;
  name: string;
  svg: string; // スタンプ用SVG（小さめ）
  width: number;
  height: number;
}

// ベーステンプレート
export const TEMPLATES: Template[] = [
  {
    id: 'blank',
    name: '白紙',
    svg: `<rect width="400" height="300" fill="#ffffff"/>`,
  },
  {
    id: 'ema',
    name: '絵馬',
    svg: `<defs>
    <linearGradient id="woodGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#DEB887"/>
      <stop offset="50%" style="stop-color:#D2B48C"/>
      <stop offset="100%" style="stop-color:#C4A574"/>
    </linearGradient>
  </defs>
  <rect width="400" height="300" fill="#f5f5dc"/>
  <path d="M40 80 L200 30 L360 80 L360 250 Q200 270 40 250 Z" fill="url(#woodGrad)" stroke="#8B4513" stroke-width="4"/>
  <g stroke="#C4A574" stroke-width="0.5" opacity="0.5">
    <path d="M60 120 Q200 110 340 120"/>
    <path d="M50 170 Q200 160 350 170"/>
    <path d="M60 220 Q200 210 340 220"/>
  </g>
  <circle cx="200" cy="55" r="10" fill="#8B4513"/>
  <circle cx="200" cy="55" r="6" fill="#5D3A1A"/>
  <path d="M190 55 Q160 35 150 15 Q140 0 160 0 Q180 5 192 30" stroke="#e94560" stroke-width="4" fill="none"/>
  <path d="M210 55 Q240 35 250 15 Q260 0 240 0 Q220 5 208 30" stroke="#e94560" stroke-width="4" fill="none"/>`,
  },
  {
    id: 'postcard',
    name: 'ハガキ',
    svg: `<rect width="400" height="300" fill="#FFF8F0"/>
  <rect x="5" y="5" width="390" height="290" fill="none" stroke="#d4a574" stroke-width="2"/>
  <line x1="200" y1="20" x2="200" y2="280" stroke="#d4a574" stroke-width="1" stroke-dasharray="5,5"/>
  <rect x="300" y="20" width="80" height="50" fill="none" stroke="#e94560" stroke-width="2"/>
  <text x="340" y="50" font-family="serif" font-size="10" fill="#e94560" text-anchor="middle">切手</text>
  <g stroke="#d4a574" stroke-width="1">
    <line x1="220" y1="80" x2="380" y2="80"/>
    <line x1="220" y1="120" x2="380" y2="120"/>
    <line x1="220" y1="160" x2="380" y2="160"/>
    <line x1="220" y1="200" x2="380" y2="200"/>
    <line x1="220" y1="240" x2="380" y2="240"/>
  </g>`,
  },
  {
    id: 'washi',
    name: '和紙',
    svg: `<rect width="400" height="300" fill="#FDF5E6"/>
  <circle cx="350" cy="50" r="40" fill="#e94560" opacity="0.7"/>
  <g transform="translate(30, 250)">
    <circle cx="0" cy="0" r="12" fill="#e94560"/>
    <circle cx="0" cy="-15" r="6" fill="#FFB6C1"/>
    <circle cx="14" cy="-5" r="6" fill="#FFB6C1"/>
    <circle cx="9" cy="12" r="6" fill="#FFB6C1"/>
    <circle cx="-9" cy="12" r="6" fill="#FFB6C1"/>
    <circle cx="-14" cy="-5" r="6" fill="#FFB6C1"/>
    <circle cx="0" cy="0" r="4" fill="#FFD700"/>
  </g>
  <g transform="translate(370, 270)">
    <circle cx="0" cy="0" r="8" fill="#e94560"/>
    <circle cx="0" cy="-10" r="4" fill="#FFB6C1"/>
    <circle cx="9.5" cy="-3" r="4" fill="#FFB6C1"/>
    <circle cx="5.9" cy="8" r="4" fill="#FFB6C1"/>
    <circle cx="-5.9" cy="8" r="4" fill="#FFB6C1"/>
    <circle cx="-9.5" cy="-3" r="4" fill="#FFB6C1"/>
    <circle cx="0" cy="0" r="3" fill="#FFD700"/>
  </g>`,
  },
  {
    id: 'newyear',
    name: '謹賀新年',
    svg: `<rect width="400" height="300" fill="#FFF5F5"/>
  <text x="200" y="50" font-family="serif" font-size="32" font-weight="bold" fill="#e94560" text-anchor="middle">謹賀新年</text>
  <text x="200" y="280" font-family="sans-serif" font-size="16" fill="#888" text-anchor="middle">2026</text>
  <g stroke="#e94560" stroke-width="2" fill="none" opacity="0.3">
    <path d="M10 70 Q50 60 90 70"/>
    <path d="M310 70 Q350 60 390 70"/>
    <path d="M10 250 Q50 260 90 250"/>
    <path d="M310 250 Q350 260 390 250"/>
  </g>`,
  },
];

// スタンプ
export const STAMPS: Stamp[] = [
  {
    id: 'horse',
    name: '馬',
    width: 60,
    height: 50,
    svg: `<ellipse cx="30" cy="30" rx="20" ry="15" fill="#8B4513"/>
<path d="M20 22 Q10 10 15 5 Q25 8 22 18" fill="#8B4513"/>
<ellipse cx="18" cy="12" rx="8" ry="6" fill="#A0522D"/>
<circle cx="16" cy="10" r="2" fill="#333"/>
<path d="M12 5 Q10 0 14 0 Q16 2 14 5" fill="#A0522D"/>
<path d="M22 4 Q24 -1 28 1 Q26 5 23 6" fill="#A0522D"/>
<path d="M10 8 Q5 12 3 20" stroke="#5D3A1A" stroke-width="2" fill="none"/>
<rect x="12" y="38" width="5" height="12" rx="2" fill="#8B4513"/>
<rect x="23" y="38" width="5" height="12" rx="2" fill="#8B4513"/>
<rect x="35" y="38" width="5" height="12" rx="2" fill="#8B4513"/>
<rect x="43" y="38" width="5" height="12" rx="2" fill="#8B4513"/>
<path d="M48 28 Q55 25 58 32 Q52 30 50 35" fill="#5D3A1A"/>`,
  },
  {
    id: 'ostrich',
    name: '紫のダチョウ',
    width: 50,
    height: 60,
    svg: `<ellipse cx="25" cy="40" rx="18" ry="15" fill="#9b5de5"/>
<path d="M25 30 Q25 15 20 5" stroke="#9b5de5" stroke-width="4" fill="none"/>
<circle cx="18" cy="5" r="6" fill="#9b5de5"/>
<circle cx="16" cy="4" r="2" fill="#fff"/>
<circle cx="16" cy="4" r="1" fill="#333"/>
<path d="M12 6 L8 5 L12 8" fill="#ff6b6b"/>
<path d="M22 0 Q25 -3 28 0" stroke="#9b5de5" stroke-width="2" fill="none"/>
<rect x="15" y="50" width="4" height="10" fill="#ff6b6b"/>
<rect x="27" y="50" width="4" height="10" fill="#ff6b6b"/>
<path d="M40 35 Q50 30 55 38 Q48 36 45 42 Q52 38 58 45" fill="#9b5de5"/>`,
  },
  {
    id: 'octopus-sausage',
    name: 'タコさんウインナー',
    width: 40,
    height: 45,
    svg: `<ellipse cx="20" cy="15" rx="15" ry="12" fill="#e94560"/>
<circle cx="14" cy="12" r="3" fill="#fff"/>
<circle cx="14" cy="12" r="1.5" fill="#333"/>
<circle cx="26" cy="12" r="3" fill="#fff"/>
<circle cx="26" cy="12" r="1.5" fill="#333"/>
<path d="M16 20 Q20 24 24 20" stroke="#333" stroke-width="1.5" fill="none"/>
<path d="M5 25 Q0 35 5 45" stroke="#e94560" stroke-width="4" stroke-linecap="round" fill="none"/>
<path d="M12 27 Q8 37 12 45" stroke="#e94560" stroke-width="4" stroke-linecap="round" fill="none"/>
<path d="M20 28 Q20 38 20 45" stroke="#e94560" stroke-width="4" stroke-linecap="round" fill="none"/>
<path d="M28 27 Q32 37 28 45" stroke="#e94560" stroke-width="4" stroke-linecap="round" fill="none"/>
<path d="M35 25 Q40 35 35 45" stroke="#e94560" stroke-width="4" stroke-linecap="round" fill="none"/>
<ellipse cx="12" cy="8" rx="4" ry="2" fill="#ff8a8a"/>`,
  },
  {
    id: 'emoji-kadomatsu',
    name: '🎍',
    width: 40,
    height: 40,
    svg: `<text x="20" y="32" font-size="32" text-anchor="middle">🎍</text>`,
  },
  {
    id: 'emoji-horse',
    name: '🐴',
    width: 40,
    height: 40,
    svg: `<text x="20" y="32" font-size="32" text-anchor="middle">🐴</text>`,
  },
  {
    id: 'emoji-sakura',
    name: '🌸',
    width: 40,
    height: 40,
    svg: `<text x="20" y="32" font-size="32" text-anchor="middle">🌸</text>`,
  },
  {
    id: 'emoji-party',
    name: '🎉',
    width: 40,
    height: 40,
    svg: `<text x="20" y="32" font-size="32" text-anchor="middle">🎉</text>`,
  },
  {
    id: 'emoji-fuji',
    name: '🗻',
    width: 40,
    height: 40,
    svg: `<text x="20" y="32" font-size="32" text-anchor="middle">🗻</text>`,
  },
  {
    id: 'emoji-sunrise',
    name: '🌅',
    width: 40,
    height: 40,
    svg: `<text x="20" y="32" font-size="32" text-anchor="middle">🌅</text>`,
  },
  {
    id: 'emoji-daruma',
    name: '🎯',
    width: 40,
    height: 40,
    svg: `<text x="20" y="32" font-size="32" text-anchor="middle">🎯</text>`,
  },
  {
    id: 'plum-blossom',
    name: '梅',
    width: 30,
    height: 30,
    svg: `<circle cx="15" cy="15" r="10" fill="#e94560"/>
<circle cx="15" cy="3" r="5" fill="#FFB6C1"/>
<circle cx="26" cy="10" r="5" fill="#FFB6C1"/>
<circle cx="22" cy="24" r="5" fill="#FFB6C1"/>
<circle cx="8" cy="24" r="5" fill="#FFB6C1"/>
<circle cx="4" cy="10" r="5" fill="#FFB6C1"/>
<circle cx="15" cy="15" r="4" fill="#FFD700"/>`,
  },
  {
    id: 'heart',
    name: 'ハート',
    width: 30,
    height: 28,
    svg: `<path d="M15 25 Q0 15 0 8 Q0 0 7.5 0 Q15 0 15 8 Q15 0 22.5 0 Q30 0 30 8 Q30 15 15 25" fill="#e94560"/>`,
  },
  {
    id: 'star',
    name: '星',
    width: 30,
    height: 30,
    svg: `<path d="M15 0 L18.5 11 L30 11 L21 18 L24.5 30 L15 23 L5.5 30 L9 18 L0 11 L11.5 11 Z" fill="#FFD700"/>`,
  },
];

