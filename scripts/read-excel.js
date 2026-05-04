import { FetchClient, Config } from 'coze-coding-dev-sdk';
import * as XLSX from 'xlsx';

const fileUrl = 'https://code.coze.cn/api/sandbox/coze_coding/file/proxy?expire_time=-1&file_path=assets%2F%E5%94%AE%E5%90%8E%E6%98%8E%E7%BB%86-%E7%94%B3%E8%AF%B7%E6%97%B6%E9%97%B4-2025-11-21_2026-04-21.xlsx&nonce=d8cd807c-64b1-4761-a9b4-3a59369529cb&project_id=7626664285938122787&sign=0bed4adbc52971dbe656d968005b1e6b534292e9b29dc8bc008483543e265316';

async function readExcel() {
  try {
    console.log('开始读取Excel文件...');

    // 直接使用fetch下载文件
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    console.log('\n=== Excel文件信息 ===');
    console.log('工作表名称:', workbook.SheetNames);

    // 读取第一个工作表
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // 获取前10行数据
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    console.log('\n=== 前10行数据 ===');
    jsonData.slice(0, 10).forEach((row, index) => {
      console.log(`\n第${index + 1}行:`);
      console.log(JSON.stringify(row, null, 2));
    });

    console.log('\n=== 所有列名（第1行）===');
    console.log(jsonData[0]);

    console.log('\n=== 第2行数据样本 ===');
    console.log(jsonData[1]);

    // 统计总行数
    console.log(`\n=== 总行数（包括表头）: ${jsonData.length} ===`);

    // 使用对象格式读取（以第一行为键）
    const dataAsObjects = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    console.log('\n=== 前5条完整记录 ===');
    dataAsObjects.slice(0, 5).forEach((record, index) => {
      console.log(`\n记录 ${index + 1}:`);
      console.log(JSON.stringify(record, null, 2));
    });

    // 查看售后状态的分布
    const statusCounts = {};
    dataAsObjects.forEach(row => {
      const status = row['售后状态'] || '未知';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    console.log('\n=== 售后状态分布 ===');
    console.log(JSON.stringify(statusCounts, null, 2));

  } catch (error) {
    console.error('读取Excel文件失败:', error);
  }
}

readExcel();
