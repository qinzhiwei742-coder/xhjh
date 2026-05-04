import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取机器人配置列表
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('store_id');

    let query = client
      .from('robot_configs')
      .select('*')
      .order('created_at', { ascending: false });

    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`获取机器人配置失败: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error('获取机器人配置失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取机器人配置失败' },
      { status: 500 }
    );
  }
}

// 创建机器人配置
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();

    const { data, error } = await client
      .from('robot_configs')
      .insert({
        store_id: body.store_id,
        webhook_url: body.webhook_url,
        robot_name: body.robot_name,
        description: body.description,
        is_active: body.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`创建机器人配置失败: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('创建机器人配置失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '创建机器人配置失败' },
      { status: 500 }
    );
  }
}
