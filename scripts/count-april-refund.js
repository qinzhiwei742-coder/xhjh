import * as XLSX from 'xlsx';

const fileUrl = 'https://code.coze.cn/api/sandbox/coze_coding/file/proxy?expire_time=-1&file_path=assets%2F%E5%94%AE%E5%90%8E%E6%98%8E%E7%BB%86-%E7%94%B3%E8%AF%B7%E6%97%B6%E9%97%B4-2025-11-21_2026-04-21.xlsx&nonce=d8cd807c-64b1-4761-a9b4-3a59369529cb&project_id=7626664285938122787&sign=0bed4adbc52971dbe656d968005b1e6b534292e9b29dc8bc008483543e265316';

async function countRefund() {
  try {
    console.log('开始统计退款数据...\n');

    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    console.log(`总记录数: ${data.length}\n`);

    // 统计4月1-20日的退款数据
    let april1To20Refunded = 0;
    let april1To20Total = 0;
    let notRefunded = 0;

    data.forEach(row => {
      const refundTime = row['退款审核完成时间'] || row['售后完成时间'] || '';
      const status = row['售后状态'] || '';

      // 提取退款审核完成时间的日期部分
      const refundDate = refundTime ? refundTime.split(' ')[0] : '';

      if (refundDate >= '2026-04-01' && refundDate <= '2026-04-20') {
        april1To20Total++;
        if (status === '已退款') {
          april1To20Refunded++;
        } else {
          notRefunded++;
        }
      }
    });

    console.log('=== 4月1-20日退款统计 ===');
    console.log(`总记录数: ${april1To20Total}`);
    console.log(`已退款: ${april1To20Refunded}`);
    console.log(`其他状态（未计入）: ${notRefunded}`);

    // 按日期统计
    console.log('\n=== 按日期统计4月1-20日已退款数量 ===');
    const dateStats = {};
    data.forEach(row => {
      const refundTime = row['退款审核完成时间'] || row['售后完成时间'] || '';
      const status = row['售后状态'] || '';
      const refundDate = refundTime ? refundTime.split(' ')[0] : '';

      if (refundDate >= '2026-04-01' && refundDate <= '2026-04-20' && status === '已退款') {
        dateStats[refundDate] = (dateStats[refundDate] || 0) + 1;
      }
    });

    Object.keys(dateStats).sort().forEach(date => {
      console.log(`${date}: ${dateStats[date]}条`);
    });

    console.log(`\n4月1-20日已退款总计: ${Object.values(dateStats).reduce((a, b) => a + b, 0)}条`);

  } catch (error) {
    console.error('统计失败:', error);
  }
}

countRefund();
