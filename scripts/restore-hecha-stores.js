/**
 * 从订单文件中提取和茶时代门店数据
 * - 订单文件中的意向门店 = 所有门店（包括正在合作和已取消合作）
 * - 共管门店记录 = 正在合作的门店（用来标记状态）
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
  console.log('=== 从订单文件中提取和茶时代门店数据 ===\n');

  // 1. 读取订单文件中的所有意向门店
  console.log('1. 读取订单文件中的所有意向门店');
  const orderExcelPath = path.join(__dirname, '../assets/订单-成交明细-下单时间-2025-04-01_2026-04-30.xlsx');
  const orderWorkbook = XLSX.readFile(orderExcelPath);
  const orderData = XLSX.utils.sheet_to_json(orderWorkbook.Sheets[orderWorkbook.SheetNames[0]], { raw: false });

  const allStores = new Map(); // storeName -> { storeId }
  orderData.forEach(row => {
    const name = row['意向门店'];
    const id = row['意向门店ID'];
    // 排除美丽妈妈
    if (name && id && !name.startsWith('美丽妈妈')) {
      allStores.set(name, { storeId: id });
    }
  });

  console.log(`  找到意向门店: ${allStores.size} 家`);

  // 2. 读取共管门店记录（正在合作的门店）
  console.log('\n2. 读取共管门店记录（正在合作的门店）');
  const regionExcelPath = path.join(__dirname, '../assets/共管门店记录.xlsx');
  const regionWorkbook = XLSX.readFile(regionExcelPath);
  const regionData = XLSX.utils.sheet_to_json(regionWorkbook.Sheets[regionWorkbook.SheetNames[0]], { raw: false });

  const activeStores = new Set(); // storeName集合
  const activeStoreInfo = new Map(); // storeName -> 门店详细信息
  regionData.forEach(row => {
    const name = row['门店名称'];
    const id = row['门店ID'];
    if (name && id && !name.startsWith('美丽妈妈')) {
      activeStores.add(name);
      activeStoreInfo.set(name, {
        storeId: id,
        province: row['省份'] || '',
        city: row['城市'] || '',
        category: row['门店品类'] || '',
        address: row['详细地址'] || '',
        merchantName: row['所属商户名称'] || '',
        merchantId: row['所属商户id'] || '',
      });
    }
  });

  console.log(`  找到共管门店（正在合作）: ${activeStores.size} 家`);

  // 3. 统计状态
  const servingCount = Array.from(allStores.keys()).filter(name => activeStores.has(name)).length;
  const cancelledCount = allStores.size - servingCount;

  console.log('\n3. 门店状态统计');
  console.log(`  总门店数: ${allStores.size} 家`);
  console.log(`  - 正在合作: ${servingCount} 家`);
  console.log(`  - 已取消合作: ${cancelledCount} 家`);

  // 4. 清空develop数据库中的和茶时代门店
  console.log('\n4. 清空develop数据库中的和茶时代门店');
  const { error: deleteError } = await supabase
    .from('stores')
    .delete()
    .eq('store_system', 'hecha');

  if (deleteError) {
    console.error('清空失败:', deleteError);
    process.exit(1);
  }

  console.log('  ✓ 清空完成');

  // 5. 批量插入门店数据
  console.log('\n5. 批量插入门店数据');
  let successCount = 0;
  let failedCount = 0;

  for (const [storeName, info] of allStores) {
    try {
      const isActive = activeStores.has(storeName);
      const storeInfo = activeStoreInfo.get(storeName) || {};

      const { error } = await supabase.from('stores').insert({
        store_id: info.storeId,
        store_name: storeName,
        store_system: 'hecha',
        business_status: isActive ? '服务中' : '取消合作',
        attach_status: isActive ? '已入驻' : '已取消',
        category: storeInfo.category || '茶馆',
        province: storeInfo.province || '',
        city: storeInfo.city || '',
        address: storeInfo.address || '',
        merchant_name: storeInfo.merchantName || '',
        merchant_id: storeInfo.merchantId || '',
      });

      if (error) {
        failedCount++;
        console.error(`  ✗ 失败 [${storeName}]:`, error.message);
      } else {
        successCount++;
        console.log(`  ✓ 成功 [${storeName}] - ${isActive ? '服务中' : '取消合作'}`);
      }
    } catch (err) {
      failedCount++;
      console.error(`  ✗ 错误 [${storeName}]:`, err);
    }
  }

  console.log(`\n插入完成:`);
  console.log(`  成功: ${successCount} 家`);
  console.log(`  失败: ${failedCount} 家`);

  // 6. 验证最终数据
  console.log('\n6. 验证最终数据');
  const { data: finalStores, error: finalError } = await supabase
    .from('stores')
    .select('store_name, business_status')
    .eq('store_system', 'hecha')
    .order('business_status', { ascending: false }); // 服务中排前面

  if (finalError) {
    console.error('查询失败:', finalError);
    process.exit(1);
  }

  const finalServingCount = finalStores.filter(s => s.business_status === '服务中').length;
  const finalCancelledCount = finalStores.filter(s => s.business_status === '取消合作').length;

  console.log(`  develop数据库中和茶时代门店总数: ${finalStores.length} 家`);
  console.log(`  - 正在合作（服务中）: ${finalServingCount} 家`);
  console.log(`  - 已取消合作: ${finalCancelledCount} 家`);

  if (finalStores.length === 155) {
    console.log('\n✅ 数据恢复成功，与product数据库一致（155家）');
  } else {
    console.log(`\n⚠️  数据数量不一致：期望155家，实际${finalStores.length}家`);
  }

  console.log('\n=== 处理完成 ===');
}

main().catch(console.error);
