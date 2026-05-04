/**
 * 检查数据库中的门店数据
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.COZE_SUPABASE_URL;
const supabaseKey = process.env.COZE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('=== 检查数据库中的门店数据 ===\n');

  // 查询所有门店
  const { data: allStores, error } = await supabase
    .from('stores')
    .select('store_name, store_id, store_system, business_status');

  if (error) {
    console.error('查询失败:', error);
    process.exit(1);
  }

  console.log(`数据库中总门店数: ${allStores.length} 个\n`);

  // 按体系分组
  const storesBySystem = {
    hecha: [],
    meili: [],
    mama: []
  };

  allStores.forEach(store => {
    const system = store.store_system || 'unknown';
    if (storesBySystem[system]) {
      storesBySystem[system].push(store);
    }
  });

  console.log('按体系统计:');
  console.log(`  和茶时代: ${storesBySystem.hecha.length} 个`);
  console.log(`  美丽妈妈: ${storesBySystem.meili.length} 个`);
  console.log(`  妈妈盒子: ${storesBySystem.mama.length} 个\n`);

  // 显示美丽妈妈门店示例
  if (storesBySystem.meili.length > 0) {
    console.log('美丽妈妈门店示例（前10个）:');
    storesBySystem.meili.slice(0, 10).forEach(s => {
      console.log(`  - ${s.store_name} (ID: ${s.store_id})`);
    });
  } else {
    console.log('❌ 数据库中没有美丽妈妈门店');
  }
}

main().catch(console.error);
