/**
 * 对比Excel订单数据与数据库中的门店数据
 * 找出差异并生成报告
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
  console.log('=== 开始对比数据 ===\n');

  // 1. 读取订单Excel文件
  const orderExcelPath = path.join(__dirname, '../assets/订单-成交明细-下单时间-2025-04-01_2026-04-30.xlsx');
  const orderWorkbook = XLSX.readFile(orderExcelPath);
  const orderSheet = orderWorkbook.Sheets[orderWorkbook.SheetNames[0]];
  const orderData = XLSX.utils.sheet_to_json(orderSheet, { raw: false });
  
  // 获取唯一的门店（意向门店 + 意向门店ID）
  const excelStoreMap = new Map();
  orderData.forEach(row => {
    const name = row['意向门店'];
    const id = row['意向门店ID'];
    if (name && id && !excelStoreMap.has(name)) {
      excelStoreMap.set(name, id);
    }
  });

  console.log(`订单Excel中唯一门店: ${excelStoreMap.size} 个\n`);

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

  // 3. 查询数据库中所有门店
  const { data: dbStores, error } = await supabase
    .from('stores')
    .select('id, store_name, store_id, province, city, business_status')
    .eq('store_system', 'hecha');

  if (error) {
    console.error('查询失败:', error);
    process.exit(1);
  }

  console.log(`数据库中门店: ${dbStores.length} 个\n`);

  // 4. 分类分析
  const dbStoreMap = new Map();
  dbStores.forEach(store => {
    dbStoreMap.set(store.store_name, store);
  });

  // Excel中有但数据库中没有的门店（需要新增）
  const needToAdd = [];
  // Excel中和数据库都有的门店（需要更新ID和地区）
  const needToUpdate = [];
  // 数据库中有但Excel中没有的门店（设为取消合作）
  const needToCancel = [];

  excelStoreMap.forEach((storeId, storeName) => {
    const dbStore = dbStoreMap.get(storeName);
    const regionInfo = regionMap.get(storeName);
    
    if (dbStore) {
      // 数据库中存在，检查是否需要更新
      needToUpdate.push({
        dbId: dbStore.id,
        storeName,
        oldStoreId: dbStore.store_id,
        newStoreId: storeId,
        oldProvince: dbStore.province || '',
        oldCity: dbStore.city || '',
        newProvince: regionInfo?.province || '',
        newCity: regionInfo?.city || '',
        currentStatus: dbStore.business_status
      });
    } else {
      // 数据库中不存在，需要新增
      needToAdd.push({
        storeName,
        storeId,
        province: regionInfo?.province || '',
        city: regionInfo?.city || '',
        category: regionInfo?.category || '',
        address: regionInfo?.address || ''
      });
    }
  });

  // 检查数据库中有但Excel中没有的
  dbStores.forEach(store => {
    if (!excelStoreMap.has(store.store_name)) {
      needToCancel.push({
        dbId: store.id,
        storeName: store.store_name,
        storeId: store.store_id,
        currentStatus: store.business_status
      });
    }
  });

  // 5. 输出报告
  console.log('=== 分析报告 ===\n');
  
  console.log(`【需要新增的门店】共 ${needToAdd.length} 个`);
  needToAdd.slice(0, 10).forEach(s => {
    console.log(`  - ${s.storeName} (${s.storeId})`);
  });
  if (needToAdd.length > 10) {
    console.log(`  ... 还有 ${needToAdd.length - 10} 个`);
  }

  console.log(`\n【需要更新ID的门店】共 ${needToUpdate.length} 个`);
  const idChanged = needToUpdate.filter(s => s.oldStoreId !== s.newStoreId);
  console.log(`  其中ID不同的: ${idChanged.length} 个`);
  idChanged.slice(0, 5).forEach(s => {
    console.log(`  - ${s.storeName}: ${s.oldStoreId} → ${s.newStoreId}`);
  });

  console.log(`\n【需要更新地区的门店】共 ${needToUpdate.filter(s => s.newProvince || s.newCity).length} 个`);

  console.log(`\n【需要设为取消合作的门店】共 ${needToCancel.length} 个`);
  needToCancel.slice(0, 10).forEach(s => {
    console.log(`  - ${s.storeName} (${s.currentStatus})`);
  });
  if (needToCancel.length > 10) {
    console.log(`  ... 还有 ${needToCancel.length - 10} 个`);
  }

  // 6. 执行更新
  console.log('\n=== 开始执行更新 ===\n');

  // 更新现有门店的ID和地区
  let updatedCount = 0;
  for (const store of needToUpdate) {
    const updateData = {};
    
    // 更新门店ID
    if (store.oldStoreId !== store.newStoreId) {
      updateData.store_id = store.newStoreId;
    }
    
    // 更新地区
    if (store.newProvince || store.newCity) {
      if (store.newProvince !== store.oldProvince) {
        updateData.province = store.newProvince;
      }
      if (store.newCity !== store.oldCity) {
        updateData.city = store.newCity;
      }
    }
    
    if (Object.keys(updateData).length > 0) {
      const { error } = await supabase
        .from('stores')
        .update(updateData)
        .eq('id', store.dbId);
      
      if (!error) {
        updatedCount++;
        if (updateData.store_id) {
          console.log(`✓ 更新ID: ${store.storeName}`);
        }
      }
    }
  }
  console.log(`\n更新完成: ${updatedCount} 个门店\n`);

  // 设置取消合作
  if (needToCancel.length > 0) {
    console.log('正在设置取消合作状态...');
    let cancelCount = 0;
    for (const store of needToCancel) {
      const { error } = await supabase
        .from('stores')
        .update({ business_status: '取消合作' })
        .eq('id', store.dbId);
      if (!error) cancelCount++;
    }
    console.log(`取消合作设置完成: ${cancelCount} 个\n`);
  }

  // 输出需要新增的门店列表
  if (needToAdd.length > 0) {
    console.log('\n=== 需要新增的门店完整列表 ===');
    needToAdd.forEach((s, i) => {
      console.log(`${i + 1}. ${s.storeName} | ${s.storeId} | ${s.province} ${s.city}`);
    });
  }

  console.log('\n=== 处理完成 ===');
}

main().catch(console.error);
