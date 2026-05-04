/**
 * 从共管门店记录中提取所有门店
 */

const XLSX = require('xlsx');
const path = require('path');

async function main() {
  const excelFile = path.join(__dirname, '../assets/共管门店记录.xlsx');
  const workbook = XLSX.readFile(excelFile);
  const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { raw: false });

  console.log(`总行数: ${data.length}`);
  console.log(`\n所有列名:\n${Object.keys(data[0]).join('\n')}`);

  // 查看所有数据
  console.log(`\n所有门店:`);
  data.forEach((row, i) => {
    console.log(`${i + 1}. ${row['门店名称']}`);
  });
}

main().catch(console.error);
