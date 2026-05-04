import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET - 获取操作日志列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('page_size') || '50');
    const operationType = searchParams.get('operation_type');
    const resourceType = searchParams.get('resource_type');
    const storeSystem = searchParams.get('store_system');

    const supabase = getSupabaseClient();

    let query = supabase
      .from('operation_logs')
      .select('*', { count: 'exact' });

    // 筛选条件
    if (operationType) {
      query = query.eq('operation_type', operationType);
    }
    if (resourceType) {
      query = query.eq('resource_type', resourceType);
    }
    if (storeSystem) {
      query = query.eq('store_system', storeSystem);
    }

    // 分页和排序
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    
    query = query
      .order('created_at', { ascending: false })
      .range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('查询操作日志失败:', error);
      return NextResponse.json({ error: '查询失败' }, { status: 500 });
    }

    return NextResponse.json({
      data,
      pagination: {
        page,
        page_size: pageSize,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / pageSize),
      },
    });
  } catch (error) {
    console.error('获取操作日志失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// POST - 记录操作日志
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      operation_type,
      resource_type,
      resource_id,
      resource_name,
      operator_id,
      operator_name,
      details,
      store_system,
    } = body;

    if (!operation_type || !resource_type) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('operation_logs')
      .insert({
        operation_type,
        resource_type,
        resource_id,
        resource_name,
        user_id: operator_id || 'unknown',
        user_name: operator_name,
        detail: details,
        store_system,
      })
      .select()
      .single();

    if (error) {
      console.error('记录操作日志失败:', error);
      return NextResponse.json({ error: '记录失败' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('记录操作日志失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
