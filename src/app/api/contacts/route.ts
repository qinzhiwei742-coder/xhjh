import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取联系人列表
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('store_id');

    if (!storeId) {
      return NextResponse.json({ success: false, error: '缺少store_id参数' }, { status: 400 });
    }

    // 直接使用 SQL 查询
    const { data, error } = await client
      .from('contacts')
      .select('*')
      .eq('store_id', storeId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('获取联系人错误:', error);
      // 如果表不存在，返回空数组
      if (error.message.includes('Could not find the table')) {
        return NextResponse.json({
          success: true,
          data: [],
        });
      }
      throw new Error(`获取联系人失败: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error('获取联系人失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取联系人失败' },
      { status: 500 }
    );
  }
}

// 创建联系人
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();

    console.log('创建联系人请求:', body);

    // 如果设置为首选联系人，先取消该门店其他联系人的首选状态
    if (body.is_primary) {
      const { error: updateError } = await client
        .from('contacts')
        .update({ is_primary: false })
        .eq('store_id', body.store_id);
      
      if (updateError) {
        console.error('更新首选状态错误:', updateError);
      }
    }

    const { data, error } = await client
      .from('contacts')
      .insert({
        store_id: body.store_id,
        name: body.name,
        position: body.position,
        phone: body.phone,
        wechat: body.wechat,
        wecom_id: body.wecom_id,
        remark: body.remark,
        is_primary: body.is_primary ?? false,
      })
      .select()
      .single();

    if (error) {
      console.error('创建联系人错误:', error);
      // 如果是 schema cache 问题，尝试使用 RPC
      if (error.message.includes('Could not find the table')) {
        // 使用原始 SQL 插入
        const insertQuery = `
          INSERT INTO contacts (store_id, name, position, phone, wechat, remark, is_primary)
          VALUES ('${body.store_id}', '${body.name}', ${body.position ? `'${body.position}'` : 'NULL'}, 
                  ${body.phone ? `'${body.phone}'` : 'NULL'}, ${body.wechat ? `'${body.wechat}'` : 'NULL'}, 
                  ${body.remark ? `'${body.remark}'` : 'NULL'}, ${body.is_primary ?? false})
          RETURNING *
        `;
        const { data: rpcData, error: rpcError } = await client.rpc('exec_sql', { sql: insertQuery });
        
        if (rpcError) {
          throw new Error(`创建联系人失败(表缓存问题): ${error.message}。请稍后重试或联系管理员。`);
        }
        
        return NextResponse.json({
          success: true,
          data: rpcData,
        });
      }
      throw new Error(`创建联系人失败: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('创建联系人失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '创建联系人失败' },
      { status: 500 }
    );
  }
}
