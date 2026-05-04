import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取按门店聚合的统计数据
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const store_system = searchParams.get('store_system');
    const time_start = searchParams.get('time_start');
    const time_end = searchParams.get('time_end');

    if (!store_system) {
      return NextResponse.json(
        { success: false, error: '缺少store_system参数' },
        { status: 400 }
      );
    }

    // 获取订单数据
    let orderQuery = client
      .from('order_records')
      .select('store_id, store_name, actual_amount, order_time, channel, product_name')
      .eq('store_system', store_system);

    if (time_start) {
      orderQuery = orderQuery.gte('order_time', time_start);
    }
    if (time_end) {
      orderQuery = orderQuery.lte('order_time', time_end);
    }

    const { data: orderData, error: orderError } = await orderQuery;
    if (orderError) throw new Error(`查询订单失败: ${orderError.message}`);

    // 获取核销数据（只统计已核销的记录）
    let verifyQuery = client
      .from('verify_records')
      .select('store_id, store_name, order_actual_amount, verify_time, channel, product_name, status, order_id')
      .eq('store_system', store_system)
      .eq('status', '已核销'); // 只统计已核销的记录

    if (time_start) {
      verifyQuery = verifyQuery.gte('verify_time', time_start);
    }
    if (time_end) {
      verifyQuery = verifyQuery.lte('verify_time', time_end);
    }

    const { data: verifyData, error: verifyError } = await verifyQuery;
    if (verifyError) throw new Error(`查询核销失败: ${verifyError.message}`);

    // 自动判断 order_actual_amount 的单位
    // 策略：检查前 5 条记录，如果大部分 > 1000，说明存储的是"分"
    let needDivideBy100 = false;
    if (verifyData && verifyData.length > 0) {
      const sampleSize = Math.min(5, verifyData.length);
      let largeValueCount = 0;
      let totalAmount = 0;

      for (let i = 0; i < sampleSize; i++) {
        const amount = parseFloat(String(verifyData[i].order_actual_amount || 0)) || 0;
        totalAmount += amount;
        if (amount > 1000) {
          largeValueCount++;
        }
      }

      const avgAmount = totalAmount / sampleSize;
      const largeValueRatio = largeValueCount / sampleSize;

      // 判断逻辑：
      // 1. 如果大部分记录（>=60%）的值 > 1000，说明是"分"
      // 2. 或者平均金额 > 100，说明是"分"
      needDivideBy100 = largeValueRatio >= 0.6 || avgAmount > 100;

      if (needDivideBy100) {
        console.warn(`⚠️ 自动判断：数据库中的核销金额单位是"分"，已自动除以 100`);
        console.warn(`   建议：删除旧数据后重新上传核销文件，确保数据正确`);
      } else {
        console.log(`✅ 自动判断：数据库中的核销金额单位是"元"`);
      }
    }

    // 获取所有有效的门店ID（用于识别未匹配记录）
    const { data: storesData, error: storesError } = await client
      .from('stores')
      .select('store_id')
      .eq('store_system', store_system);

    if (storesError) throw new Error(`查询门店失败: ${storesError.message}`);

    // 构建有效门店ID集合
    const validStoreIds = new Set<string>();
    storesData?.forEach((store: any) => {
      if (store.store_id) {
        validStoreIds.add(String(store.store_id));
      }
    });

    // 获取退款数据
    let refundQuery = client
      .from('refund_records')
      .select('store_id, store_name, refund_amount')
      .eq('store_system', store_system);

    if (time_start) {
      refundQuery = refundQuery.gte('refund_time', time_start);
    }
    if (time_end) {
      refundQuery = refundQuery.lte('refund_time', time_end);
    }

    const { data: refundData, error: refundError } = await refundQuery;
    if (refundError) throw new Error(`查询退款失败: ${refundError.message}`);

    // 按门店聚合订单数据
    const orderByStore: Record<string, {
      store_id: string;
      store_name: string;
      total_orders: number;
      valid_orders: number; // 实收 > 10
      fake_orders: number; // 实收 <= 10
      total_amount: number;
      valid_amount: number;
      fake_amount: number;
    }> = {};

    orderData?.forEach((order: any) => {
      const storeId = order.store_id || 'unknown';
      if (!orderByStore[storeId]) {
        orderByStore[storeId] = {
          store_id: storeId,
          store_name: order.store_name || '未知门店',
          total_orders: 0,
          valid_orders: 0,
          fake_orders: 0,
          total_amount: 0,
          valid_amount: 0,
          fake_amount: 0,
        };
      }

      const actualAmount = parseFloat(String(order.actual_amount || 0)) || 0;
      orderByStore[storeId].total_orders++;
      orderByStore[storeId].total_amount += actualAmount;

      if (actualAmount > 10) {
        orderByStore[storeId].valid_orders++;
        orderByStore[storeId].valid_amount += actualAmount;
      } else {
        orderByStore[storeId].fake_orders++;
        orderByStore[storeId].fake_amount += actualAmount;
      }
    });

    // 按门店聚合核销数据
    const verifyByStore: Record<string, {
      store_id: string;
      store_name: string;
      total_verifies: number;
      valid_verifies: number; // 核销金额 > 10
      fake_verifies: number; // 核销金额 <= 10
      total_verify_amount: number;
      valid_verify_amount: number;
      fake_verify_amount: number;
    }> = {};

    // 未匹配核销统计
    const unmatchedVerifyStats: {
      verifyCount: number;
      verifyAmount: number;
      fakeVerifyCount: number;
      validVerifyCount: number;
      fakeVerifyAmount: number;
      validVerifyAmount: number;
    } = {
      verifyCount: 0,
      verifyAmount: 0,
      fakeVerifyCount: 0,
      validVerifyCount: 0,
      fakeVerifyAmount: 0,
      validVerifyAmount: 0,
    };

    // 未匹配核销详情（最多保存100条）
    const unmatchedVerifyDetails: Array<{
      verifyId: string;
      storeId: string | null;
      reason: string;
      verifyTime: string;
      verifyCount: number;
      verifyAmount: number;
    }> = [];

    verifyData?.forEach((verify: any, index: number) => {
      const storeId = verify.store_id ? String(verify.store_id) : null;

      // 判断是否匹配门店
      const isMatched = storeId && validStoreIds.has(storeId);

      if (isMatched) {
        // 匹配的门店数据
        if (!verifyByStore[storeId]) {
          verifyByStore[storeId] = {
            store_id: storeId,
            store_name: verify.store_name || '未知门店',
            total_verifies: 0,
            valid_verifies: 0,
            fake_verifies: 0,
            total_verify_amount: 0,
            valid_verify_amount: 0,
            fake_verify_amount: 0,
          };
        }

        // 根据环境自动判断是否需要除以 100
        const rawAmount = parseFloat(String(verify.order_actual_amount || 0)) || 0;
        const verifyAmount = needDivideBy100 ? rawAmount / 100 : rawAmount;
        verifyByStore[storeId].total_verifies++;
        verifyByStore[storeId].total_verify_amount += verifyAmount;

        if (verifyAmount > 10) {
          verifyByStore[storeId].valid_verifies++;
          verifyByStore[storeId].valid_verify_amount += verifyAmount;
        } else {
          verifyByStore[storeId].fake_verifies++;
          verifyByStore[storeId].fake_verify_amount += verifyAmount;
        }
      } else {
        // 未匹配的核销数据
        const reason = !storeId ? '门店ID为空' : '门店ID不在系统中';

        // 根据环境自动判断是否需要除以 100
        const rawAmount = parseFloat(String(verify.order_actual_amount || 0)) || 0;
        const verifyAmount = needDivideBy100 ? rawAmount / 100 : rawAmount;

        unmatchedVerifyStats.verifyCount++;
        unmatchedVerifyStats.verifyAmount += verifyAmount;

        if (verifyAmount > 10) {
          unmatchedVerifyStats.validVerifyCount++;
          unmatchedVerifyStats.validVerifyAmount += verifyAmount;
        } else {
          unmatchedVerifyStats.fakeVerifyCount++;
          unmatchedVerifyStats.fakeVerifyAmount += verifyAmount;
        }

        // 保存未匹配核销详情（最多保存100条）
        if (unmatchedVerifyDetails.length < 100) {
          unmatchedVerifyDetails.push({
            verifyId: verify.order_id || String(index),
            storeId: storeId,
            reason,
            verifyTime: verify.verify_time || '',
            verifyCount: 1,
            verifyAmount,
          });
        }
      }
    });

    // 按门店聚合退款数据
    const refundByStore: Record<string, {
      store_id: string;
      store_name: string;
      refund_count: number;
      refund_amount: number;
    }> = {};

    refundData?.forEach((refund: any) => {
      const storeId = refund.store_id || 'unknown';
      if (!refundByStore[storeId]) {
        refundByStore[storeId] = {
          store_id: storeId,
          store_name: refund.store_name || '未知门店',
          refund_count: 0,
          refund_amount: 0,
        };
      }

      refundByStore[storeId].refund_count++;
      refundByStore[storeId].refund_amount += parseFloat(String(refund.refund_amount || 0)) || 0;
    });

    // 合并数据
    const allStoreIds = new Set([
      ...Object.keys(orderByStore),
      ...Object.keys(verifyByStore),
      ...Object.keys(refundByStore),
    ]);

    const storeStats = Array.from(allStoreIds).map(storeId => {
      const order = orderByStore[storeId];
      const verify = verifyByStore[storeId];
      const refund = refundByStore[storeId];

      const validOrders = order?.valid_orders || 0;
      const validVerifies = verify?.valid_verifies || 0;
      const validVerifyRate = validOrders > 0 ? (validVerifies / validOrders * 100) : 0;

      return {
        store_id: storeId,
        store_name: order?.store_name || verify?.store_name || refund?.store_name || '未知门店',
        // 订单统计
        total_orders: order?.total_orders || 0,
        valid_orders: validOrders,
        fake_orders: order?.fake_orders || 0,
        total_amount: order?.total_amount || 0,
        valid_amount: order?.valid_amount || 0,
        fake_amount: order?.fake_amount || 0,
        // 核销统计
        total_verifies: verify?.total_verifies || 0,
        valid_verifies: validVerifies,
        fake_verifies: verify?.fake_verifies || 0,
        total_verify_amount: verify?.total_verify_amount || 0,
        valid_verify_amount: verify?.valid_verify_amount || 0,
        fake_verify_amount: verify?.fake_verify_amount || 0,
        // 退款统计
        refund_count: refund?.refund_count || 0,
        refund_amount: refund?.refund_amount || 0,
        // 计算指标
        valid_verify_rate: validVerifyRate,
        verify_rate: validOrders > 0 ? (validVerifies / validOrders * 100) : 0,
      };
    });

    // 计算总计
    const totals = storeStats.reduce((acc, store) => ({
      total_orders: acc.total_orders + store.total_orders,
      valid_orders: acc.valid_orders + store.valid_orders,
      fake_orders: acc.fake_orders + store.fake_orders,
      total_amount: acc.total_amount + store.total_amount,
      valid_amount: acc.valid_amount + store.valid_amount,
      fake_amount: acc.fake_amount + store.fake_amount,
      total_verifies: acc.total_verifies + store.total_verifies,
      valid_verifies: acc.valid_verifies + store.valid_verifies,
      fake_verifies: acc.fake_verifies + store.fake_verifies,
      total_verify_amount: acc.total_verify_amount + store.total_verify_amount,
      valid_verify_amount: acc.valid_verify_amount + store.valid_verify_amount,
      fake_verify_amount: acc.fake_verify_amount + store.fake_verify_amount,
      refund_count: acc.refund_count + store.refund_count,
      refund_amount: acc.refund_amount + store.refund_amount,
      valid_verify_rate: 0,
    }), {
      total_orders: 0, valid_orders: 0, fake_orders: 0,
      total_amount: 0, valid_amount: 0, fake_amount: 0,
      total_verifies: 0, valid_verifies: 0, fake_verifies: 0,
      total_verify_amount: 0, valid_verify_amount: 0, fake_verify_amount: 0,
      refund_count: 0, refund_amount: 0,
      valid_verify_rate: 0,
    });

    totals.valid_verify_rate = totals.valid_orders > 0 ? (totals.valid_verifies / totals.valid_orders * 100) : 0;

    // 累加未匹配的核销数据到 totals
    totals.total_verifies += unmatchedVerifyStats.verifyCount;
    totals.valid_verifies += unmatchedVerifyStats.validVerifyCount;
    totals.fake_verifies += unmatchedVerifyStats.fakeVerifyCount;
    totals.total_verify_amount += unmatchedVerifyStats.verifyAmount;
    totals.valid_verify_amount += unmatchedVerifyStats.validVerifyAmount;
    totals.fake_verify_amount += unmatchedVerifyStats.fakeVerifyAmount;

    // ========== 每日统计数据（用于前端时间筛选）==========
    // 按日期聚合订单数据
    const dailyOrderStats: Record<string, {
      orderCount: number;
      fakeOrderCount: number;
      validOrderCount: number;
      fakeOrderAmount: number;
      validOrderAmount: number;
      orderAmount: number;
      unverifiedCount: number;
      unverifiedAmount: number;
    }> = {};

    orderData?.forEach((order: any) => {
      // 安全解析日期
      let date: string;
      try {
        const orderTime = order.order_time;
        if (!orderTime) return; // 跳过无效订单时间
        const parsedDate = new Date(orderTime);
        if (isNaN(parsedDate.getTime())) return; // 跳过无效日期
        date = parsedDate.toISOString().split('T')[0];
      } catch {
        return; // 跳过解析失败的订单
      }
      
      if (!dailyOrderStats[date]) {
        dailyOrderStats[date] = {
          orderCount: 0,
          fakeOrderCount: 0,
          validOrderCount: 0,
          fakeOrderAmount: 0,
          validOrderAmount: 0,
          orderAmount: 0,
          unverifiedCount: 0,
          unverifiedAmount: 0,
        };
      }
      
      const actualAmount = parseFloat(String(order.actual_amount || 0)) || 0;
      const isFake = actualAmount <= 10;
      
      dailyOrderStats[date].orderCount++;
      dailyOrderStats[date].orderAmount += actualAmount;
      
      if (isFake) {
        dailyOrderStats[date].fakeOrderCount++;
        dailyOrderStats[date].fakeOrderAmount += actualAmount;
      } else {
        dailyOrderStats[date].validOrderCount++;
        dailyOrderStats[date].validOrderAmount += actualAmount;
        // 检查是否已核销
        const storeId = order.store_id;
        const hasVerify = verifyData?.some((v: any) => 
          v.store_id === storeId && 
          v.verify_time >= order.order_time
        );
        if (!hasVerify) {
          dailyOrderStats[date].unverifiedCount++;
          dailyOrderStats[date].unverifiedAmount += actualAmount;
        }
      }
    });

    // 按日期聚合核销数据
    const dailyVerifyStats: Record<string, {
      verifyCount: number;
      fakeVerifyCount: number;
      validVerifyCount: number;
      fakeVerifyAmount: number;
      validVerifyAmount: number;
      verifyAmount: number;
    }> = {};

    verifyData?.forEach((verify: any) => {
      // 安全解析日期
      let date: string;
      try {
        const verifyTime = verify.verify_time;
        if (!verifyTime) return;
        const parsedDate = new Date(verifyTime);
        if (isNaN(parsedDate.getTime())) return;
        date = parsedDate.toISOString().split('T')[0];
      } catch {
        return;
      }

      if (!dailyVerifyStats[date]) {
        dailyVerifyStats[date] = {
          verifyCount: 0,
          fakeVerifyCount: 0,
          validVerifyCount: 0,
          fakeVerifyAmount: 0,
          validVerifyAmount: 0,
          verifyAmount: 0,
        };
      }

      // 根据环境自动判断是否需要除以 100
      const rawAmount = parseFloat(String(verify.order_actual_amount || 0)) || 0;
      const verifyAmount = needDivideBy100 ? rawAmount / 100 : rawAmount;
      const isFake = verifyAmount <= 10;

      dailyVerifyStats[date].verifyCount++;
      dailyVerifyStats[date].verifyAmount += verifyAmount;

      if (isFake) {
        dailyVerifyStats[date].fakeVerifyCount++;
        dailyVerifyStats[date].fakeVerifyAmount += verifyAmount;
      } else {
        dailyVerifyStats[date].validVerifyCount++;
        dailyVerifyStats[date].validVerifyAmount += verifyAmount;
      }
    });

    // 按日期聚合退款数据
    const dailyRefundStats: Record<string, {
      refundCount: number;
      refundAmount: number;
    }> = {};

    refundData?.forEach((refund: any) => {
      // 安全解析日期
      let date: string;
      try {
        const refundTime = refund.refund_time;
        if (!refundTime) return;
        const parsedDate = new Date(refundTime);
        if (isNaN(parsedDate.getTime())) return;
        date = parsedDate.toISOString().split('T')[0];
      } catch {
        return;
      }
      
      if (!dailyRefundStats[date]) {
        dailyRefundStats[date] = {
          refundCount: 0,
          refundAmount: 0,
        };
      }
      
      dailyRefundStats[date].refundCount++;
      dailyRefundStats[date].refundAmount += parseFloat(String(refund.refund_amount || 0)) || 0;
    });

    // ========== 渠道统计数据 ==========
    // 订单渠道统计
    const orderChannelStats: Record<string, number> = {};
    const orderDailyChannelStats: Record<string, Record<string, number>> = {};
    const orderValidChannelStats: Record<string, number> = {};
    const orderDailyValidChannelStats: Record<string, Record<string, number>> = {};

    orderData?.forEach((order: any) => {
      const channel = order.channel || '未知';

      // 解析日期
      let date: string;
      try {
        const orderTime = order.order_time;
        if (!orderTime) return;
        const parsedDate = new Date(orderTime);
        if (isNaN(parsedDate.getTime())) return;
        date = parsedDate.toISOString().split('T')[0];
      } catch {
        return;
      }

      const actualAmount = parseFloat(String(order.actual_amount || 0)) || 0;

      // 累计渠道统计
      orderChannelStats[channel] = (orderChannelStats[channel] || 0) + 1;

      // 按日渠道统计
      if (!orderDailyChannelStats[date]) {
        orderDailyChannelStats[date] = {};
      }
      orderDailyChannelStats[date][channel] = (orderDailyChannelStats[date][channel] || 0) + 1;

      // 有效订单渠道统计（订单实收 > 10元）
      if (actualAmount > 10) {
        orderValidChannelStats[channel] = (orderValidChannelStats[channel] || 0) + 1;

        if (!orderDailyValidChannelStats[date]) {
          orderDailyValidChannelStats[date] = {};
        }
        orderDailyValidChannelStats[date][channel] = (orderDailyValidChannelStats[date][channel] || 0) + 1;
      }
    });

    // 核销渠道统计
    const verifyChannelStats: Record<string, number> = {};
    const verifyDailyChannelStats: Record<string, Record<string, number>> = {};
    const verifyValidChannelStats: Record<string, number> = {};
    const verifyDailyValidChannelStats: Record<string, Record<string, number>> = {};

    verifyData?.forEach((verify: any) => {
      const channel = verify.channel || '未知';

      // 解析日期
      let date: string;
      try {
        const verifyTime = verify.verify_time;
        if (!verifyTime) return;
        const parsedDate = new Date(verifyTime);
        if (isNaN(parsedDate.getTime())) return;
        date = parsedDate.toISOString().split('T')[0];
      } catch {
        return;
      }

      // 根据环境自动判断是否需要除以 100
      const rawAmount = parseFloat(String(verify.order_actual_amount || 0)) || 0;
      const verifyAmount = needDivideBy100 ? rawAmount / 100 : rawAmount;

      // 累计渠道统计
      verifyChannelStats[channel] = (verifyChannelStats[channel] || 0) + 1;

      // 按日渠道统计
      if (!verifyDailyChannelStats[date]) {
        verifyDailyChannelStats[date] = {};
      }
      verifyDailyChannelStats[date][channel] = (verifyDailyChannelStats[date][channel] || 0) + 1;

      // 有效核销渠道统计（核销金额 > 10元）
      if (verifyAmount > 10) {
        verifyValidChannelStats[channel] = (verifyValidChannelStats[channel] || 0) + 1;

        if (!verifyDailyValidChannelStats[date]) {
          verifyDailyValidChannelStats[date] = {};
        }
        verifyDailyValidChannelStats[date][channel] = (verifyDailyValidChannelStats[date][channel] || 0) + 1;
      }
    });

    // 订单套餐统计
    const orderPackageStats: Record<string, number> = {};
    const orderDailyPackageStats: Record<string, Record<string, number>> = {};
    const orderValidPackageStats: Record<string, number> = {};
    const orderDailyValidPackageStats: Record<string, Record<string, number>> = {};

    orderData?.forEach((order: any) => {
      const packageName = order.product_name || '未知';

      // 解析日期
      let date: string;
      try {
        const orderTime = order.order_time;
        if (!orderTime) return;
        const parsedDate = new Date(orderTime);
        if (isNaN(parsedDate.getTime())) return;
        date = parsedDate.toISOString().split('T')[0];
      } catch {
        return;
      }

      const actualAmount = parseFloat(String(order.actual_amount || 0)) || 0;

      // 累计套餐统计
      orderPackageStats[packageName] = (orderPackageStats[packageName] || 0) + 1;

      // 按日套餐统计
      if (!orderDailyPackageStats[date]) {
        orderDailyPackageStats[date] = {};
      }
      orderDailyPackageStats[date][packageName] = (orderDailyPackageStats[date][packageName] || 0) + 1;

      // 有效订单套餐统计（订单实收 > 10元）
      if (actualAmount > 10) {
        orderValidPackageStats[packageName] = (orderValidPackageStats[packageName] || 0) + 1;

        if (!orderDailyValidPackageStats[date]) {
          orderDailyValidPackageStats[date] = {};
        }
        orderDailyValidPackageStats[date][packageName] = (orderDailyValidPackageStats[date][packageName] || 0) + 1;
      }
    });

    // 核销套餐统计
    const verifyPackageStats: Record<string, number> = {};
    const verifyDailyPackageStats: Record<string, Record<string, number>> = {};
    const verifyValidPackageStats: Record<string, number> = {};
    const verifyDailyValidPackageStats: Record<string, Record<string, number>> = {};

    verifyData?.forEach((verify: any) => {
      const packageName = verify.product_name || '未知';

      // 解析日期
      let date: string;
      try {
        const verifyTime = verify.verify_time;
        if (!verifyTime) return;
        const parsedDate = new Date(verifyTime);
        if (isNaN(parsedDate.getTime())) return;
        date = parsedDate.toISOString().split('T')[0];
      } catch {
        return;
      }

      // 根据环境自动判断是否需要除以 100
      const rawAmount = parseFloat(String(verify.order_actual_amount || 0)) || 0;
      const verifyAmount = needDivideBy100 ? rawAmount / 100 : rawAmount;

      // 累计套餐统计
      verifyPackageStats[packageName] = (verifyPackageStats[packageName] || 0) + 1;

      // 按日套餐统计
      if (!verifyDailyPackageStats[date]) {
        verifyDailyPackageStats[date] = {};
      }
      verifyDailyPackageStats[date][packageName] = (verifyDailyPackageStats[date][packageName] || 0) + 1;

      // 有效核销套餐统计（核销金额 > 10元）
      if (verifyAmount > 10) {
        verifyValidPackageStats[packageName] = (verifyValidPackageStats[packageName] || 0) + 1;

        if (!verifyDailyValidPackageStats[date]) {
          verifyDailyValidPackageStats[date] = {};
        }
        verifyDailyValidPackageStats[date][packageName] = (verifyDailyValidPackageStats[date][packageName] || 0) + 1;
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        stores: storeStats,
        totals,
        orderTimeRange: {
          min: orderData?.length ? Math.min(...orderData.map((o: any) => new Date(o.order_time).getTime()).filter(t => !isNaN(t))) : null,
          max: orderData?.length ? Math.max(...orderData.map((o: any) => new Date(o.order_time).getTime()).filter(t => !isNaN(t))) : null,
        },
        verifyTimeRange: {
          min: verifyData?.length ? Math.min(...verifyData.map((v: any) => new Date(v.verify_time).getTime()).filter(t => !isNaN(t))) : null,
          max: verifyData?.length ? Math.max(...verifyData.map((v: any) => new Date(v.verify_time).getTime()).filter(t => !isNaN(t))) : null,
        },
        // 每日统计数据（用于前端时间筛选）
        dailyOrderStats,
        dailyVerifyStats,
        dailyRefundStats,
        // 渠道统计数据
        orderChannelStats,
        orderDailyChannelStats,
        orderValidChannelStats,
        orderDailyValidChannelStats,
        verifyChannelStats,
        verifyDailyChannelStats,
        verifyValidChannelStats,
        verifyDailyValidChannelStats,
        // 套餐统计数据
        orderPackageStats,
        orderDailyPackageStats,
        orderValidPackageStats,
        orderDailyValidPackageStats,
        verifyPackageStats,
        verifyDailyPackageStats,
        verifyValidPackageStats,
        verifyDailyValidPackageStats,
        // 汇总统计
        summary: {
          totalRecords: (orderData?.length || 0) + (verifyData?.length || 0) + (refundData?.length || 0),
          matchedRecords: storeStats.length,
          unmatchedRecords: unmatchedVerifyStats.verifyCount, // 未匹配核销记录数
        },
        // 未匹配核销统计
        unmatchedVerifyStats,
        unmatchedVerifyDetails,
      }
    });
  } catch (error) {
    console.error('获取门店统计数据失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '查询失败' },
      { status: 500 }
    );
  }
}
