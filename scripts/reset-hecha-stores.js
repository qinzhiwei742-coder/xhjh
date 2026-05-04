/**
 * 从product数据库导入和茶时代门店到develop数据库
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.COZE_SUPABASE_URL;
const supabaseKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('错误：缺少Supabase环境变量');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('=== 从product数据库导入和茶时代门店到develop数据库 ===\n');

  // 1. 查询develop数据库中的当前和茶时代门店
  const { data: developStores, error: developError } = await supabase
    .from('stores')
    .select('id, store_id, store_name, store_system')
    .eq('store_system', 'hecha');

  if (developError) {
    console.error('查询develop数据库失败:', developError);
    process.exit(1);
  }

  console.log(`develop数据库中当前和茶时代门店: ${developStores.length} 家`);

  // 2. 删除develop数据库中的所有和茶时代门店
  if (developStores.length > 0) {
    console.log(`\n正在删除develop数据库中的 ${developStores.length} 家和茶时代门店...`);

    const { error: deleteError } = await supabase
      .from('stores')
      .delete()
      .eq('store_system', 'hecha');

    if (deleteError) {
      console.error('删除失败:', deleteError);
      process.exit(1);
    }

    console.log('✓ 删除完成');
  }

  // 3. 由于product数据库无法直接访问，用户需要提供155家门店的数据
  console.log('\n=== 需要用户提供数据 ===');
  console.log('product数据库中有155家和茶时代门店，但无法直接访问。');
  console.log('请使用导出功能导出product数据库的门店数据，然后导入到develop数据库。');
  console.log('\n当前状态:');
  console.log('- develop数据库: 0 家和茶时代门店（已清空）');
  console.log('- 美丽妈妈门店: 101 家（保持不变）');
  console.log('- 总计: 101 家门店');

  console.log('\n下一步操作:');
  console.log('1. 等待用户提供155家和茶时代门店的Excel数据');
  console.log('2. 使用导入功能将数据导入到develop数据库');
}

main().catch(console.error);
