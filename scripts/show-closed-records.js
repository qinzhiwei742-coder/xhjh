import * as XLSX from 'xlsx';

const fileUrl = 'https://code.coze.cn/api/sandbox/coze_coding/file/proxy?expire_time=-1&file_path=assets%2F%E5%94%AE%E5%90%8E%E6%98%8E%E7%BB%86-%E7%94%B3%E8%AF%B7%E6%97%B6%E9%97%B4-2025-11-21_2026-04-21.xlsx&nonce=d8cd807c-64b1-4761-a9b4-3a59369529cb&project_id=7626664285938122787&sign=0bed4adbc52971dbe656d968005b1e6b534292e9b29dc8bc008483543e265316';

async function showClosedRecords() {
  try {
    console.log('=== 4月1-20日非"已退款"状态的记录 ===\n');

    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    data.forEach(row => {
      const refundTime = row['退款审核完成时间'] || row['售后完成时间'] || '';
      const status = row['售后状态'] || '';
      const refundDate = refundTime ? refundTime.split(' ')[0] : '';

      if (refundDate >= '2026-04-01' && refundDate <= '2026-04-20' && status !== '已退款') {
        console.log('退款时间:', refundTime);
        console.log('售后状态:', status);
        console.log('售后类型:', row['售后类型']);
        console.log('售后原因:', row['售后原因']);
        console.log('退款金额:', row['退款金额']);
        console.log('订单ID:', row['订单 ID']);
        console.log('售后编号:', row['售后编号']);
        console.log('---');
      }
    });

  } catch (error) {
    console.error('查询失败:', error);
  }
}

showClosedRecords();
