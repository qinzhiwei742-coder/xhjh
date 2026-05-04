import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 更新联系人
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const client = getSupabaseClient();
    const { id } = await params;
    const body = await request.json();

    // 如果设置为首选联系人，先取消该门店其他联系人的首选状态
    if (body.is_primary) {
      // 先获取该联系人所属的store_id
      const { data: contact } = await client
        .from('contacts')
        .select('store_id')
        .eq('id', id)
        .single();
      
      if (contact) {
        await client
          .from('contacts')
          .update({ is_primary: false })
          .eq('store_id', contact.store_id);
      }
    }

    const { data, error } = await client
      .from('contacts')
      .update({
        name: body.name,
        position: body.position,
        phone: body.phone,
        wechat: body.wechat,
        wecom_id: body.wecom_id,
        remark: body.remark,
        is_primary: body.is_primary,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`更新联系人失败: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('更新联系人失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '更新联系人失败' },
      { status: 500 }
    );
  }
}

// 删除联系人
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const client = getSupabaseClient();
    const { id } = await params;

    const { error } = await client
      .from('contacts')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`删除联系人失败: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('删除联系人失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '删除联系人失败' },
      { status: 500 }
    );
  }
}
