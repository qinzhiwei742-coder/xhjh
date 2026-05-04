/**
 * 新增共管门店记录中有但Excel订单中没有的门店
 */

const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const path = require('path');

const supabaseUrl = process.env.COZE_SUPABASE_URL;
const supabaseKey = process.env.COZE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('=== 新增缺失的合作门店 ===\n');

  // 缺失的门店列表（在共管门店记录中但不在Excel订单中）
  const missingStores = [
    '牌友棋牌室', '和木元(红谷滩店)', '清壹舍茶坊', '几何茶室', 
    '雀友记', '世跃茶庄', '慧女堂服装', '茶源茶馆', 
    '大众棋牌', '翠雨轩茶空间', '茗月茶坊', '淼源阁茶室(融创文旅城兰亭居店)', 
    '麻上来棋牌室', '岩湶号(竹林镜店)', '茗悦茶馆', '朝暮茶叙'
  ];

  console.log(`需要新增的门店: ${missingStores.length} 个\n`);

  // 读取共管门店记录获取详细信息
  const regionExcelPath = path.join(__dirname, '../assets/共管门店记录.xlsx');
  const regionWorkbook = XLSX.readFile(regionExcelPath);
  const regionSheet = regionWorkbook.Sheets[regionWorkbook.SheetNames[0]];
  const regionData = XLSX.utils.sheet_to_json(regionSheet);
  
  const regionMap = new Map();
  regionData.forEach(row => {
    if (row['门店名称']) {
      regionMap.set(row['门店名称'], {
        storeId: row['门店ID'] || '',
        province: row['省份'] || '',
        city: row['城市'] || '',
        category: row['门店品类'] || '',
        address: row['详细地址'] || ''
      });
    }
  });

  // 新增门店
  let addedCount = 0;
  for (const storeName of missingStores) {
    const info = regionMap.get(storeName);
    if (info) {
      const { error } = await supabase
        .from('stores')
        .insert({
          store_name: storeName,
          store_id: info.storeId || `MANUAL_${Date.now()}`,
          province: info.province,
          city: info.city,
          category: info.category,
          address: info.address,
          store_system: 'hecha',
          business_status: '服务中'
        });
      
      if (error) {
        console.error(`新增失败 [${storeName}]:`, error.message);
      } else {
        addedCount++;
        console.log(`✓ 新增: ${storeName} | ${info.province} ${info.city}`);
      }
    } else {
      console.log(`⚠ 未找到信息: ${storeName}`);
    }
  }

  console.log(`\n新增完成: ${addedCount}/${missingStores.length} 个\n`);

  // 验证最终数据
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

  const serviceCount = statusCount['服务中'] || 0;
  console.log(`\n合作门店（服务中）: ${serviceCount} 个`);
  console.log(`预期合作门店: 149 个`);
  
  if (serviceCount === 149) {
    console.log('\n✅ 合作门店数量正确！');
  } else {
    console.log(`\n⚠️ 还差 ${149 - serviceCount} 个`);
  }
}

main().catch(console.error);
