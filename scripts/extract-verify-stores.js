/**
 * 从核销明细文件中提取门店信息
 */

const XLSX = require('xlsx');
const path = require('path');

async function main() {
  const verifyFiles = [
    '核销明细-核销时间-2026-01-01_2026-03-31.xlsx',
    '核销明细-核销时间-2026-03-01_2026-03-31(1).xlsx',
  ];

  const allVerifyStores = new Set(); // 使用Set去重

  for (const excelFile of verifyFiles) {
    console.log(`\n处理文件: ${excelFile}`);
    const fullPath = path.join(__dirname, '../assets', excelFile);

    try {
      const workbook = XLSX.readFile(fullPath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { raw: false });

      console.log(`  总行数: ${data.length}`);

      // 查找门店相关列
      const firstRow = data[0];
      const storeColumns = Object.keys(firstRow).filter(k => k.includes('门店'));

      console.log(`  门店相关列: ${storeColumns.join(', ')}`);

      // 提取所有门店名称
      storeColumns.forEach(col => {
        data.forEach(row => {
          const storeName = row[col];
          if (storeName && storeName.trim() !== '' && !storeName.startsWith('美丽妈妈')) {
            allVerifyStores.add(storeName.trim());
          }
        });
      });

      console.log(`  找到门店: ${allVerifyStores.size} 个`);

      // 调试：显示前10个门店
      let debugCount = 0;
      allVerifyStores.forEach(storeName => {
        if (debugCount < 10) {
          console.log(`  示例: ${storeName}`);
          debugCount++;
        }
      });
    } catch (error) {
      console.error(`  错误: ${error.message}`);
    }
  }

  console.log(`\n=== 汇总结果 ===`);
  console.log(`从核销明细中找到的门店总数: ${allVerifyStores.size} 个`);

  // 输出所有门店
  console.log(`\n门店列表:`);
  let i = 1;
  allVerifyStores.forEach(storeName => {
    console.log(`${i}. ${storeName}`);
    i++;
  });
}

main().catch(console.error);
