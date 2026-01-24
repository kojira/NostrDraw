// カラーパレット管理サービス
// kind 31899 を使用してユーザーのカラーパレットをNostrに保存

import { type Event, type EventTemplate } from 'nostr-tools';
import { fetchEvents, publishEvent } from './relay';

// パレットのkind (NostrDraw専用)
const PALETTE_KIND = 31899;
const PALETTE_D_TAG_PREFIX = 'palette';

// ローカルストレージキー（pubkeyごとに分離）
const LOCAL_PALETTES_KEY_PREFIX = 'nostrdraw-palettes';
const ACTIVE_PALETTE_KEY_PREFIX = 'nostrdraw-active-palette';
const FAVORITE_PALETTES_KEY = 'nostrdraw-favorite-palettes';

// pubkeyを含むキーを生成（未ログインの場合は'anonymous'）
function getPalettesKey(pubkey?: string): string {
  return pubkey ? `${LOCAL_PALETTES_KEY_PREFIX}-${pubkey}` : `${LOCAL_PALETTES_KEY_PREFIX}-anonymous`;
}

function getActiveKey(pubkey?: string): string {
  return pubkey ? `${ACTIVE_PALETTE_KEY_PREFIX}-${pubkey}` : `${ACTIVE_PALETTE_KEY_PREFIX}-anonymous`;
}

export interface ColorPalette {
  id: string;
  name: string;
  colors: string[];
  createdAt: number;
  updatedAt: number;
  isDefault?: boolean;
  pubkey?: string; // 著者のpubkey（ギャラリー用）
  authorPicture?: string; // 著者のアバター画像URL
  eventId?: string; // NostrイベントID
}

// デフォルトパレット
export const DEFAULT_PALETTE: ColorPalette = {
  id: 'default',
  name: 'デフォルト',
  colors: [],
  createdAt: 0,
  updatedAt: 0,
  isDefault: true,
};

// プリセットパレット（アプリ組み込み）
export const PRESET_PALETTES: ColorPalette[] = [
  {
    id: 'preset-8bit',
    name: '8bit パレット',
    colors: [
      // ファミコン（NES）カラーパレット - 54色
      // Row 0: グレースケール
      '#7C7C7C', '#BCBCBC', '#F8F8F8', '#FCFCFC',
      // Row 1: ブルー系
      '#0000FC', '#0078F8', '#3CBCFC', '#A4E4FC',
      // Row 2: パープル/バイオレット系
      '#0000BC', '#6844FC', '#9878F8', '#B8B8F8',
      // Row 3: マゼンタ/ピンク系
      '#4428BC', '#D800CC', '#F878F8', '#F8B8F8',
      // Row 4: レッド系
      '#940084', '#E40058', '#F85898', '#F8A4C0',
      // Row 5: オレンジ/レッド系
      '#A80020', '#F83800', '#F87858', '#F0D0B0',
      // Row 6: オレンジ系
      '#A81000', '#E45C10', '#FCA044', '#FCE0A8',
      // Row 7: イエロー/オレンジ系
      '#881400', '#AC7C00', '#F8B800', '#F8D878',
      // Row 8: イエロー/グリーン系
      '#503000', '#B8F818', '#D8F878', '#F8F8B8',
      // Row 9: グリーン系
      '#007800', '#00B800', '#B8F8B8', '#D8F8D8',
      // Row 10: グリーン/シアン系
      '#006800', '#00A800', '#58D854', '#B8F8B8',
      // Row 11: シアン系
      '#005800', '#008888', '#00E8D8', '#00FCFC',
      // Row 12: ダーク
      '#000000', '#080808', '#101010', '#181818',
      // 追加の便利な色
      '#F8D8B0', '#787878',
    ],
    createdAt: 0,
    updatedAt: 0,
    isDefault: false,
  },
  {
    id: 'preset-pastel',
    name: 'パステルカラー',
    colors: [
      // ピンク系
      '#FFB5E8', '#FF9CEE', '#FFCCF9', '#FCC2FF',
      // パープル/ラベンダー系
      '#DCD3FF', '#B28DFF', '#C5A3FF', '#E7C6FF',
      // ブルー系
      '#AFF8DB', '#85E3FF', '#ACE7FF', '#6EB5FF',
      // グリーン/ミント系
      '#BFFCC6', '#DBFFD6', '#C4FAF8', '#A8E6CF',
      // イエロー/オレンジ系
      '#FFF5BA', '#FFABAB', '#FFDAC1', '#FCF7BB',
      // その他パステル
      '#F6A6FF', '#97A2FF', '#A79AFF', '#FFFFD1',
      // ニュートラル
      '#FFFFFF', '#F0F0F0', '#E8E8E8', '#D0D0D0',
    ],
    createdAt: 0,
    updatedAt: 0,
    isDefault: false,
  },
  {
    id: 'preset-beach',
    name: 'ビーチサイド',
    colors: [
      // 海・水系
      '#0077B6', '#00B4D8', '#90E0EF', '#CAF0F8',
      '#48CAE4', '#023E8A', '#0096C7', '#ADE8F4',
      // 砂浜・サンド系
      '#F4A261', '#E9C46A', '#FFDA9E', '#FFF1C9',
      '#DEB887', '#F5DEB3', '#FAEBD7', '#FFE4C4',
      // サンセット系
      '#E76F51', '#F4845F', '#F9A875', '#FFCB77',
      // トロピカル系
      '#2A9D8F', '#40B89A', '#52B788', '#74C69D',
      // アクセント
      '#FF6B6B', '#FF8FA3', '#FFFFFF', '#264653',
    ],
    createdAt: 0,
    updatedAt: 0,
    isDefault: false,
  },
  {
    id: 'preset-winter',
    name: '冬景色',
    colors: [
      // 雪・氷系
      '#FFFFFF', '#F8F9FA', '#E9ECEF', '#DEE2E6',
      '#CED4DA', '#ADB5BD', '#6C757D', '#495057',
      // 冬空・ブルー系
      '#A8DADC', '#7EC8E3', '#457B9D', '#1D3557',
      '#B8D4E3', '#89CFF0', '#5DADE2', '#3498DB',
      // 冬の緑（常緑樹）
      '#1B4332', '#2D6A4F', '#40916C', '#52B788',
      // 冬のアクセント（ベリー、赤い実）
      '#9B2335', '#BE3144', '#DC3545', '#E85D75',
      // ゴールド（クリスマス、暖かみ）
      '#B8860B', '#DAA520', '#FFD700', '#F0E68C',
    ],
    createdAt: 0,
    updatedAt: 0,
    isDefault: false,
  },
  {
    id: 'preset-parfait',
    name: 'パフェ',
    colors: [
      // ホイップクリーム・バニラ
      '#FFFEF0', '#FFF8E7', '#FFEFD5', '#FFE4B5',
      // いちご・ベリー系
      '#FF6B6B', '#E84A5F', '#FF4D6D', '#C9184A',
      '#FF8FA3', '#FFB3C1', '#FFCCD5', '#FFC0CB',
      // チョコレート系
      '#5D4037', '#6D4C41', '#795548', '#8D6E63',
      '#3E2723', '#4E342E', '#A1887F', '#D7CCC8',
      // フルーツ（マンゴー、ピーチ、キウイ）
      '#FFB347', '#FFCC5C', '#FFD93D', '#96CEB4',
      '#88D8B0', '#FFDAB9', '#FFCBA4', '#FF9A8B',
      // ブルーベリー・グレープ
      '#4A4E69', '#7B68EE', '#9370DB', '#6B5B95',
      // ミント・抹茶
      '#98FB98', '#90EE90', '#8FBC8F', '#7CB342',
    ],
    createdAt: 0,
    updatedAt: 0,
    isDefault: false,
  },
  {
    id: 'preset-rpg',
    name: 'RPG',
    colors: [
      // 炎属性（ファイア）
      '#FF4500', '#FF6347', '#FF8C00', '#FFA500',
      '#DC143C', '#B22222', '#8B0000', '#FFD700',
      // 氷属性（アイス）
      '#00BFFF', '#87CEEB', '#ADD8E6', '#E0FFFF',
      '#4169E1', '#1E90FF', '#00CED1', '#AFEEEE',
      // 雷属性（サンダー）
      '#FFD700', '#FFFF00', '#F0E68C', '#BDB76B',
      // 毒・闇属性
      '#9400D3', '#8B008B', '#800080', '#4B0082',
      '#32CD32', '#228B22', '#006400', '#00FF00',
      // 回復・聖属性
      '#FFB6C1', '#FFC0CB', '#98FB98', '#90EE90',
      '#FFFACD', '#FAFAD2', '#F5F5DC', '#FFFFFF',
      // メタル・鎧
      '#708090', '#778899', '#B0C4DE', '#C0C0C0',
    ],
    createdAt: 0,
    updatedAt: 0,
    isDefault: false,
  },
  {
    id: 'preset-portrait',
    name: '人物・肖像',
    colors: [
      // 肌色（ライト）
      '#FFECD2', '#FFE4C4', '#FFDAB9', '#FFD5B8',
      '#F5DEB3', '#FFC9A8', '#E8BEAC', '#DEB887',
      // 肌色（ミディアム〜ダーク）
      '#D2A679', '#C19A6B', '#A67B5B', '#8D6E63',
      '#6B4423', '#5D4037', '#4E342E', '#3E2723',
      // 頬・唇（ピンク〜レッド）
      '#FFB6C1', '#FF9999', '#E8909C', '#DC6E6E',
      '#CD5C5C', '#C05050', '#A52A2A', '#8B0000',
      // 髪色（ブロンド〜ブラウン〜ブラック）
      '#FFF8DC', '#F5DEB3', '#D2B48C', '#A0522D',
      '#8B4513', '#654321', '#3D2314', '#1C1C1C',
      // 目の色
      '#4169E1', '#2E8B57', '#8B4513', '#556B2F',
      // ハイライト・影
      '#FFFFFF', '#F0F0F0', '#808080', '#000000',
    ],
    createdAt: 0,
    updatedAt: 0,
    isDefault: false,
  },
  {
    id: 'preset-cyberpunk',
    name: 'サイバーパンク',
    colors: [
      // ネオンピンク・マゼンタ
      '#FF00FF', '#FF1493', '#FF69B4', '#FF007F',
      '#E500A4', '#BC13FE', '#FF10F0', '#FF6EC7',
      // ネオンブルー・シアン
      '#00FFFF', '#00BFFF', '#00CED1', '#40E0D0',
      '#00F5FF', '#08F7FE', '#01CDFE', '#0FF0FC',
      // ネオングリーン
      '#00FF00', '#39FF14', '#7FFF00', '#ADFF2F',
      // パープル・バイオレット
      '#9400D3', '#8A2BE2', '#9932CC', '#BA55D3',
      // ダーク背景
      '#0D0221', '#0F0A1E', '#1A1A2E', '#16213E',
      '#000000', '#0F0F0F', '#1C1C1C', '#2D2D2D',
    ],
    createdAt: 0,
    updatedAt: 0,
    isDefault: false,
  },
  {
    id: 'preset-japanese',
    name: '和風・伝統色',
    colors: [
      // 赤系（朱・紅・茜）
      '#E60033', '#C53D43', '#B7282E', '#A22041',
      '#E83929', '#CB4042', '#9E3D3F', '#8E354A',
      // 青系（藍・紺・瑠璃）
      '#165E83', '#264348', '#223A70', '#0D5661',
      '#007BBB', '#2E4B71', '#192F60', '#003F8E',
      // 緑系（若草・萌黄・松葉）
      '#98D98E', '#A8D8B9', '#6B7B4C', '#3B7960',
      '#00896C', '#69B076', '#5DAC81', '#028760',
      // 黄・金系
      '#E6B422', '#EDAE00', '#C89932', '#FFD700',
      // 紫系
      '#884898', '#7058A3', '#674598', '#5A4498',
      // 白・黒・灰
      '#FFFFFB', '#E8E8E8', '#727171', '#2B2B2B',
    ],
    createdAt: 0,
    updatedAt: 0,
    isDefault: false,
  },
  {
    id: 'preset-halloween',
    name: 'ハロウィン',
    colors: [
      // オレンジ（かぼちゃ）
      '#FF6600', '#FF8C00', '#FFA500', '#FF7518',
      '#E65C00', '#CC5500', '#FF9933', '#FFB347',
      // 黒（コウモリ・夜）
      '#000000', '#1A1A1A', '#2D2D2D', '#1C1C1C',
      '#0D0D0D', '#262626', '#333333', '#404040',
      // 紫（魔女・魔法）
      '#663399', '#800080', '#9932CC', '#8B008B',
      '#6A0DAD', '#7B68EE', '#9370DB', '#BA55D3',
      // 緑（毒・モンスター）
      '#00FF00', '#32CD32', '#228B22', '#6B8E23',
      // 血の赤
      '#8B0000', '#B22222', '#DC143C', '#FF0000',
      // 骨・ゴースト
      '#FFFAF0', '#F5F5DC', '#FAF0E6', '#FFFFFF',
    ],
    createdAt: 0,
    updatedAt: 0,
    isDefault: false,
  },
  {
    id: 'preset-galaxy',
    name: '宇宙・ギャラクシー',
    colors: [
      // 深い宇宙（ダークブルー・パープル）
      '#0B0B2B', '#1A1A40', '#0D1B2A', '#16213E',
      '#1B1464', '#240046', '#3C096C', '#10002B',
      // 星雲（パープル・ピンク）
      '#7B2CBF', '#9D4EDD', '#C77DFF', '#E0AAFF',
      '#9B5DE5', '#F15BB5', '#FF99C8', '#E056FD',
      // 星の光
      '#FFFFFF', '#FFFACD', '#FFD700', '#FFA500',
      '#F0E68C', '#FAFAD2', '#FFFAF0', '#F8F8FF',
      // ブルー星雲
      '#00B4D8', '#0096C7', '#48CAE4', '#90E0EF',
      // グリーン星雲
      '#2DC653', '#57CC99', '#80ED99', '#B7E4C7',
    ],
    createdAt: 0,
    updatedAt: 0,
    isDefault: false,
  },
  {
    id: 'preset-forest',
    name: '自然・フォレスト',
    colors: [
      // 木の葉（緑のグラデーション）
      '#228B22', '#2E8B57', '#3CB371', '#90EE90',
      '#006400', '#008000', '#32CD32', '#98FB98',
      '#556B2F', '#6B8E23', '#9ACD32', '#7CFC00',
      // 木の幹・土（ブラウン系）
      '#8B4513', '#A0522D', '#6B4423', '#D2691E',
      '#5D4037', '#795548', '#8D6E63', '#A1887F',
      // 花・アクセント
      '#FFD700', '#FF6347', '#FF69B4', '#DDA0DD',
      // 空・水
      '#87CEEB', '#ADD8E6', '#E0FFFF', '#F0FFFF',
      // 岩
      '#808080', '#696969', '#A9A9A9', '#778899',
    ],
    createdAt: 0,
    updatedAt: 0,
    isDefault: false,
  },
  {
    id: 'preset-retro',
    name: 'レトロポップ',
    colors: [
      // 60s-70s ビビッド
      '#FF6F61', '#FFD700', '#32CD32', '#00CED1',
      '#FF1493', '#FF4500', '#8A2BE2', '#00FF7F',
      // オレンジ・イエロー
      '#FF8C00', '#FFA07A', '#FFFF00', '#F0E68C',
      '#FF7F50', '#FFD93D', '#FFEAA7', '#FDCB6E',
      // ブラウン・アース
      '#D2691E', '#CD853F', '#DEB887', '#F5DEB3',
      // ターコイズ・ティール
      '#40E0D0', '#48D1CC', '#20B2AA', '#008B8B',
      // レトロピンク・レッド
      '#FF69B4', '#DB7093', '#C71585', '#DC143C',
      // クリーム・オフホワイト
      '#FFFDD0', '#FFF8DC', '#FAEBD7', '#FAF0E6',
    ],
    createdAt: 0,
    updatedAt: 0,
    isDefault: false,
  },
  {
    id: 'preset-grayscale',
    name: 'モノクロ',
    colors: [
      // 完全なグレースケール（16段階）
      '#FFFFFF', '#F0F0F0', '#E0E0E0', '#D0D0D0',
      '#C0C0C0', '#B0B0B0', '#A0A0A0', '#909090',
      '#808080', '#707070', '#606060', '#505050',
      '#404040', '#303030', '#202020', '#101010',
      '#000000', '#0A0A0A', '#141414', '#1E1E1E',
      '#282828', '#323232', '#3C3C3C', '#464646',
      // セピア調
      '#704214', '#8B7355', '#A0826D', '#BC987E',
      '#D7B899', '#E8D4B8', '#F5EBE0', '#FAF0E6',
    ],
    createdAt: 0,
    updatedAt: 0,
    isDefault: false,
  },
  {
    id: 'preset-candy',
    name: 'キャンディポップ',
    colors: [
      // ピンク・マゼンタ
      '#FF69B4', '#FF1493', '#FF85A2', '#FFB6C1',
      '#FF007F', '#FF3399', '#FF66B2', '#FF99CC',
      // ブルー・シアン
      '#00BFFF', '#1E90FF', '#87CEFA', '#ADD8E6',
      '#00CED1', '#40E0D0', '#7FFFD4', '#AFEEEE',
      // グリーン・イエロー
      '#7CFC00', '#00FF7F', '#98FB98', '#90EE90',
      '#FFFF00', '#FFD700', '#FFA500', '#FFDAB9',
      // パープル
      '#EE82EE', '#DA70D6', '#DDA0DD', '#E6E6FA',
      // ホワイト
      '#FFFFFF', '#FFFAFA', '#FFF5EE', '#FFFAF0',
    ],
    createdAt: 0,
    updatedAt: 0,
    isDefault: false,
  },
  {
    id: 'preset-sunset',
    name: '夕焼け・サンセット',
    colors: [
      // オレンジ・イエロー（太陽）
      '#FF4500', '#FF6347', '#FF7F50', '#FFA07A',
      '#FF8C00', '#FFA500', '#FFD700', '#FFFF00',
      // ピンク・マゼンタ（空）
      '#FF69B4', '#FF1493', '#DB7093', '#FFB6C1',
      '#E75480', '#FF6B6B', '#FF8E8E', '#FFB3B3',
      // パープル・バイオレット（夕暮れ）
      '#9400D3', '#8B008B', '#800080', '#9932CC',
      '#663399', '#7B68EE', '#9370DB', '#BA55D3',
      // ブルー（夜への移行）
      '#4169E1', '#6495ED', '#87CEEB', '#1E3A5F',
      // シルエット
      '#2F2F2F', '#1A1A1A', '#000000', '#0D0D0D',
    ],
    createdAt: 0,
    updatedAt: 0,
    isDefault: false,
  },
];

// プリセットパレットIDかどうかを判定
export function isPresetPalette(id: string): boolean {
  return id.startsWith('preset-');
}

// ローカルストレージからパレット一覧を取得
export function loadPalettesFromLocal(pubkey?: string): ColorPalette[] {
  try {
    const key = getPalettesKey(pubkey);
    const saved = localStorage.getItem(key);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // エラーを無視
  }
  return [DEFAULT_PALETTE];
}

// ローカルストレージにパレット一覧を保存
export function savePalettesToLocal(palettes: ColorPalette[], pubkey?: string): void {
  try {
    const key = getPalettesKey(pubkey);
    localStorage.setItem(key, JSON.stringify(palettes));
  } catch {
    // エラーを無視
  }
}

// アクティブなパレットIDを取得
export function getActivePaletteId(pubkey?: string): string {
  try {
    const key = getActiveKey(pubkey);
    return localStorage.getItem(key) || 'default';
  } catch {
    return 'default';
  }
}

// アクティブなパレットIDを設定
export function setActivePaletteId(id: string, pubkey?: string): void {
  try {
    const key = getActiveKey(pubkey);
    localStorage.setItem(key, id);
  } catch {
    // エラーを無視
  }
}

// イベントをパレットに変換
function eventToPalette(event: Event): ColorPalette | null {
  const dTag = event.tags.find(t => t[0] === 'd');
  if (!dTag || !dTag[1]?.startsWith(PALETTE_D_TAG_PREFIX)) {
    return null;
  }
  
  const id = dTag[1].replace(`${PALETTE_D_TAG_PREFIX}-`, '') || event.id;
  
  try {
    const content = JSON.parse(event.content);
    // 削除されたパレットはスキップ
    if (content.deleted) {
      return null;
    }
    return {
      id,
      name: content.name || 'パレット',
      colors: content.colors || [],
      createdAt: event.created_at,
      updatedAt: event.created_at,
      pubkey: event.pubkey,
      eventId: event.id,
    };
  } catch {
    return null;
  }
}

// パレットをNostrから取得（自分のパレット）
export async function fetchPalettesFromNostr(pubkey: string): Promise<ColorPalette[]> {
  try {
    const events = await fetchEvents({
      kinds: [PALETTE_KIND],
      authors: [pubkey],
    });

    // dタグでフィルタリングしてパレットに変換
    return events
      .map(eventToPalette)
      .filter((p): p is ColorPalette => p !== null);
  } catch (error) {
    console.error('Failed to fetch palettes from Nostr:', error);
    return [];
  }
}

// パレットギャラリー用：最近の公開パレットを取得
export async function fetchPublicPalettes(limit: number = 50): Promise<ColorPalette[]> {
  try {
    const events = await fetchEvents({
      kinds: [PALETTE_KIND],
      limit,
    });

    // パレットに変換
    const palettes = events
      .map(eventToPalette)
      .filter((p): p is ColorPalette => p !== null && p.colors.length > 0);
    
    // 新しい順にソート
    return palettes.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error('Failed to fetch public palettes:', error);
    return [];
  }
}

// パレットをNostrに保存
export async function savePaletteToNostr(
  palette: ColorPalette,
  signEvent: (event: EventTemplate) => Promise<Event>
): Promise<boolean> {
  try {
    const eventTemplate: EventTemplate = {
      kind: PALETTE_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', `${PALETTE_D_TAG_PREFIX}-${palette.id}`],
      ],
      content: JSON.stringify({
        name: palette.name,
        colors: palette.colors,
      }),
    };

    const signedEvent = await signEvent(eventTemplate);
    await publishEvent(signedEvent);
    return true;
  } catch (error) {
    console.error('Failed to save palette to Nostr:', error);
    return false;
  }
}

// パレットをNostrから削除（空の内容で上書き）
export async function deletePaletteFromNostr(
  paletteId: string,
  signEvent: (event: EventTemplate) => Promise<Event>
): Promise<boolean> {
  try {
    const eventTemplate: EventTemplate = {
      kind: PALETTE_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', `${PALETTE_D_TAG_PREFIX}-${paletteId}`],
      ],
      content: JSON.stringify({
        deleted: true,
      }),
    };

    const signedEvent = await signEvent(eventTemplate);
    await publishEvent(signedEvent);
    return true;
  } catch (error) {
    console.error('Failed to delete palette from Nostr:', error);
    return false;
  }
}

// ユニークなパレットIDを生成
export function generatePaletteId(): string {
  return `palette-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// お気に入りパレットのdタグ
const FAVORITE_PALETTES_D_TAG = 'nostrdraw-favorite-palettes';

// お気に入りパレットのキーを取得（ユーザーごとに分離）
function getFavoritePalettesKey(pubkey?: string): string {
  return pubkey ? `${FAVORITE_PALETTES_KEY}-${pubkey}` : `${FAVORITE_PALETTES_KEY}-anonymous`;
}

// お気に入りパレットID一覧を取得（ローカル）
export function getFavoritePaletteIds(pubkey?: string): string[] {
  try {
    const key = getFavoritePalettesKey(pubkey);
    const saved = localStorage.getItem(key);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // エラーを無視
  }
  return [];
}

// お気に入りパレットID一覧を保存（ローカル）
export function saveFavoritePaletteIds(ids: string[], pubkey?: string): void {
  try {
    const key = getFavoritePalettesKey(pubkey);
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // エラーを無視
  }
}

// パレットをお気に入りに追加（ローカル）
export function addFavoritePalette(eventId: string, pubkey?: string): void {
  const ids = getFavoritePaletteIds(pubkey);
  if (!ids.includes(eventId)) {
    ids.push(eventId);
    saveFavoritePaletteIds(ids, pubkey);
  }
}

// パレットをお気に入りから削除（ローカル）
export function removeFavoritePalette(eventId: string, pubkey?: string): void {
  const ids = getFavoritePaletteIds(pubkey);
  const filtered = ids.filter(id => id !== eventId);
  saveFavoritePaletteIds(filtered, pubkey);
}

// パレットがお気に入りかどうか
export function isFavoritePalette(eventId: string, pubkey?: string): boolean {
  const ids = getFavoritePaletteIds(pubkey);
  return ids.includes(eventId);
}

// お気に入りパレットをNostrから取得
export async function fetchFavoritePalettesFromNostr(pubkey: string): Promise<string[]> {
  try {
    const events = await fetchEvents({
      kinds: [PALETTE_KIND],
      authors: [pubkey],
      '#d': [FAVORITE_PALETTES_D_TAG],
    });

    if (events.length === 0) return [];

    // 最新のイベントを使用
    const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];
    const content = JSON.parse(latestEvent.content);
    return content.favoriteIds || [];
  } catch (error) {
    console.error('Failed to fetch favorite palettes from Nostr:', error);
    return [];
  }
}

// お気に入りパレットをNostrに保存
export async function saveFavoritePalettesToNostr(
  favoriteIds: string[],
  signEvent: (event: EventTemplate) => Promise<Event>
): Promise<boolean> {
  try {
    const eventTemplate: EventTemplate = {
      kind: PALETTE_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', FAVORITE_PALETTES_D_TAG],
      ],
      content: JSON.stringify({
        favoriteIds,
      }),
    };

    const signedEvent = await signEvent(eventTemplate);
    await publishEvent(signedEvent);
    return true;
  } catch (error) {
    console.error('Failed to save favorite palettes to Nostr:', error);
    return false;
  }
}

// お気に入りパレットを同期（Nostrから取得してローカルにマージ）
export async function syncFavoritePalettes(pubkey: string): Promise<string[]> {
  const cloudFavorites = await fetchFavoritePalettesFromNostr(pubkey);
  const localFavorites = getFavoritePaletteIds(pubkey);
  
  // マージ（重複を除去）
  const merged = [...new Set([...localFavorites, ...cloudFavorites])];
  saveFavoritePaletteIds(merged, pubkey);
  
  return merged;
}

// お気に入りパレットの実際のデータを取得
export async function fetchFavoritePaletteData(favoriteIds: string[]): Promise<ColorPalette[]> {
  if (favoriteIds.length === 0) return [];
  
  const results: ColorPalette[] = [];
  
  // プリセットパレットのIDを分離
  const presetIds = favoriteIds.filter(id => isPresetPalette(id));
  const nostrIds = favoriteIds.filter(id => !isPresetPalette(id));
  
  // プリセットパレットを追加
  for (const id of presetIds) {
    const preset = PRESET_PALETTES.find(p => p.id === id);
    if (preset) {
      results.push(preset);
    }
  }
  
  // Nostrからパレットを取得
  if (nostrIds.length > 0) {
    try {
      const events = await fetchEvents({
        kinds: [PALETTE_KIND],
        ids: nostrIds,
      });

      const nostrPalettes = events
        .map(eventToPalette)
        .filter((p): p is ColorPalette => p !== null && p.colors.length > 0);
      
      results.push(...nostrPalettes);
    } catch (error) {
      console.error('Failed to fetch favorite palette data:', error);
    }
  }
  
  return results;
}

// 特定ユーザーのパレットを取得
export async function fetchPalettesByAuthor(pubkey: string): Promise<ColorPalette[]> {
  try {
    const events = await fetchEvents({
      kinds: [PALETTE_KIND],
      authors: [pubkey],
    });

    // dタグでフィルタリングしてパレットに変換
    const palettes = events
      .map(eventToPalette)
      .filter((p): p is ColorPalette => p !== null && p.colors.length > 0);
    
    // 新しい順にソート
    return palettes.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error('Failed to fetch palettes by author:', error);
    return [];
  }
}

// 全ユーザーのお気に入りリストを取得して、各パレットの人気度（お気に入り数）をカウント
export async function fetchPalettePopularityCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  
  try {
    // 全ユーザーのお気に入りリストイベントを取得
    const events = await fetchEvents({
      kinds: [PALETTE_KIND],
      '#d': [FAVORITE_PALETTES_D_TAG],
      limit: 500,
    });

    // 各イベントからfavoriteIdsを抽出してカウント
    for (const event of events) {
      try {
        const content = JSON.parse(event.content);
        const favoriteIds = content.favoriteIds || [];
        for (const id of favoriteIds) {
          counts.set(id, (counts.get(id) || 0) + 1);
        }
      } catch {
        // JSONパースエラーは無視
      }
    }
  } catch (error) {
    console.error('Failed to fetch palette popularity counts:', error);
  }
  
  return counts;
}
