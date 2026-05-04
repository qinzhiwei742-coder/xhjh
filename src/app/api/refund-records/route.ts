import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 建立订单ID到门店ID的映射（分页查询获取所有数据）
 */
async function buildOrderIdToStoreIdMap(client: any, store_system: string): Promise<Map<string, string>> {
  const orderIdToStoreIdMap = new Map<string, string>();
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data: ordersData, error: ordersError } = await client
      .from('order_records')
      .select('order_id, store_id')
      .eq('store_system', store_system)
      .range(from, to);

    if (ordersError) {
      console.error('查询订单数据失败:', ordersError);
      break;
    }

    if (ordersData && ordersData.length > 0) {
      ordersData.forEach((order: any) => {
        if (order.order_id && order.store_id) {
          orderIdToStoreIdMap.set(order.order_id, order.store_id);
        }
      });
      page++;
      if (ordersData.length < pageSize) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  console.log(`[补全门店ID] 订单映射数量: ${orderIdToStoreIdMap.size}`);
  return orderIdToStoreIdMap;
}

/**
 * 补全退款记录的门店ID（通过订单ID匹配）
 */
async function completeStoreIdForRefunds(
  client: any,
  store_system: string,
  records: any[]
): Promise<{ records: any[], completedCount: number }> {
  console.log(`[补全门店ID] 开始处理 ${records.length} 条退款记录`);

  const orderIdToStoreIdMap = await buildOrderIdToStoreIdMap(client, store_system);

  let completedCount = 0;
  const completedRecords = records.map((record: any) => {
    // 如果退款记录已经有store_id，直接使用
    if (record.store_id) {
      return record;
    }

    // 如果退款记录没有store_id但有order_id，通过订单ID查找store_id
    if (record.order_id) {
      const storeIdFromOrder = orderIdToStoreIdMap.get(record.order_id);
      if (storeIdFromOrder) {
        completedCount++;
        console.log(`[补全门店ID] 订单 ${record.order_id} 匹配到门店 ${storeIdFromOrder}`);
        return { ...record, store_id: storeIdFromOrder };
      }
    }

    return record;
  });

  console.log(`[补全门店ID] 完成，补全了 ${completedCount} 条记录`);
  return { records: completedRecords, completedCount };
}

// 上传退款数据到数据库
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

    console.log(`[退款上传] 门店体系: ${store_system}, 记录数: ${records.length}`);

    // 先删除该门店体系的旧退款数据
    const { error: deleteError } = await client
      .from('refund_records')
      .delete()
      .eq('store_system', store_system);

    if (deleteError) {
      console.error('删除旧退款数据失败:', deleteError);
    }

    // 转换数据格式
    const convertedRecords = records.map((record: any) => {
      const refundTime = record.refundTime || record.refund_time || record.退款时间 || null;
      const afterSaleStatus = record.afterSaleStatus || record.after_sale_status || record.售后状态 || null;
      const refundCompleteTime = record.refundCompleteTime || record.refund_complete_time || record.退款审核完成时间 || null;

      return {
        store_system,
        store_id: record.storeId || record.store_id || record.门店ID || null,
        store_name: record.storeName || record.store_name || record.门店名称 || null,
        refund_id: record.refundId || record.refund_id || record.退款ID || null,
        refund_time: refundTime,
        // Excel中的退款金额单位是"元"，无需转换
        refund_amount: parseFloat(record.refundAmount || record.refund_amount || record.退款金额 || 0) || 0,
        order_id: record.orderId || record.order_id || record.原订单ID || null,
        after_sale_status: afterSaleStatus,
        refund_complete_time: refundCompleteTime,
      };
    });

    // 补全门店ID（通过订单ID匹配）
    const { records: recordsWithStoreId, completedCount } = await completeStoreIdForRefunds(
      client,
      store_system,
      convertedRecords
    );

    // 计算时间范围
    let minTime: string | null = null;
    let maxTime: string | null = null;
    recordsWithStoreId.forEach(record => {
      const refundTime = record.refund_time;
      if (refundTime && (!minTime || refundTime < minTime)) minTime = refundTime;
      if (refundTime && (!maxTime || refundTime > maxTime)) maxTime = refundTime;
    });

    // 插入数据
    const { data, error } = await client
      .from('refund_records')
      .insert(recordsWithStoreId)
      .select();

    if (error) {
      console.error('插入退款数据失败:', error);
      throw new Error(`插入失败: ${error.message}`);
    }

    // 记录上传历史
    await client.from('data_upload_history').insert({
      store_system,
      file_type: 'refund',
      file_name: file_name || '退款数据',
      record_count: records.length,
      min_time: minTime,
      max_time: maxTime,
    });

    console.log(`[退款上传] 完成，插入 ${data?.length || 0} 条记录，自动补全 ${completedCount} 条门店ID，时间范围: ${minTime} ~ ${maxTime}`);

    return NextResponse.json({
      success: true,
      data: {
        totalRecords: records.length,
        insertedRecords: data?.length || 0,
        completedStoreIdCount: completedCount,
        minTime,
        maxTime,
      }
    });
  } catch (error) {
    console.error('上传退款数据失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '上传失败' },
      { status: 500 }
    );
  }
}

// 获取退款数据
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
      // 使用分页查询获取所有退款数据（Supabase 默认限制 1000 条/页）
      const allData: any[] = [];
      const pageSize = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        let query = client.from('refund_records')
          .select('*')
          .eq('store_system', store_system)
          .eq('after_sale_status', '已退款')
          .range(from, to);

        if (store_id) {
          query = query.eq('store_id', store_id);
        }
        if (time_start) {
          query = query.gte('refund_complete_time', time_start);
        }
        if (time_end) {
          query = query.lte('refund_complete_time', time_end);
        }

        const { data, error } = await query;
        if (error) throw new Error(`查询退款数据失败: ${error.message}`);

        if (data && data.length > 0) {
          allData.push(...data);
          page++;
          // 如果返回的数据少于 pageSize，说明已经是最后一页
          if (data.length < pageSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      console.log(`[退款聚合查询] 分页查询完成，共获取 ${allData.length} 条记录`);

      // 查询当前门店体系的所有门店ID（用于判断退款是否匹配到门店）
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

      console.log(`[退款聚合查询] 门店体系中门店数: ${storeIdSet.size}`);

      // 查询订单数据，建立 order_id -> store_id 的映射（使用分页获取所有数据）
      const orderIdToStoreIdMap = new Map<string, string>();
      const orderPageSize = 1000;
      let orderPage = 0;
      let orderHasMore = true;

      while (orderHasMore) {
        const from = orderPage * orderPageSize;
        const to = from + orderPageSize - 1;

        const { data: ordersData, error: ordersError } = await client
          .from('order_records')
          .select('order_id, store_id')
          .eq('store_system', store_system)
          .range(from, to);

        if (ordersError) {
          console.error('查询订单数据失败:', ordersError);
          break;
        }

        if (ordersData && ordersData.length > 0) {
          ordersData.forEach(order => {
            if (order.order_id && order.store_id) {
              orderIdToStoreIdMap.set(order.order_id, order.store_id);
            }
          });
          orderPage++;
          if (ordersData.length < orderPageSize) {
            orderHasMore = false;
          }
        } else {
          orderHasMore = false;
        }
      }

      console.log(`[退款聚合查询] 订单映射数量: ${orderIdToStoreIdMap.size}`);

      const data = allData;

      // 自动补全门店ID（通过订单ID匹配）
      let autoCompletedCount = 0;
      const completedData = data.map(refund => {
        // 如果已经有store_id，直接使用
        if (refund.store_id) {
          return refund;
        }

        // 如果没有store_id但有order_id，通过订单ID查找store_id
        if (refund.order_id) {
          const storeIdFromOrder = orderIdToStoreIdMap.get(refund.order_id);
          if (storeIdFromOrder && storeIdSet.has(storeIdFromOrder)) {
            autoCompletedCount++;
            console.log(`[退款聚合查询] 自动补全: 订单 ${refund.order_id} -> 门店 ${storeIdFromOrder}`);
            return { ...refund, store_id: storeIdFromOrder };
          }
        }

        return refund;
      });

      console.log(`[退款聚合查询] 自动补全了 ${autoCompletedCount} 条记录的门店ID`);

      // 计算聚合
      const storeStats: Record<string, {
        totalRefundCount: number;
        totalRefundAmount: number;
        totalSameDayRefundCount: number;
        totalSameDayRefundAmount: number;
        dailyStats: Record<string, { refundCount: number; refundAmount: number; sameDayRefundCount: number; sameDayRefundAmount: number }>;
      }> = {};

      const unmatchedDailyStats: Record<string, { refundCount: number; refundAmount: number; sameDayRefundCount: number; sameDayRefundAmount: number }> = {};

      let matchedCount = 0;
      let unmatchedTotalCount = 0;
      let unmatchedTotalAmount = 0;
      let minTime = '';
      let maxTime = '';

      const addToDailyStats = (dailyStats: Record<string, any>, date: string, quantity: number, amount: number) => {
        if (!date) return;
        if (!dailyStats[date]) {
          dailyStats[date] = { refundCount: 0, refundAmount: 0, sameDayRefundCount: 0, sameDayRefundAmount: 0 };
        }
        dailyStats[date].refundCount += quantity;
        dailyStats[date].refundAmount += amount;
      };

      for (const refund of completedData || []) {
        const refundTime = refund.refund_complete_time || '';
        const refundAmount = parseFloat(refund.refund_amount || '0') || 0;
        const refundDate = refundTime ? refundTime.substring(0, 10) : '';

        if (refundDate) {
          if (!minTime || refundDate < minTime) minTime = refundDate;
          if (!maxTime || refundDate > maxTime) maxTime = refundDate;
        }

        // 判断退款是否匹配到门店（使用补全后的数据）
        let matchedStoreId: string | null = null;
        if (refund.store_id && storeIdSet.has(refund.store_id)) {
          matchedStoreId = refund.store_id;
        }

        if (matchedStoreId) {
          matchedCount++;
          if (!storeStats[matchedStoreId]) {
            storeStats[matchedStoreId] = { totalRefundCount: 0, totalRefundAmount: 0, totalSameDayRefundCount: 0, totalSameDayRefundAmount: 0, dailyStats: {} };
          }
          storeStats[matchedStoreId].totalRefundCount++;
          storeStats[matchedStoreId].totalRefundAmount += refundAmount;
          addToDailyStats(storeStats[matchedStoreId].dailyStats, refundDate, 1, refundAmount);
        } else {
          unmatchedTotalCount++;
          unmatchedTotalAmount += refundAmount;
          addToDailyStats(unmatchedDailyStats, refundDate, 1, refundAmount);
        }
      }
      
      return NextResponse.json({
        success: true,
        storeStats,
        timeRange: { minTime, maxTime },
        stats: { totalRecords: data?.length || 0, matchedRecords: matchedCount, unmatchedRecords: (data?.length || 0) - matchedCount },
        unmatchedDailyStats,
        unmatchedTotal: { refundCount: unmatchedTotalCount, refundAmount: unmatchedTotalAmount, sameDayRefundCount: 0, sameDayRefundAmount: 0 }
      });
    }

    // 原有逻辑 - 使用 range 获取所有数据
    let query = client.from('refund_records').select('*').eq('store_system', store_system).eq('after_sale_status', '已退款').range(0, 99999);

    if (store_id) {
      query = query.eq('store_id', store_id);
    }

    if (time_start) {
      query = query.gte('refund_complete_time', time_start);
    }

    if (time_end) {
      query = query.lte('refund_complete_time', time_end);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询失败: ${error.message}`);
    }

    // 获取时间范围
    const { data: rangeData } = await client
      .from('refund_records')
      .select('refund_complete_time')
      .eq('store_system', store_system)
      .eq('after_sale_status', '已退款')
      .not('refund_complete_time', 'is', null)
      .order('refund_complete_time', { ascending: true })
      .limit(1);

    const { data: rangeDataEnd } = await client
      .from('refund_records')
      .select('refund_complete_time')
      .eq('store_system', store_system)
      .eq('after_sale_status', '已退款')
      .not('refund_complete_time', 'is', null)
      .order('refund_complete_time', { ascending: false })
      .limit(1);

    // 自动补全门店ID（刷新时重新计算）
    console.log(`[退款查询] 开始补全 ${data?.length || 0} 条记录的门店ID`);
    const orderIdToStoreIdMap = await buildOrderIdToStoreIdMap(client, store_system);

    let autoCompletedCount = 0;
    const completedRecords = (data || []).map(refund => {
      // 如果已经有store_id，直接使用
      if (refund.store_id) {
        return refund;
      }

      // 如果没有store_id但有order_id，通过订单ID查找store_id
      if (refund.order_id) {
        const storeIdFromOrder = orderIdToStoreIdMap.get(refund.order_id);
        if (storeIdFromOrder) {
          autoCompletedCount++;
          console.log(`[退款查询] 自动补全: 订单 ${refund.order_id} -> 门店 ${storeIdFromOrder}`);
          return { ...refund, store_id: storeIdFromOrder };
        }
      }

      return refund;
    });

    console.log(`[退款查询] 自动补全了 ${autoCompletedCount} 条记录的门店ID`);

    return NextResponse.json({
      success: true,
      data: {
        records: completedRecords,
        totalCount: completedRecords.length,
        autoCompletedCount,
        minTime: rangeData?.[0]?.refund_complete_time || null,
        maxTime: rangeDataEnd?.[0]?.refund_complete_time || null,
      }
    });
  } catch (error) {
    console.error('获取退款数据失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '查询失败' },
      { status: 500 }
    );
  }
}

// 删除退款数据
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
      .from('refund_records')
      .select('*', { count: 'exact', head: true })
      .eq('store_system', store_system);

    // 删除该门店体系的退款数据
    const { error } = await client
      .from('refund_records')
      .delete()
      .eq('store_system', store_system);

    if (error) {
      throw new Error(`删除失败: ${error.message}`);
    }

    console.log(`[退款删除] 门店体系: ${store_system}, 删除 ${count} 条记录`);

    return NextResponse.json({
      success: true,
      data: { deletedCount: count || 0 }
    });
  } catch (error) {
    console.error('删除退款数据失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '删除失败' },
      { status: 500 }
    );
  }
}
