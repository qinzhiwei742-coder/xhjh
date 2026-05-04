/**
 * 更新门店地区信息和营业状态脚本
 * 通过门店名称匹配Excel数据
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
  console.log('开始处理门店数据...\n');

  // 1. 读取Excel文件
  const excelPath = path.join(__dirname, '../assets/共管门店记录.xlsx');
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const excelData = XLSX.utils.sheet_to_json(sheet);

  console.log(`Excel中共有 ${excelData.length} 条门店记录`);

  // 创建门店名称到Excel数据的映射
  const excelStoreMap = new Map();
  excelData.forEach(row => {
    if (row['门店名称']) {
      excelStoreMap.set(row['门店名称'].trim(), {
        province: row['省份'] || '',
        city: row['城市'] || ''
      });
    }
  });

  console.log(`Excel中有效门店名称: ${excelStoreMap.size} 个\n`);

  // 2. 查询数据库中所有门店
  const { data: dbStores, error } = await supabase
    .from('stores')
    .select('id, store_name, province, city, business_status')
    .eq('store_system', 'hecha');

  if (error) {
    console.error('查询失败:', error);
    process.exit(1);
  }

  console.log(`数据库中共有 ${dbStores.length} 条门店记录\n`);

  // 3. 分类处理
  const toUpdateLocation = [];
  const toSetCancelled = [];

  dbStores.forEach(store => {
    const name = store.store_name?.trim();
    const excelInfo = excelStoreMap.get(name);

    if (excelInfo) {
      // 匹配成功，更新地区
      if (excelInfo.province || excelInfo.city) {
        toUpdateLocation.push({
          id: store.id,
          store_name: store.store_name,
          old_province: store.province || '',
          old_city: store.city || '',
          new_province: excelInfo.province,
          new_city: excelInfo.city
        });
      }
    } else {
      // 不在Excel中，设置取消合作
      toSetCancelled.push({
        id: store.id,
        store_name: store.store_name,
        current_status: store.business_status
      });
    }
  });

  console.log(`匹配到的门店: ${dbStores.length - toSetCancelled.length} 个`);
  console.log(`需要更新地区: ${toUpdateLocation.length} 个`);
  console.log(`需要设为取消合作: ${toSetCancelled.length} 个\n`);

  // 4. 更新地区信息
  let updatedCount = 0;
  for (const store of toUpdateLocation) {
    const { error } = await supabase
      .from('stores')
      .update({ province: store.new_province, city: store.new_city })
      .eq('id', store.id);

    if (!error) {
      updatedCount++;
      console.log(`✓ ${store.store_name}: (${store.old_province || '-'} ${store.old_city || '-'}) → (${store.new_province} ${store.new_city})`);
    }
  }
  console.log(`\n地区更新完成: ${updatedCount} 个\n`);

  // 5. 设置取消合作
  if (toSetCancelled.length > 0) {
    console.log('正在设置取消合作状态...');
    let cancelledCount = 0;
    for (const store of toSetCancelled) {
      const { error } = await supabase
        .from('stores')
        .update({ business_status: '取消合作' })
        .eq('id', store.id);
      if (!error) cancelledCount++;
    }
    console.log(`取消合作设置完成: ${cancelledCount} 个\n`);
  }

  console.log('=== 处理完成 ===');
}

main().catch(console.error);
