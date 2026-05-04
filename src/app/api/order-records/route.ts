import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 上传订单数据到数据库
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { store_system, records, file_name } = body;

    if (!store_system || !Array.isArray(records)) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      );
    }

    console.log(`[订单上传] 门店体系: ${store_system}, 记录数: ${records.length}`);

    // 先删除该门店体系的旧订单数据
    const { error: deleteError } = await client
      .from('order_records')
      .delete()
      .eq('store_system', store_system);

    if (deleteError) {
      console.error('删除旧订单数据失败:', deleteError);
    }

    // 计算时间范围
    let minTime: string | null = null;
    let maxTime: string | null = null;

    // 转换并插入新数据
    const insertData = records.map((record: any) => {
      const orderTime = record.orderTime || record.order_time || record.日期时间 || null;
      if (orderTime && (!minTime || orderTime < minTime)) minTime = orderTime;
      if (orderTime && (!maxTime || orderTime > maxTime)) maxTime = orderTime;

      return {
        store_system,
        store_id: record.storeId || record.store_id || record.门店ID || null,
        store_name: record.storeName || record.store_name || record.门店名称 || null,
        order_id: record.orderId || record.order_id || record.订单ID || null,
        order_time: orderTime,
        // Excel中的订单金额单位是"元"，无需转换
        order_amount: parseFloat(record.orderAmount || record.order_amount || record.订单金额 || 0) || 0,
        actual_amount: parseFloat(record.actualAmount || record.actual_amount || record.实收金额 || 0) || 0,
        channel: record.channel || record.渠道 || null,
        order_status: record.orderStatus || record.order_status || record.订单状态 || null,
        product_name: record.productName || record.product_name || record.商品名称 || null,
      };
    });

    const { data, error } = await client
      .from('order_records')
      .insert(insertData)
      .select();

    if (error) {
      console.error('插入订单数据失败:', error);
      throw new Error(`插入失败: ${error.message}`);
    }

    // 记录上传历史
    await client.from('data_upload_history').insert({
      store_system,
      file_type: 'order',
      file_name: file_name || '订单数据',
      record_count: records.length,
      min_time: minTime,
      max_time: maxTime,
    });

    console.log(`[订单上传] 完成，插入 ${data?.length || 0} 条记录，时间范围: ${minTime} ~ ${maxTime}`);

    return NextResponse.json({
      success: true,
      data: {
        totalRecords: records.length,
        insertedRecords: data?.length || 0,
        minTime,
        maxTime,
      }
    });
  } catch (error) {
    console.error('上传订单数据失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '上传失败' },
      { status: 500 }
    );
  }
}

// 获取订单数据
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const store_system = searchParams.get('store_system');
    const store_id = searchParams.get('store_id');
    const time_start = searchParams.get('time_start');
    const time_end = searchParams.get('time_end');
    const aggregate = searchParams.get('aggregate') === 'true';

    if (!store_system) {
      return NextResponse.json(
        { success: false, error: '缺少store_system参数' },
        { status: 400 }
      );
    }

    // 如果需要聚合数据
    if (aggregate) {
      // 使用分页查询获取所有订单数据（Supabase 默认限制 1000 条/页）
      const allData: any[] = [];
      const pageSize = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        let query = client.from('order_records')
          .select('*')
          .eq('store_system', store_system)
          .range(from, to);

        if (store_id) {
          query = query.eq('store_id', store_id);
        }
        if (time_start) {
          query = query.gte('order_time', time_start);
        }
        if (time_end) {
          query = query.lte('order_time', time_end);
        }

        const { data, error } = await query;
        if (error) throw new Error(`查询订单数据失败: ${error.message}`);

        if (data && data.length > 0) {
          allData.push(...data);
          page++;
          if (data.length < pageSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      console.log(`[订单聚合查询] 分页查询完成，共获取 ${allData.length} 条记录`);

      // 查询当前门店体系的所有门店ID（用于判断订单是否匹配到门店）
      const { data: storesData, error: storesError } = await client
        .from('stores')
        .select('store_id')
        .eq('store_system', store_system);

      if (storesError) {
        console.error('查询门店数据失败:', storesError);
        return NextResponse.json(
          { success: false, error: '查询门店数据失败' },
          { status: 500 }
        );
      }

      // 构建门店ID集合，用于快速查找
      const storeIdSet = new Set(
        storesData?.map(s => s.store_id).filter(Boolean) || []
      );

      console.log(`[订单聚合查询] 门店体系中门店数: ${storeIdSet.size}`);

      const data = allData;

      // 计算聚合数据
      const storeStats: Record<string, {
        totalOrderCount: number;
        totalFakeOrderCount: number;
        totalValidOrderCount: number;
        totalFakeOrderAmount: number;
        totalValidOrderAmount: number;
        totalOrderAmount: number;
        totalRefundCount: number;
        totalRefundAmount: number;
        totalSameDayRefundCount: number;
        totalSameDayRefundAmount: number;
        totalUnverifiedCount: number;
        totalUnverifiedAmount: number;
        dailyStats: Record<string, any>;
        orderIdToStoreId: Record<string, string>;
        channelStats: Record<string, number>;
      }> = {};

      const unmatchedDailyStats: Record<string, any> = {};
      const unmatchedTotal = {
        orderCount: 0,
        fakeOrderCount: 0,
        validOrderCount: 0,
        fakeOrderAmount: 0,
        validOrderAmount: 0,
        orderAmount: 0,
        refundCount: 0,
        refundAmount: 0,
        sameDayRefundCount: 0,
        sameDayRefundAmount: 0,
        unverifiedCount: 0,
        unverifiedAmount: 0,
        channelStats: {} as Record<string, number>,
      };

      const orderMapping: Record<string, string> = {};
      let matchedCount = 0;
      let minTime = '';
      let maxTime = '';

      for (const order of data || []) {
        const orderTime = order.order_time || '';
        const orderAmount = parseFloat(order.order_amount || '0') || 0;
        const actualAmount = parseFloat(order.actual_amount || '0') || 0;
        const quantity = parseInt(order.quantity || '1') || 1;
        const orderStatus = order.order_status || '';
        // 提取日期部分 YYYY-MM-DD（处理多种格式）
        const orderDate = orderTime ? orderTime.substring(0, 10) : '';
        const channel = order.channel || '未知';

        // 判断是否刷单（订单实收 <= 10元）
        const isFake = actualAmount <= 10;
        // 判断是否退款（订单状态为'未使用取消'）
        const isRefund = orderStatus === '未使用取消';
        // 判断是否未核销（订单状态为'待使用'）
        const isUnverified = orderStatus === '待使用';

        if (orderDate) {
          if (!minTime || orderDate < minTime) minTime = orderDate;
          if (!maxTime || orderDate > maxTime) maxTime = orderDate;
        }

        // 记录订单ID到门店ID的映射
        if (order.order_id && order.store_id) {
          orderMapping[order.order_id] = order.store_id;
        }

        // 判断订单是否匹配到门店（检查store_id是否在门店表中）
        const isMatched = order.store_id && storeIdSet.has(order.store_id);

        if (isMatched) {
          matchedCount++;
          if (!storeStats[order.store_id]) {
            storeStats[order.store_id] = {
              totalOrderCount: 0,
              totalFakeOrderCount: 0,
              totalValidOrderCount: 0,
              totalFakeOrderAmount: 0,
              totalValidOrderAmount: 0,
              totalOrderAmount: 0,
              totalRefundCount: 0,
              totalRefundAmount: 0,
              totalSameDayRefundCount: 0,
              totalSameDayRefundAmount: 0,
              totalUnverifiedCount: 0,
              totalUnverifiedAmount: 0,
              dailyStats: {},
              orderIdToStoreId: {},
              channelStats: {},
            };
          }

          const stats = storeStats[order.store_id];
          stats.totalOrderCount += quantity;
          stats.totalOrderAmount += orderAmount;
          stats.orderIdToStoreId[order.order_id || ''] = order.store_id;

          if (isFake) {
            stats.totalFakeOrderCount += quantity;
            stats.totalFakeOrderAmount += orderAmount;
          } else {
            stats.totalValidOrderCount += quantity;
            stats.totalValidOrderAmount += orderAmount;
          }

          // 未核销数统计
          if (isUnverified) {
            stats.totalUnverifiedCount += quantity;
            stats.totalUnverifiedAmount += orderAmount;
          }

          // 退款数统计（订单状态为'未使用取消'）
          if (isRefund) {
            stats.totalRefundCount += quantity;
            stats.totalRefundAmount += orderAmount;
          }

          // 渠道统计
          stats.channelStats[channel] = (stats.channelStats[channel] || 0) + quantity;

          // 按日统计
          if (orderDate) {
            if (!stats.dailyStats[orderDate]) {
              stats.dailyStats[orderDate] = {
                orderCount: 0,
                fakeOrderCount: 0,
                validOrderCount: 0,
                fakeOrderAmount: 0,
                validOrderAmount: 0,
                orderAmount: 0,
                refundCount: 0,
                refundAmount: 0,
                sameDayRefundCount: 0,
                sameDayRefundAmount: 0,
                unverifiedCount: 0,
                unverifiedAmount: 0,
                channelStats: {},
              };
            }
            const daily = stats.dailyStats[orderDate];
            daily.orderCount += quantity;
            daily.orderAmount += orderAmount;
            if (isFake) {
              daily.fakeOrderCount += quantity;
              daily.fakeOrderAmount += orderAmount;
            } else {
              daily.validOrderCount += quantity;
              daily.validOrderAmount += orderAmount;
            }
            // 未核销数按日统计
            if (isUnverified) {
              daily.unverifiedCount += quantity;
              daily.unverifiedAmount += orderAmount;
            }
            // 退款数按日统计（订单状态为'未使用取消'）
            if (isRefund) {
              daily.refundCount += quantity;
              daily.refundAmount += orderAmount;
            }
            daily.channelStats[channel] = (daily.channelStats[channel] || 0) + quantity;
          }
        } else {
          // 未匹配订单
          unmatchedTotal.orderCount += quantity;
          unmatchedTotal.orderAmount += orderAmount;
          if (isFake) {
            unmatchedTotal.fakeOrderCount += quantity;
            unmatchedTotal.fakeOrderAmount += orderAmount;
          } else {
            unmatchedTotal.validOrderCount += quantity;
            unmatchedTotal.validOrderAmount += orderAmount;
          }
          // 未核销数统计
          if (isUnverified) {
            unmatchedTotal.unverifiedCount += quantity;
            unmatchedTotal.unverifiedAmount += orderAmount;
          }
          // 退款数统计（订单状态为'未使用取消'）
          if (isRefund) {
            unmatchedTotal.refundCount += quantity;
            unmatchedTotal.refundAmount += orderAmount;
          }
          // 渠道统计
          unmatchedTotal.channelStats[channel] = (unmatchedTotal.channelStats[channel] || 0) + quantity;

          if (orderDate) {
            if (!unmatchedDailyStats[orderDate]) {
              unmatchedDailyStats[orderDate] = {
                orderCount: 0,
                fakeOrderCount: 0,
                validOrderCount: 0,
                fakeOrderAmount: 0,
                validOrderAmount: 0,
                orderAmount: 0,
                refundCount: 0,
                refundAmount: 0,
                sameDayRefundCount: 0,
                sameDayRefundAmount: 0,
                unverifiedCount: 0,
                unverifiedAmount: 0,
                channelStats: {},
              };
            }
            const daily = unmatchedDailyStats[orderDate];
            daily.orderCount += quantity;
            daily.orderAmount += orderAmount;
            if (isFake) {
              daily.fakeOrderCount += quantity;
              daily.fakeOrderAmount += orderAmount;
            } else {
              daily.validOrderCount += quantity;
              daily.validOrderAmount += orderAmount;
            }
            // 未核销数按日统计
            if (isUnverified) {
              daily.unverifiedCount += quantity;
              daily.unverifiedAmount += orderAmount;
            }
            // 退款数按日统计（订单状态为'未使用取消'）
            if (isRefund) {
              daily.refundCount += quantity;
              daily.refundAmount += orderAmount;
            }
            daily.channelStats[channel] = (daily.channelStats[channel] || 0) + quantity;
          }
        }
      }

      // ========== 计算全局渠道统计 ==========
      const globalChannelStats: Record<string, number> = {};
      const globalDailyChannelStats: Record<string, Record<string, number>> = {};
      const globalValidChannelStats: Record<string, number> = {};
      const globalDailyValidChannelStats: Record<string, Record<string, number>> = {};

      for (const order of data || []) {
        const orderTime = order.order_time || '';
        const orderAmount = parseFloat(order.order_amount || '0') || 0;
        const actualAmount = parseFloat(order.actual_amount || '0') || 0;
        const quantity = parseInt(order.quantity || '1') || 1;
        const orderDate = orderTime ? orderTime.substring(0, 10) : '';
        const channel = order.channel || '未知';

        const isFake = actualAmount <= 10;

        // 累计渠道统计
        globalChannelStats[channel] = (globalChannelStats[channel] || 0) + quantity;

        // 按日渠道统计
        if (orderDate) {
          if (!globalDailyChannelStats[orderDate]) {
            globalDailyChannelStats[orderDate] = {};
          }
          globalDailyChannelStats[orderDate][channel] = (globalDailyChannelStats[orderDate][channel] || 0) + quantity;

          // 有效订单渠道统计（订单实收 > 10元）
          if (!isFake) {
            globalValidChannelStats[channel] = (globalValidChannelStats[channel] || 0) + quantity;

            if (!globalDailyValidChannelStats[orderDate]) {
              globalDailyValidChannelStats[orderDate] = {};
            }
            globalDailyValidChannelStats[orderDate][channel] = (globalDailyValidChannelStats[orderDate][channel] || 0) + quantity;
          }
        }
      }

      // ========== 计算全局套餐统计（基于商品名称）==========
      const globalPackageStats: Record<string, number> = {};
      const globalDailyPackageStats: Record<string, Record<string, number>> = {};
      const globalValidPackageStats: Record<string, number> = {};
      const globalDailyValidPackageStats: Record<string, Record<string, number>> = {};
      const globalPackageAmountStats: Record<string, number> = {};
      const globalDailyPackageAmountStats: Record<string, Record<string, number>> = {};
      const globalValidPackageAmountStats: Record<string, number> = {};
      const globalDailyValidPackageAmountStats: Record<string, Record<string, number>> = {};

      for (const order of data || []) {
        const orderTime = order.order_time || '';
        const orderAmount = parseFloat(order.order_amount || '0') || 0;
        const actualAmount = parseFloat(order.actual_amount || '0') || 0;
        const quantity = parseInt(order.quantity || '1') || 1;
        const orderDate = orderTime ? orderTime.substring(0, 10) : '';
        const packageName = order.product_name || '未知';

        const isFake = actualAmount <= 10;

        // 累计套餐统计（数量）
        globalPackageStats[packageName] = (globalPackageStats[packageName] || 0) + quantity;

        // 累计套餐统计（金额）
        globalPackageAmountStats[packageName] = (globalPackageAmountStats[packageName] || 0) + orderAmount;

        // 按日套餐统计
        if (orderDate) {
          if (!globalDailyPackageStats[orderDate]) {
            globalDailyPackageStats[orderDate] = {};
          }
          globalDailyPackageStats[orderDate][packageName] = (globalDailyPackageStats[orderDate][packageName] || 0) + quantity;

          if (!globalDailyPackageAmountStats[orderDate]) {
            globalDailyPackageAmountStats[orderDate] = {};
          }
          globalDailyPackageAmountStats[orderDate][packageName] = (globalDailyPackageAmountStats[orderDate][packageName] || 0) + orderAmount;

          // 有效订单套餐统计（订单实收 > 10元）
          if (!isFake) {
            globalValidPackageStats[packageName] = (globalValidPackageStats[packageName] || 0) + quantity;

            globalValidPackageAmountStats[packageName] = (globalValidPackageAmountStats[packageName] || 0) + orderAmount;

            if (!globalDailyValidPackageStats[orderDate]) {
              globalDailyValidPackageStats[orderDate] = {};
            }
            globalDailyValidPackageStats[orderDate][packageName] = (globalDailyValidPackageStats[orderDate][packageName] || 0) + quantity;

            if (!globalDailyValidPackageAmountStats[orderDate]) {
              globalDailyValidPackageAmountStats[orderDate] = {};
            }
            globalDailyValidPackageAmountStats[orderDate][packageName] = (globalDailyValidPackageAmountStats[orderDate][packageName] || 0) + orderAmount;
          }
        }
      }

      return NextResponse.json({
        success: true,
        storeStats,
        timeRange: { minTime, maxTime },
        stats: { totalRecords: data?.length || 0, matchedRecords: matchedCount, unmatchedRecords: (data?.length || 0) - matchedCount },
        unmatchedDailyStats,
        unmatchedTotal,
        orderMapping,
        channelStats: globalChannelStats,
        dailyChannelStats: globalDailyChannelStats,
        validChannelStats: globalValidChannelStats,
        dailyValidChannelStats: globalDailyValidChannelStats,
        packageStats: globalPackageStats,
        dailyPackageStats: globalDailyPackageStats,
        validPackageStats: globalValidPackageStats,
        dailyValidPackageStats: globalDailyValidPackageStats,
        packageAmountStats: globalPackageAmountStats,
        dailyPackageAmountStats: globalDailyPackageAmountStats,
        validPackageAmountStats: globalValidPackageAmountStats,
        dailyValidPackageAmountStats: globalDailyValidPackageAmountStats,
      });
    }

    // 原有逻辑 - 获取原始记录
    let query = client.from('order_records').select('*').eq('store_system', store_system);

    if (store_id) {
      query = query.eq('store_id', store_id);
    }

    if (time_start) {
      query = query.gte('order_time', time_start);
    }

    if (time_end) {
      query = query.lte('order_time', time_end);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询失败: ${error.message}`);
    }

    // 获取时间范围
    const { data: rangeData } = await client
      .from('order_records')
      .select('order_time')
      .eq('store_system', store_system)
      .not('order_time', 'is', null)
      .order('order_time', { ascending: true })
      .limit(1);

    const { data: rangeDataEnd } = await client
      .from('order_records')
      .select('order_time')
      .eq('store_system', store_system)
      .not('order_time', 'is', null)
      .order('order_time', { ascending: false })
      .limit(1);

    return NextResponse.json({
      success: true,
      data: {
        records: data || [],
        totalCount: data?.length || 0,
        minTime: rangeData?.[0]?.order_time || null,
        maxTime: rangeDataEnd?.[0]?.order_time || null,
      }
    });
  } catch (error) {
    console.error('获取订单数据失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '查询失败' },
      { status: 500 }
    );
  }
}

// 删除订单数据
export async function DELETE(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const store_system = searchParams.get('store_system');

    if (!store_system) {
      return NextResponse.json(
        { success: false, error: '缺少store_system参数' },
        { status: 400 }
      );
    }

    // 先查询有多少记录
    const { count } = await client
      .from('order_records')
      .select('*', { count: 'exact', head: true })
      .eq('store_system', store_system);

    // 删除该门店体系的订单数据
    const { error } = await client
      .from('order_records')
      .delete()
      .eq('store_system', store_system);

    if (error) {
      throw new Error(`删除失败: ${error.message}`);
    }

    console.log(`[订单删除] 门店体系: ${store_system}, 删除 ${count} 条记录`);

    return NextResponse.json({
      success: true,
      data: { deletedCount: count || 0 }
    });
  } catch (error) {
    console.error('删除订单数据失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '删除失败' },
      { status: 500 }
    );
  }
}
