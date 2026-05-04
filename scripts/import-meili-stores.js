/**
 * 导入美丽妈妈门店到数据库
 */

const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const path = require('path');

const supabaseUrl = process.env.COZE_SUPABASE_URL;
const supabaseKey = process.env.COZE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('错误：缺少Supabase环境变量');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('=== 开始导入美丽妈妈门店 ===\n');

  // 1. 读取订单Excel文件获取门店信息
  const orderExcelPath = path.join(__dirname, '../assets/订单-成交明细-下单时间-2026-03-01_2026-03-31 (1).xlsx');
  const orderWorkbook = XLSX.readFile(orderExcelPath);
  const orderSheet = orderWorkbook.Sheets[orderWorkbook.SheetNames[0]];
  const orderData = XLSX.utils.sheet_to_json(orderSheet, { raw: false });

  // 获取唯一的美丽妈妈门店（意向门店 + 意向门店ID）
  const excelStoreMap = new Map();
  orderData.forEach(row => {
    const name = row['意向门店'];
    const id = row['意向门店ID'];
    // 只导入以"美丽妈妈"开头的门店
    if (name && id && name.startsWith('美丽妈妈') && !excelStoreMap.has(name)) {
      excelStoreMap.set(name, id);
    }
  });

  console.log(`订单Excel中美腻妈妈门店: ${excelStoreMap.size} 个\n`);

  // 2. 读取共管门店记录（地区信息）
  const regionExcelPath = path.join(__dirname, '../assets/共管门店记录.xlsx');
  const regionWorkbook = XLSX.readFile(regionExcelPath);
  const regionSheet = regionWorkbook.Sheets[regionWorkbook.SheetNames[0]];
  const regionData = XLSX.utils.sheet_to_json(regionSheet);

  const regionMap = new Map();
  regionData.forEach(row => {
    if (row['门店名称']) {
      regionMap.set(row['门店名称'], {
        province: row['省份'] || '',
        city: row['城市'] || '',
        category: row['门店品类'] || '',
        address: row['详细地址'] || ''
      });
    }
  });

  console.log(`共管门店记录: ${regionMap.size} 个\n`);

  // 3. 查询数据库中现有美丽妈妈门店
  const { data: dbStores, error } = await supabase
    .from('stores')
    .select('id, store_name, store_id, business_status')
    .eq('store_system', 'meili');

  if (error) {
    console.error('查询失败:', error);
    process.exit(1);
  }

  const dbStoreNames = new Set(dbStores.map(s => s.store_name));
  console.log(`数据库中现有美丽妈妈门店: ${dbStoreNames.size} 个\n`);

  // 4. 找出需要新增的门店
  const needToAdd = [];
  excelStoreMap.forEach((storeId, storeName) => {
    if (!dbStoreNames.has(storeName)) {
      const regionInfo = regionMap.get(storeName);
      needToAdd.push({
        store_name: storeName,
        store_id: storeId,
        province: regionInfo?.province || '',
        city: regionInfo?.city || '',
        category: regionInfo?.category || '',
        address: regionInfo?.address || '',
        store_system: 'meili',
        business_status: '服务中'
      });
    }
  });

  console.log(`需要新增的门店: ${needToAdd.length} 个\n`);

  // 5. 批量新增门店
  if (needToAdd.length > 0) {
    console.log('正在新增门店...');
    let addedCount = 0;

    for (const store of needToAdd) {
      const { error: insertError } = await supabase
        .from('stores')
        .insert(store);

      if (insertError) {
        console.error(`新增失败 [${store.store_name}]:`, insertError.message);
      } else {
        addedCount++;
        console.log(`✓ 新增: ${store.store_name}`);
      }
    }

    console.log(`\n新增完成: ${addedCount}/${needToAdd.length} 个门店\n`);
  } else {
    console.log('没有需要新增的门店\n');
  }

  // 6. 验证最终数据
  console.log('=== 验证最终数据 ===\n');

  const { data: finalStores, error: finalError } = await supabase
    .from('stores')
    .select('id, store_name, store_id, business_status, province, city')
    .eq('store_system', 'meili');

  if (finalError) {
    console.error('查询失败:', finalError);
    process.exit(1);
  }

  console.log(`数据库中美丽妈妈门店总数: ${finalStores.length} 个`);

  // 统计营业状态
  const statusCount = {};
  finalStores.forEach(s => {
    const status = s.business_status || '未设置';
    statusCount[status] = (statusCount[status] || 0) + 1;
  });

  console.log('\n营业状态统计:');
  Object.entries(statusCount).forEach(([status, count]) => {
    console.log(`  ${status}: ${count} 个`);
  });

  // 检查是否所有Excel门店都在数据库中
  let missingCount = 0;
  const dbNames = new Set(finalStores.map(s => s.store_name));
  excelStoreMap.forEach((_, name) => {
    if (!dbNames.has(name)) {
      missingCount++;
      console.log(`  缺失: ${name}`);
    }
  });

  if (missingCount === 0) {
    console.log('\n✅ 所有Excel门店都已存在于数据库中');
  } else {
    console.log(`\n❌ 还有 ${missingCount} 个门店缺失`);
  }

  // 统计有地区信息的门店
  const withRegion = finalStores.filter(s => s.province || s.city);
  console.log(`\n有地区信息的门店: ${withRegion.length} 个`);

  // 显示部分门店示例
  if (finalStores.length > 0) {
    console.log('\n门店示例（前5个）:');
    finalStores.slice(0, 5).forEach(s => {
      console.log(`  - ${s.store_name} (${s.city || '未知城市'})`);
    });
  }

  console.log('\n=== 处理完成 ===');
}

main().catch(console.error);
