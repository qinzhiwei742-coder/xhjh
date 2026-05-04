import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

// 预置的文件URL
const ORDER_FILE_URL = 'https://code.coze.cn/api/sandbox/coze_coding/file/proxy?expire_time=-1&file_path=assets%2F%E8%AE%A2%E5%8D%95-%E6%88%90%E4%BA%A4%E6%98%8E%E7%BB%86-%E4%B8%8B%E5%8D%95%E6%97%B6%E9%97%B4-2026-01-01_2026-03-31.xlsx&nonce=81969a4f-bcca-4925-8635-272b176db27d&project_id=7623682599759675411&sign=814761c3a836b672e80f3e14c9006bf6678e90bced8959d0c3285730fe01442b';
const VERIFY_FILE_URL = 'https://code.coze.cn/api/sandbox/coze_coding/file/proxy?expire_time=-1&file_path=assets%2F%E6%A0%B8%E9%94%80%E6%98%8E%E7%BB%86-%E6%A0%B8%E9%94%80%E6%97%B6%E9%97%B4-2026-01-01_2026-03-31.xlsx&nonce=24802e38-fd35-4ea0-ba89-40c794b0755c&project_id=7623682599759675411&sign=41a7c29f02f21972339bca50de5f639db6fd48a5cc248c9d9f0f9143c13237af';

async function fetchExcelData(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet);
}

export async function GET() {
  try {
    const [orderData, verifyData] = await Promise.all([
      fetchExcelData(ORDER_FILE_URL),
      fetchExcelData(VERIFY_FILE_URL),
    ]);

    return NextResponse.json({
      orderData,
      verifyData,
      orderCount: orderData.length,
      verifyCount: verifyData.length,
    });
  } catch (error) {
    console.error('Failed to load analytics data:', error);
    return NextResponse.json(
      { error: 'Failed to load analytics data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
