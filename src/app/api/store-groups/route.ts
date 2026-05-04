import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取分组列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeSystem = searchParams.get('store_system') || 'mama';

    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('store_groups')
      .select('*')
      .eq('store_system', storeSystem)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('获取分组列表失败:', error);
      return NextResponse.json({ success: false, error: '获取分组列表失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('获取分组列表异常:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}

// 创建分组
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { group_name, remark, store_ids, store_system = 'mama' } = body;

    if (!group_name || !group_name.trim()) {
      return NextResponse.json({ success: false, error: '分组名称不能为空' }, { status: 400 });
    }

    // 校验门店ID数量上限
    const idList = (store_ids || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    if (idList.length > 20) {
      return NextResponse.json({ success: false, error: '单个分组最多包含20家门店' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 检查同名分组
    const { data: existing } = await supabase
      .from('store_groups')
      .select('id')
      .eq('group_name', group_name.trim())
      .eq('store_system', store_system)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: false, error: `分组"${group_name}"已存在` }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('store_groups')
      .insert({
        group_name: group_name.trim(),
        remark: remark?.trim() || null,
        store_ids: idList.join(','),
        store_system,
      })
      .select()
      .single();

    if (error) {
      console.error('创建分组失败:', error);
      return NextResponse.json({ success: false, error: '创建分组失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('创建分组异常:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}

// 更新分组
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, group_name, remark, store_ids } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少分组ID' }, { status: 400 });
    }

    if (!group_name || !group_name.trim()) {
      return NextResponse.json({ success: false, error: '分组名称不能为空' }, { status: 400 });
    }

    // 校验门店ID数量上限
    const idList = (store_ids || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    if (idList.length > 20) {
      return NextResponse.json({ success: false, error: '单个分组最多包含20家门店' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 检查同名分组（排除自身）
    const { data: existing } = await supabase
      .from('store_groups')
      .select('id')
      .eq('group_name', group_name.trim())
      .neq('id', id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: false, error: `分组"${group_name}"已存在` }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('store_groups')
      .update({
        group_name: group_name.trim(),
        remark: remark?.trim() || null,
        store_ids: idList.join(','),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('更新分组失败:', error);
      return NextResponse.json({ success: false, error: '更新分组失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('更新分组异常:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}

// 删除分组
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少分组ID' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('store_groups')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('删除分组失败:', error);
      return NextResponse.json({ success: false, error: '删除分组失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '分组删除成功' });
  } catch (error) {
    console.error('删除分组异常:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}
