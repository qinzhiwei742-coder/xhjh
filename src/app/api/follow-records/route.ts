import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { S3Storage } from 'coze-coding-dev-sdk';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

// 初始化对象存储
const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: '',
  secretKey: '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: 'cn-beijing',
});

// 获取跟进记录列表
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('store_id');

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: '缺少门店ID' },
        { status: 400 }
      );
    }

    const { data, error } = await client
      .from('follow_records')
      .select('*, follow_images(*)')
      .eq('store_id', storeId)
      .order('follow_time', { ascending: false });

    if (error) {
      throw new Error(`获取跟进记录失败: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error('获取跟进记录失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取跟进记录失败' },
      { status: 500 }
    );
  }
}

// 创建跟进记录（含图片上传和AI分析）
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const formData = await request.formData();
    
    const storeId = formData.get('store_id') as string;
    const followTime = formData.get('follow_time') as string;
    const remark = formData.get('remark') as string;
    const nextFollowTime = formData.get('next_follow_time') as string | null;
    const files = formData.getAll('images') as File[];

    if (!storeId || !followTime) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 创建跟进记录
    const { data: record, error: recordError } = await client
      .from('follow_records')
      .insert({
        store_id: storeId,
        follow_time: followTime,
        remark: remark || '',
        next_follow_time: nextFollowTime || null,
      })
      .select()
      .single();

    if (recordError) {
      throw new Error(`创建跟进记录失败: ${recordError.message}`);
    }

    // 上传图片
    const uploadedImages: { key: string; url: string }[] = [];
    const imageUrls: string[] = [];

    for (const file of files) {
      if (file && file.size > 0) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const fileName = `follow-images/${record.id}/${Date.now()}_${file.name}`;
        
        const key = await storage.uploadFile({
          fileContent: buffer,
          fileName: fileName,
          contentType: file.type || 'image/png',
        });

        const url = await storage.generatePresignedUrl({
          key,
          expireTime: 86400 * 365, // 1年有效期
        });

        uploadedImages.push({ key, url });
        imageUrls.push(url);
      }
    }

    // 保存图片记录
    if (uploadedImages.length > 0) {
      const { error: imagesError } = await client
        .from('follow_images')
        .insert(
          uploadedImages.map(img => ({
            follow_record_id: record.id,
            image_key: img.key,
            image_url: img.url,
          }))
        );

      if (imagesError) {
        console.error('保存图片记录失败:', imagesError);
      }
    }

    // AI分析聊天截图
    let aiAnalysis = '';
    if (imageUrls.length > 0) {
      try {
        const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
        const config = new Config();
        const llmClient = new LLMClient(config, customHeaders);
        
        const contentParts: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> = [
          {
            type: 'text',
            text: '请分析以下微信聊天截图，总结沟通要点、客户需求、待跟进事项等关键信息。请用简洁的中文回答。',
          },
        ];
        
        imageUrls.forEach(url => {
          contentParts.push({
            type: 'image_url',
            image_url: { url },
          });
        });

        const messages = [
          {
            role: 'user' as const,
            content: contentParts,
          },
        ];

        const response = await llmClient.invoke(messages, {
          model: 'doubao-seed-1-6-vision-250815',
          temperature: 0.7,
        });

        aiAnalysis = response.content || '';

        // 更新跟进记录，添加AI分析
        const { error: updateError } = await client
          .from('follow_records')
          .update({ ai_analysis: aiAnalysis })
          .eq('id', record.id);

        if (updateError) {
          console.error('更新AI分析失败:', updateError);
        }
      } catch (aiError) {
        console.error('AI分析失败:', aiError);
        aiAnalysis = 'AI分析失败，请稍后重试';
      }
    }

    // 获取完整的跟进记录（含图片）
    const { data: fullRecord } = await client
      .from('follow_records')
      .select('*, follow_images(*)')
      .eq('id', record.id)
      .single();

    return NextResponse.json({
      success: true,
      data: {
        ...fullRecord,
        ai_analysis: aiAnalysis,
      },
    });
  } catch (error) {
    console.error('创建跟进记录失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '创建跟进记录失败' },
      { status: 500 }
    );
  }
}
