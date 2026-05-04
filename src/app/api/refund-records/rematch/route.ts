import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { store_system } = await request.json();

    if (!store_system) {
      return NextResponse.json({ success: false, error: '缺少store_system参数' }, { status: 400 });
    }

    console.log(`[退款重新匹配] 开始重新匹配退款数据，门店体系: ${store_system}`);

    // 1️⃣ 从订单构建映射（只查必要字段）
    const { data: orderData } = await client
      .from('order_records')
      .select('order_id, store_id')
      .eq('store_system', store_system);

    const orderMapping: Record<string, string> = {};
    orderData?.forEach((order: any) => {
      if (order.order_id && order.store_id) {
        orderMapping[order.order_id] = order.store_id;
      }
    });

    console.log(`[退款重新匹配] 订单映射构建完成，共 ${Object.keys(orderMapping).length} 个订单`);

    // 2️⃣ 查询未匹配的退款（限制1000条）
    const { data: unmatchedRefunds } = await client
      .from('refund_records')
      .select('id, order_id')
      .eq('store_system', store_system)
      .is('store_id', null)
      .limit(1000);

    if (!unmatchedRefunds || unmatchedRefunds.length === 0) {
      console.log('[退款重新匹配] 没有未匹配的退款记录');
      return NextResponse.json({ 
        success: true, 
        updatedCount: 0, 
        totalCount: 0,
        message: '没有需要匹配的退款记录' 
      });
    }

    console.log(`[退款重新匹配] 找到 ${unmatchedRefunds.length} 条未匹配退款记录`);

    // 3️⃣ 更新匹配到的记录
    let updatedCount = 0;
    for (const refund of unmatchedRefunds) {
      const newStoreId = orderMapping[refund.order_id];
      if (newStoreId) {
        const { error } = await client
          .from('refund_records')
          .update({ store_id: newStoreId })
          .eq('id', refund.id);
        
        if (!error) {
          updatedCount++;
        } else {
          console.error(`[退款重新匹配] 更新退款记录 ${refund.id} 失败:`, error);
        }
      }
    }

    console.log(`[退款重新匹配] 完成，成功匹配 ${updatedCount}/${unmatchedRefunds.length} 条记录`);

    return NextResponse.json({
      success: true,
      updatedCount,
      totalCount: unmatchedRefunds.length,
      message: `成功匹配 ${updatedCount}/${unmatchedRefunds.length} 条退款记录`
    });

  } catch (error) {
    console.error('重新匹配退款数据失败:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '重新匹配失败' 
      },
      { status: 500 }
    );
  }
}
