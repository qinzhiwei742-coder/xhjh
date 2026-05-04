/**
 * 分析Excel文件中的所有列和数据
 */

const XLSX = require('xlsx');
const path = require('path');

async function main() {
  const excelFile = path.join(__dirname, '../assets/订单-成交明细-下单时间-2025-04-01_2026-04-30.xlsx');
  const workbook = XLSX.readFile(excelFile);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { raw: false });

  console.log(`总行数: ${data.length}`);
  console.log(`\n所有列名:\n${Object.keys(data[0]).join('\n')}`);

  // 查找所有包含"门店"的列
  const storeColumns = Object.keys(data[0]).filter(k => k.includes('门店'));
  console.log(`\n包含"门店"的列: ${storeColumns.join(', ')}`);

  // 统计每列的唯一值数量
  console.log(`\n各列唯一值数量:`);
  Object.keys(data[0]).forEach(key => {
    const uniqueValues = new Set(data.map(row => row[key]).filter(v => v));
    if (uniqueValues.size <= 500) {
      console.log(`  ${key}: ${uniqueValues.size} 个唯一值`);
    }
  });

  // 查看前几行数据
  console.log(`\n前3行数据（只显示门店相关列）:`);
  data.slice(0, 3).forEach((row, i) => {
    console.log(`\nRow ${i + 1}:`);
    storeColumns.forEach(col => {
      console.log(`  ${col}: ${row[col]}`);
    });
  });
}

main().catch(console.error);
