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

// 删除图片
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const client = getSupabaseClient();

    // 先查询图片信息
    const { data: image, error: fetchError } = await client
      .from('store_images')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !image) {
      return NextResponse.json({ success: false, error: '图片不存在' }, { status: 404 });
    }

    // 从存储中删除文件
    if (image.image_key) {
      try {
        await storage.deleteFile({ fileKey: image.image_key });
      } catch (err) {
        console.error('从存储删除失败:', err);
        // 继续删除数据库记录
      }
    }

    // 从数据库删除记录
    const { error: deleteError } = await client
      .from('store_images')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('从数据库删除失败:', deleteError);
      return NextResponse.json({ success: false, error: '删除失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除图片失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}
