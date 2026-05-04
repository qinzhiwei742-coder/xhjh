import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from "coze-coding-dev-sdk";

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  bucketName: process.env.COZE_BUCKET_NAME,
});

// 下载对象存储的数据
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json({ error: '缺少 key 参数' }, { status: 400 });
    }

    // 生成预签名 URL 用于下载
    const url = await storage.generatePresignedUrl({
      key: key,
      expireTime: 3600 // 1小时有效期
    });

    console.log(`[存储下载] 生成下载 URL，key: ${key}`);

    return NextResponse.json({ 
      success: true, 
      url: url,
      key: key
    });
  } catch (error) {
    console.error('存储下载失败:', error);
    return NextResponse.json({ 
      error: '下载失败',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
