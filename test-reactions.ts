// リアクションイベントの中身を確認するテストスクリプト
import { SimplePool } from 'nostr-tools';

const RELAYS = [
  'wss://yabu.me',
  'wss://r.kojira.io',
  'wss://x.kojira.io',
];

// 「ひのえうま」のカードを調べる
// Popularで6、CardFlipで7となるカード

async function main() {
  const pool = new SimplePool();
  
  console.log('リレーに接続中...');
  
  // kind 31898のイベントを取得（ひのえうまのカードを探す）
  console.log('\n=== kind 31898 のイベントを取得 ===');
  const cards = await pool.querySync(RELAYS, {
    kinds: [31898],
    limit: 50,
  });
  
  console.log(`取得したカード数: ${cards.length}`);
  
  // 「ひのえうま」のカードを探す（created_atが2026年1月1日 13:09:22のもの）
  // 13:09:22 JST = 04:09:22 UTC
  const targetTimestamp = Math.floor(new Date('2026-01-01T04:09:22Z').getTime() / 1000);
  console.log('探しているタイムスタンプ:', targetTimestamp);
  
  const targetCard = cards.find(c => Math.abs(c.created_at - targetTimestamp) < 60);
  
  if (!targetCard) {
    console.log('対象のカードが見つかりません。全カードの時刻:');
    cards.slice(0, 10).forEach(c => {
      console.log(`  ${c.id.slice(0, 16)}... : ${new Date(c.created_at * 1000).toISOString()}`);
    });
    pool.close(RELAYS);
    return;
  }
  
  console.log(`\n対象カードID: ${targetCard.id}`);
  console.log(`対象カード時刻: ${new Date(targetCard.created_at * 1000).toISOString()}`);
  
  // このカードへのリアクションを取得
  console.log('\n=== このカードへのリアクションを取得 ===');
  const reactions = await pool.querySync(RELAYS, {
    kinds: [7],
    '#e': [targetCard.id],
    limit: 100,
  });
  
  console.log(`取得したリアクション数: ${reactions.length}`);
  
  for (const reaction of reactions) {
    const eTags = reaction.tags.filter(t => t[0] === 'e');
    console.log('\n----------------------------------------');
    console.log('リアクションID:', reaction.id.slice(0, 16) + '...');
    console.log('content:', reaction.content);
    console.log('eタグ数:', eTags.length);
    console.log('eタグ:');
    for (const eTag of eTags) {
      const isTarget = eTag[1] === targetCard.id;
      console.log(`  ${eTag[1].slice(0, 16)}... => ${isTarget ? '✅ 対象カード' : '❌ 別のイベント'} ${eTag[2] || ''} ${eTag[3] || ''}`);
    }
    
    // 最後のeタグが対象カードかどうか
    const lastETag = eTags[eTags.length - 1];
    console.log(`最後のeタグは対象カード: ${lastETag && lastETag[1] === targetCard.id ? '✅' : '❌'}`);
  }

  pool.close(RELAYS);
}

main().catch(console.error);

