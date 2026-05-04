import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // 下载文件
    const response = await fetch(url);
    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
    }

    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    
    const result: {
      sheetName: string;
      headers: string[];
      rowCount: number;
      sampleData: Record<string, unknown>[];
    }[] = [];

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];
      
      // 获取表头
      const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
      
      result.push({
        sheetName,
        headers,
        rowCount: jsonData.length,
        sampleData: jsonData.slice(0, 3) // 前3行样本数据
      });
    }

    return NextResponse.json({ sheets: result });
  } catch (error) {
    console.error('Parse Excel error:', error);
    return NextResponse.json({ 
      error: 'Failed to parse Excel file',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
