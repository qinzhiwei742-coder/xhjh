/**
 * 合并意向门店和核销门店，达到435家
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
  console.log('=== 合并意向门店和核销门店 ===\n');

  // 1. 读取意向门店
  const orderExcelPath = path.join(__dirname, '../assets/订单-成交明细-下单时间-2025-04-01_2026-04-30.xlsx');
  const orderWorkbook = XLSX.readFile(orderExcelPath);
  const orderData = XLSX.utils.sheet_to_json(orderWorkbook.Sheets[orderWorkbook.SheetNames[0]], { raw: false });

  const orderStores = new Map(); // storeName -> { storeId }
  orderData.forEach(row => {
    const name = row['意向门店'];
    const id = row['意向门店ID'];
    if (name && id && !name.startsWith('美丽妈妈')) {
      orderStores.set(name, id);
    }
  });

  console.log(`意向门店: ${orderStores.size} 个`);

  // 2. 读取核销门店
  const verifyFiles = [
    '核销明细-核销时间-2026-01-01_2026-03-31.xlsx',
    '核销明细-核销时间-2026-03-01_2026-03-31(1).xlsx',
  ];

  const verifyStores = new Map(); // storeName -> { storeId }
  verifyFiles.forEach(excelFile => {
    const fullPath = path.join(__dirname, '../assets', excelFile);
    const workbook = XLSX.readFile(fullPath);
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { raw: false });

    data.forEach(row => {
      const name = row['核销门店'];
      const id = row['核销门店ID'];
      if (name && id && !name.startsWith('美丽妈妈')) {
        verifyStores.set(name, id);
      }
    });
  });

  console.log(`核销门店: ${verifyStores.size} 个`);

  // 3. 合并门店
  const allStores = new Map(); // storeName -> { storeId, sources: [] }

  // 添加意向门店
  orderStores.forEach((id, name) => {
    allStores.set(name, { storeId: id, sources: ['意向门店'] });
  });

  // 添加核销门店
  verifyStores.forEach((id, name) => {
    if (allStores.has(name)) {
      allStores.get(name).sources.push('核销门店');
    } else {
      allStores.set(name, { storeId: id, sources: ['核销门店'] });
    }
  });

  console.log(`\n合并后门店总数: ${allStores.size} 个`);

  // 4. 查询数据库中现有门店
  const { data: dbStores, error } = await supabase
    .from('stores')
    .select('id, store_name, store_id')
    .eq('store_system', 'hecha');

  if (error) {
    console.error('查询失败:', error);
    process.exit(1);
  }

  const dbStoreNames = new Set(dbStores.map(s => s.store_name));
  console.log(`数据库中现有门店: ${dbStoreNames.size} 个`);

  // 5. 找出需要新增的门店
  const needToAdd = [];
  allStores.forEach((info, storeName) => {
    if (!dbStoreNames.has(storeName)) {
      needToAdd.push({
        store_name: storeName,
        store_id: info.storeId,
        store_system: 'hecha',
        business_status: '服务中',
        attach_status: '已入驻'
      });
    }
  });

  console.log(`需要新增的门店: ${needToAdd.length} 个`);

  if (needToAdd.length > 0) {
    console.log('\n正在新增门店...');
    let addedCount = 0;

    for (const store of needToAdd) {
      const { error: insertError } = await supabase.from('stores').insert(store);

      if (insertError) {
        console.error(`新增失败 [${store.store_name}]:`, insertError.message);
      } else {
        addedCount++;
        console.log(`✓ 新增: ${store.store_name}`);
      }
    }

    console.log(`\n新增完成: ${addedCount}/${needToAdd.length} 个门店`);
  }

  // 6. 验证最终数据
  console.log('\n=== 验证最终数据 ===');

  const { data: finalStores, error: finalError } = await supabase
    .from('stores')
    .select('id, store_name, store_id')
    .eq('store_system', 'hecha');

  if (finalError) {
    console.error('查询失败:', finalError);
    process.exit(1);
  }

  console.log(`数据库中和茶时代门店总数: ${finalStores.length} 个`);

  if (finalStores.length >= 435) {
    console.log('\n✅ 成功达到435家门店！');
  } else {
    console.log(`\n❌ 还差 ${435 - finalStores.length} 家门店`);
  }
}

main().catch(console.error);
