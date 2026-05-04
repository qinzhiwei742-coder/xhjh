import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 门店订单统计
interface StoreOrderStats {
  totalOrders: number;
  fakeOrders: number;
  validOrders: number;
  totalAmount: number;
  fakeAmount: number;
  validOrderAmount: number;
  refundCount: number;
  refundAmount: number;
  unverifiedCount: number;
  unverifiedAmount: number;
  verifyCount: number;
  verifyAmount: number;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const storeSystem = searchParams.get('storeSystem') || 'mama';

    const client = getSupabaseClient();

    // 从数据库查询订单数据并计算统计
    const { data: orders, error } = await client
      .from('order_records')
      .select('store_id, order_amount, order_status, created_at')
      .eq('store_system', storeSystem);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 统计数据
    const storeStats: Record<string, StoreOrderStats> = {};

    for (const order of orders || []) {
      const storeId = order.store_id || '';
      const orderAmount = Number(order.order_amount) || 0;
      const orderStatus = order.order_status || '';

      // 分类
      const isFake = orderAmount <= 10;  // 刷单：订单实收 ≤ 10元
      const isCompleted = orderStatus === '已完成';  // 已完成
      const isRefund = orderStatus === '未使用取消';  // 退款
      const isUnverified = orderStatus === '待使用';  // 未核销
      const isValid = !isFake && isCompleted;  // 有效订单：>10元 且 已完成

      if (!storeId) continue;

      if (!storeStats[storeId]) {
        storeStats[storeId] = {
          totalOrders: 0,
          fakeOrders: 0,
          validOrders: 0,
          totalAmount: 0,
          fakeAmount: 0,
          validOrderAmount: 0,
          refundCount: 0,
          refundAmount: 0,
          unverifiedCount: 0,
          unverifiedAmount: 0,
          verifyCount: 0,
          verifyAmount: 0,
        };
      }

      const stats = storeStats[storeId];

      // 总订单数和总金额
      stats.totalOrders += 1;
      stats.totalAmount += orderAmount;

      // 刷单
      if (isFake) {
        stats.fakeOrders += 1;
        stats.fakeAmount += orderAmount;
      }

      // 有效订单
      if (isValid) {
        stats.validOrders += 1;
        stats.validOrderAmount += orderAmount;
      }

      // 退款
      if (isRefund) {
        stats.refundCount += 1;
        stats.refundAmount += orderAmount;
      }

      // 未核销
      if (isUnverified) {
        stats.unverifiedCount += 1;
        stats.unverifiedAmount += orderAmount;
      }

      // 核销（已完成且非退款）
      if (isCompleted && !isRefund) {
        stats.verifyCount += 1;
        stats.verifyAmount += orderAmount;
      }
    }

    return NextResponse.json({
      success: true,
      storeStats,
    });
  } catch (error) {
    console.error('查询订单统计失败:', error);
    return NextResponse.json(
      { error: '查询订单统计失败' },
      { status: 500 }
    );
  }
}
