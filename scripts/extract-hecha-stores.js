/**
 * 从所有订单文件中提取门店信息
 */

const XLSX = require('xlsx');
const path = require('path');

const excelFiles = [
  '订单-成交明细-下单时间-2025-04-01_2026-04-30.xlsx',
  '订单-成交明细-下单时间-2026-01-01_2026-03-31.xlsx',
  '订单-成交明细-下单时间-2026-03-01_2026-03-31 (1).xlsx',
];

async function main() {
  console.log('=== 从所有订单文件中提取门店信息 ===\n');

  const allStores = new Map(); // storeName -> { storeId, files: [] }

  for (const excelFile of excelFiles) {
    console.log(`\n处理文件: ${excelFile}`);
    const fullPath = path.join(__dirname, '../assets', excelFile);

    try {
      const workbook = XLSX.readFile(fullPath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // 读取所有行
      const data = XLSX.utils.sheet_to_json(sheet, { raw: false });

      console.log(`  总行数: ${data.length}`);

      // 查找门店相关的列
      const firstRow = data[0];
      console.log(`  列名: ${Object.keys(firstRow).join(', ')}`);

      // 查找意向门店和意向门店ID列（与add-missing-stores.js保持一致）
      const storeNameKey = Object.keys(firstRow).find(k => k === '意向门店');
      const storeIdKey = Object.keys(firstRow).find(k => k === '意向门店ID');

      console.log(`  门店名称列: ${storeNameKey}`);
      console.log(`  门店ID列: ${storeIdKey}`);

      if (storeNameKey && storeIdKey) {
        let count = 0;
        data.forEach(row => {
          const name = row[storeNameKey];
          const id = row[storeIdKey];
          if (name && id) {
            // 排除美丽妈妈门店和空门店
            if (!name.startsWith('美丽妈妈') && name.trim() !== '') {
              if (!allStores.has(name)) {
                allStores.set(name, { storeId: id, files: [] });
              }
              allStores.get(name).files.push(excelFile);
              count++;
            }
          }
        });
        console.log(`  找到和茶时代门店: ${count} 个`);

        // 调试：显示前5行门店数据
        let debugCount = 0;
        data.forEach(row => {
          const name = row[storeNameKey];
          const id = row[storeIdKey];
          if (name && id && debugCount < 5) {
            console.log(`  示例: ${name} (ID: ${id})`);
            debugCount++;
          }
        });
      }
    } catch (error) {
      console.error(`  错误: ${error.message}`);
    }
  }

  console.log(`\n=== 汇总结果 ===`);
  console.log(`找到的和茶时代门店总数: ${allStores.size} 个`);

  // 输出所有门店
  console.log(`\n门店列表:`);
  let i = 1;
  allStores.forEach((info, name) => {
    console.log(`${i}. ${name} (ID: ${info.storeId})`);
    i++;
  });

  // 保存到JSON文件
  const fs = require('fs');
  const output = [];
  allStores.forEach((info, name) => {
    output.push({
      store_name: name,
      store_id: info.storeId,
      store_system: 'hecha',
      business_status: '服务中',
      attach_status: '已入驻'
    });
  });

  fs.writeFileSync('hecha-stores.json', JSON.stringify(output, null, 2));
  console.log(`\n已保存到 hecha-stores.json`);
}

main().catch(console.error);
