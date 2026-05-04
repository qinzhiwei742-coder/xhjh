import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'docs', 'REQUIREMENTS.md');
    const content = await readFile(filePath, 'utf-8');
    
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': 'attachment; filename="REQUIREMENTS.md"',
      },
    });
  } catch (error) {
    console.error('读取文件失败:', error);
    return NextResponse.json(
      { error: '文件不存在' },
      { status: 404 }
    );
  }
}
