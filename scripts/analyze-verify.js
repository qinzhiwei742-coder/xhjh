/**
 * 分析核销明细文件的结构
 */

const XLSX = require('xlsx');
const path = require('path');

async function main() {
  const excelFile = path.join(__dirname, '../assets/核销明细-核销时间-2026-01-01_2026-03-31.xlsx');
  const workbook = XLSX.readFile(excelFile);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { raw: false });

  console.log(`总行数: ${data.length}`);
  console.log(`\n所有列名:\n${Object.keys(data[0]).join('\n')}`);

  // 查找所有包含"门店"的列
  const storeColumns = Object.keys(data[0]).filter(k => k.includes('门店'));
  console.log(`\n包含"门店"的列: ${storeColumns.join(', ')}`);

  // 查看前5行数据
  console.log(`\n前5行数据:`);
  data.slice(0, 5).forEach((row, i) => {
    console.log(`\nRow ${i + 1}:`);
    storeColumns.forEach(col => {
      console.log(`  ${col}: ${row[col]}`);
    });
  });
}

main().catch(console.error);
