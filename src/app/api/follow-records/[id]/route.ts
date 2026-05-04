import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 更新跟进记录
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const client = getSupabaseClient();
    const { id } = await params;
    const body = await request.json();

    const { data, error } = await client
      .from('follow_records')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`更新跟进记录失败: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('更新跟进记录失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '更新跟进记录失败' },
      { status: 500 }
    );
  }
}

// 删除跟进记录
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const client = getSupabaseClient();
    const { id } = await params;

    const { error } = await client
      .from('follow_records')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`删除跟进记录失败: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      message: '跟进记录已删除',
    });
  } catch (error) {
    console.error('删除跟进记录失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '删除跟进记录失败' },
      { status: 500 }
    );
  }
}
