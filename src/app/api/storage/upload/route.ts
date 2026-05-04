import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from "coze-coding-dev-sdk";

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  bucketName: process.env.COZE_BUCKET_NAME,
});

// 上传数据到对象存储
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { data, path } = body;

    if (!data || !path) {
      return NextResponse.json({ error: '缺少 data 或 path 参数' }, { status: 400 });
    }

    // 将数据转换为 JSON 字符串
    const content = JSON.stringify(data);
    const buffer = Buffer.from(content, 'utf-8');

    // 上传到对象存储
    const key = await storage.uploadFile({
      fileContent: buffer,
      fileName: path,
      contentType: 'application/json',
    });

    console.log(`[存储上传] 文件已上传，key: ${key}`);

    return NextResponse.json({ 
      success: true, 
      key: key 
    });
  } catch (error) {
    console.error('存储上传失败:', error);
    return NextResponse.json({ 
      error: '上传失败',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
