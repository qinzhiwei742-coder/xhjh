import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { S3Storage } from 'coze-coding-dev-sdk';

// 初始化对象存储
const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: '',
  secretKey: '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: 'cn-beijing',
});

// 上传图片
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const storeId = formData.get('store_id') as string;

    if (!file || !storeId) {
      return NextResponse.json({ success: false, error: '缺少文件或门店ID' }, { status: 400 });
    }

    // 读取文件内容
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 生成唯一文件名
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `store-images/${storeId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    // 上传到对象存储
    const imageKey = await storage.uploadFile({
      fileContent: buffer,
      fileName: fileName,
      contentType: file.type || 'image/webp', // 支持 WebP 格式
    });

    // 生成访问URL（1年有效期）
    const imageUrl = await storage.generatePresignedUrl({
      key: imageKey,
      expireTime: 86400 * 365,
    });

    // 保存到数据库
    const client = getSupabaseClient();
    const { data: dbData, error: dbError } = await client
      .from('store_images')
      .insert({
        store_id: storeId,
        image_key: imageKey,
        image_url: imageUrl,
      })
      .select()
      .single();

    if (dbError) {
      console.error('保存到数据库失败:', dbError);
      return NextResponse.json({ success: false, error: '保存记录失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: dbData });
  } catch (error) {
    console.error('上传图片失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}
