import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取数据上传历史
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const store_system = searchParams.get('store_system');
    const file_type = searchParams.get('file_type');

    let query = client
      .from('data_upload_history')
      .select('*')
      .order('created_at', { ascending: false });

    if (store_system) {
      query = query.eq('store_system', store_system);
    }

    if (file_type) {
      query = query.eq('file_type', file_type);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询失败: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('获取上传历史失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '查询失败' },
      { status: 500 }
    );
  }
}

// 清空数据上传历史
export async function DELETE(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const store_system = searchParams.get('store_system');
    const file_type = searchParams.get('file_type');

    let query = client
      .from('data_upload_history')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // 删除所有记录的条件

    if (store_system) {
      query = query.eq('store_system', store_system);
    }

    if (file_type) {
      query = query.eq('file_type', file_type);
    }

    const { error } = await query;

    if (error) {
      throw new Error(`删除失败: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      message: '历史记录已清空'
    });
  } catch (error) {
    console.error('清空历史记录失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '删除失败' },
      { status: 500 }
    );
  }
}
