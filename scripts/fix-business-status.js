/**
 * 修正门店营业状态
 * 逻辑：共管门店记录中的149个门店为合作门店（服务中），其他为取消合作
 */

const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const path = require('path');

const supabaseUrl = process.env.COZE_SUPABASE_URL;
const supabaseKey = process.env.COZE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('=== 修正门店营业状态 ===\n');

  // 1. 读取共管门店记录
  const regionExcelPath = path.join(__dirname, '../assets/共管门店记录.xlsx');
  const regionWorkbook = XLSX.readFile(regionExcelPath);
  const regionSheet = regionWorkbook.Sheets[regionWorkbook.SheetNames[0]];
  const regionData = XLSX.utils.sheet_to_json(regionSheet);
  
  const coopStoreNames = new Set();
  regionData.forEach(row => {
    if (row['门店名称']) {
      coopStoreNames.add(row['门店名称'].trim());
    }
  });

  console.log(`共管门店记录中的门店数: ${coopStoreNames.size} 个\n`);

  // 2. 查询数据库中所有门店
  const { data: dbStores, error } = await supabase
    .from('stores')
    .select('id, store_name, business_status')
    .eq('store_system', 'hecha');

  if (error) {
    console.error('查询失败:', error);
    process.exit(1);
  }

  console.log(`数据库中门店总数: ${dbStores.length} 个\n`);

  // 3. 分类处理
  const toSetService = [];  // 需要设为服务中的
  const toSetCancelled = []; // 需要设为取消合作的

  dbStores.forEach(store => {
    const isCoop = coopStoreNames.has(store.store_name);
    
    if (isCoop) {
      // 在共管门店记录中，应该设为服务中
      if (store.business_status !== '服务中') {
        toSetService.push(store);
      }
    } else {
      // 不在共管门店记录中，应该设为取消合作
      if (store.business_status !== '取消合作') {
        toSetCancelled.push(store);
      }
    }
  });

  console.log(`需要设为服务中的门店: ${toSetService.length} 个`);
  console.log(`需要设为取消合作的门店: ${toSetCancelled.length} 个\n`);

  // 4. 执行更新
  let serviceCount = 0;
  for (const store of toSetService) {
    const { error } = await supabase
      .from('stores')
      .update({ business_status: '服务中' })
      .eq('id', store.id);
    
    if (!error) {
      serviceCount++;
      console.log(`✓ 设为服务中: ${store.store_name}`);
    }
  }
  console.log(`\n服务中设置完成: ${serviceCount} 个\n`);

  let cancelCount = 0;
  for (const store of toSetCancelled) {
    const { error } = await supabase
      .from('stores')
      .update({ business_status: '取消合作' })
      .eq('id', store.id);
    
    if (!error) {
      cancelCount++;
    }
  }
  console.log(`取消合作设置完成: ${cancelCount} 个\n`);

  // 5. 验证最终数据
  const { data: finalStores } = await supabase
    .from('stores')
    .select('business_status')
    .eq('store_system', 'hecha');

  const statusCount = {};
  finalStores.forEach(s => {
    const status = s.business_status || '未设置';
    statusCount[status] = (statusCount[status] || 0) + 1;
  });

  console.log('=== 最终统计 ===');
  Object.entries(statusCount).forEach(([status, count]) => {
    console.log(`${status}: ${count} 个`);
  });

  // 验证合作门店数
  const serviceStores = finalStores.filter(s => s.business_status === '服务中');
  console.log(`\n合作门店（服务中）: ${serviceStores.length} 个`);
  console.log(`预期合作门店: ${coopStoreNames.size} 个`);
  
  if (serviceStores.length === coopStoreNames.size) {
    console.log('\n✅ 合作门店数量正确！');
  } else {
    console.log('\n⚠️ 合作门店数量不匹配，请检查！');
  }
}

main().catch(console.error);
