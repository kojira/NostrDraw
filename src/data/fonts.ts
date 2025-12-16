// 日本語フリーフォント一覧（Google Fonts）

export interface FontOption {
  id: string;
  name: string;
  family: string; // CSS font-family
  category: 'gothic' | 'mincho' | 'rounded' | 'handwriting' | 'decorative';
  weight?: number;
}

export const JAPANESE_FONTS: FontOption[] = [
  // ゴシック系
  {
    id: 'noto-sans-jp',
    name: 'Noto Sans JP',
    family: '"Noto Sans JP", sans-serif',
    category: 'gothic',
  },
  {
    id: 'zen-kaku-gothic-new',
    name: 'Zen角ゴシック',
    family: '"Zen Kaku Gothic New", sans-serif',
    category: 'gothic',
  },
  {
    id: 'mplus-1p',
    name: 'M PLUS 1p',
    family: '"M PLUS 1p", sans-serif',
    category: 'gothic',
  },
  {
    id: 'sawarabi-gothic',
    name: 'さわらびゴシック',
    family: '"Sawarabi Gothic", sans-serif',
    category: 'gothic',
  },
  {
    id: 'kosugi',
    name: '小杉ゴシック',
    family: '"Kosugi", sans-serif',
    category: 'gothic',
  },
  {
    id: 'biz-udpgothic',
    name: 'BIZ UDPゴシック',
    family: '"BIZ UDPGothic", sans-serif',
    category: 'gothic',
  },
  {
    id: 'murecho',
    name: 'Murecho',
    family: '"Murecho", sans-serif',
    category: 'gothic',
  },

  // 明朝系
  {
    id: 'noto-serif-jp',
    name: 'Noto Serif JP',
    family: '"Noto Serif JP", serif',
    category: 'mincho',
  },
  {
    id: 'shippori-mincho',
    name: 'しっぽり明朝',
    family: '"Shippori Mincho", serif',
    category: 'mincho',
  },
  {
    id: 'zen-old-mincho',
    name: 'Zen Old明朝',
    family: '"Zen Old Mincho", serif',
    category: 'mincho',
  },
  {
    id: 'sawarabi-mincho',
    name: 'さわらび明朝',
    family: '"Sawarabi Mincho", serif',
    category: 'mincho',
  },
  {
    id: 'biz-udpmincho',
    name: 'BIZ UDP明朝',
    family: '"BIZ UDPMincho", serif',
    category: 'mincho',
  },
  {
    id: 'klee-one',
    name: 'Klee One',
    family: '"Klee One", serif',
    category: 'mincho',
  },
  {
    id: 'shippori-mincho-b1',
    name: 'しっぽり明朝B1',
    family: '"Shippori Mincho B1", serif',
    category: 'mincho',
  },

  // 丸ゴシック系
  {
    id: 'zen-maru-gothic',
    name: 'Zen丸ゴシック',
    family: '"Zen Maru Gothic", sans-serif',
    category: 'rounded',
  },
  {
    id: 'mplus-rounded-1c',
    name: 'M PLUS Rounded 1c',
    family: '"M PLUS Rounded 1c", sans-serif',
    category: 'rounded',
  },
  {
    id: 'kosugi-maru',
    name: '小杉丸ゴシック',
    family: '"Kosugi Maru", sans-serif',
    category: 'rounded',
  },
  {
    id: 'kiwi-maru',
    name: 'キウイ丸',
    family: '"Kiwi Maru", serif',
    category: 'rounded',
  },
  {
    id: 'dela-gothic-one',
    name: 'デラゴシック',
    family: '"Dela Gothic One", cursive',
    category: 'rounded',
  },

  // 手書き風
  {
    id: 'yomogi',
    name: 'よもぎ',
    family: '"Yomogi", cursive',
    category: 'handwriting',
  },
  {
    id: 'yusei-magic',
    name: '油性マジック',
    family: '"Yusei Magic", sans-serif',
    category: 'handwriting',
  },
  {
    id: 'zen-kurenaido',
    name: 'Zen紅道',
    family: '"Zen Kurenaido", sans-serif',
    category: 'handwriting',
  },
  {
    id: 'kaisei-decol',
    name: '解星デコール',
    family: '"Kaisei Decol", serif',
    category: 'handwriting',
  },
  {
    id: 'kaisei-tokumin',
    name: '解星オプティ',
    family: '"Kaisei Tokumin", serif',
    category: 'handwriting',
  },
  {
    id: 'reggae-one',
    name: 'レゲエ One',
    family: '"Reggae One", cursive',
    category: 'handwriting',
  },

  // デコラティブ・ポップ
  {
    id: 'hachi-maru-pop',
    name: 'はちまるポップ',
    family: '"Hachi Maru Pop", cursive',
    category: 'decorative',
  },
  {
    id: 'potta-one',
    name: 'ポッタOne',
    family: '"Potta One", cursive',
    category: 'decorative',
  },
  {
    id: 'rocknroll-one',
    name: 'ロックンロールOne',
    family: '"RocknRoll One", sans-serif',
    category: 'decorative',
  },
  {
    id: 'stick',
    name: 'Stick',
    family: '"Stick", sans-serif',
    category: 'decorative',
  },
  {
    id: 'dotgothic16',
    name: 'ドットゴシック16',
    family: '"DotGothic16", sans-serif',
    category: 'decorative',
  },
  {
    id: 'mochiy-pop-one',
    name: 'モチィポップOne',
    family: '"Mochiy Pop One", sans-serif',
    category: 'decorative',
  },
  {
    id: 'mochiy-pop-p-one',
    name: 'モチィポップPOne',
    family: '"Mochiy Pop P One", sans-serif',
    category: 'decorative',
  },
  {
    id: 'rampart-one',
    name: 'ランパートOne',
    family: '"Rampart One", cursive',
    category: 'decorative',
  },
  {
    id: 'train-one',
    name: 'トレインOne',
    family: '"Train One", cursive',
    category: 'decorative',
  },
  {
    id: 'cherry-bomb-one',
    name: 'チェリーボム',
    family: '"Cherry Bomb One", cursive',
    category: 'decorative',
  },
];

// カテゴリ名のマッピング
export const FONT_CATEGORIES: Record<FontOption['category'], string> = {
  gothic: 'ゴシック',
  mincho: '明朝',
  rounded: '丸ゴシック',
  handwriting: '手書き風',
  decorative: 'デコラティブ',
};

// Google FontsのURL生成
export function getGoogleFontsUrl(): string {
  const families = JAPANESE_FONTS.map(font => {
    // フォントファミリー名を抽出（引用符を除去）
    const familyName = font.family.split(',')[0].replace(/"/g, '').trim();
    return familyName.replace(/ /g, '+');
  }).join('&family=');
  
  return `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
}

