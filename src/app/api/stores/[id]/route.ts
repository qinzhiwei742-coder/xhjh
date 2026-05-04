import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取单个门店详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const client = getSupabaseClient();
    const { id } = await params;

    // 获取门店信息
    const { data: store, error: storeError } = await client
      .from('stores')
      .select('*')
      .eq('id', id)
      .single();

    if (storeError) {
      throw new Error(`获取门店失败: ${storeError.message}`);
    }

    if (!store) {
      return NextResponse.json(
        { success: false, error: '门店不存在' },
        { status: 404 }
      );
    }

    // 获取机器人配置
    const { data: robotConfigs } = await client
      .from('robot_configs')
      .select('*')
      .eq('store_id', id)
      .order('created_at', { ascending: false });

    // 获取跟进记录
    const { data: followRecords } = await client
      .from('follow_records')
      .select('*')
      .eq('store_id', id)
      .order('follow_time', { ascending: false });

    // 获取跟进记录的图片
    let followRecordsWithImages = [];
    if (followRecords && followRecords.length > 0) {
      const recordIds = followRecords.map(r => r.id);
      const { data: images } = await client
        .from('follow_images')
        .select('*')
        .in('follow_record_id', recordIds);

      followRecordsWithImages = followRecords.map(record => ({
        ...record,
        images: images?.filter(img => img.follow_record_id === record.id) || [],
      }));
    }

    return NextResponse.json({
      success: true,
      data: {
        ...store,
        robot_configs: robotConfigs || [],
        follow_records: followRecordsWithImages,
      },
    });
  } catch (error) {
    console.error('获取门店详情失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取门店详情失败' },
      { status: 500 }
    );
  }
}

// 更新门店
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const client = getSupabaseClient();
    const { id } = await params;
    const body = await request.json();

    // 检查门店名称是否与其他门店重复
    if (body.store_name) {
      const { data: existingName } = await client
        .from('stores')
        .select('id, store_name')
        .eq('store_name', body.store_name)
        .neq('id', id) // 排除自身
        .maybeSingle();
      
      if (existingName) {
        return NextResponse.json(
          { success: false, error: `门店名称"${body.store_name}"已存在，不能重复` },
          { status: 400 }
        );
      }
    }

    // 检查门店ID是否与其他门店重复
    if (body.store_id) {
      const { data: existingId } = await client
        .from('stores')
        .select('id, store_id, store_name')
        .eq('store_id', body.store_id)
        .neq('id', id) // 排除自身
        .maybeSingle();
      
      if (existingId) {
        return NextResponse.json(
          { success: false, error: `门店ID"${body.store_id}"已被门店"${existingId.store_name}"使用，不能重复` },
          { status: 400 }
        );
      }
    }

    const { data, error } = await client
      .from('stores')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`更新门店失败: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('更新门店失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '更新门店失败' },
      { status: 500 }
    );
  }
}

// 删除门店
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const client = getSupabaseClient();
    const { id } = await params;

    const { error } = await client
      .from('stores')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`删除门店失败: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      message: '门店已删除',
    });
  } catch (error) {
    console.error('删除门店失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '删除门店失败' },
      { status: 500 }
    );
  }
}
