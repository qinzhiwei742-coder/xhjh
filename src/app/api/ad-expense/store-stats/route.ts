import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取门店维度的广告费统计（聚合格式，与订单/核销/退款 API 一致）
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const store_system = searchParams.get('store_system');
    const store_id = searchParams.get('store_id');

    if (!store_system) {
      return NextResponse.json(
        { success: false, error: '缺少store_system参数' },
        { status: 400 }
      );
    }

    // 使用分页查询获取所有广告费数据（Supabase 默认限制 1000 条/页）
    const allData: any[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      let query = client.from('ad_expense_records')
        .select('*')
        .eq('store_system', store_system)
        .range(from, to);

      if (store_id) {
        query = query.eq('store_id', store_id);
      }

      const { data, error } = await query;
      if (error) throw new Error(`查询广告费数据失败: ${error.message}`);

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

    console.log(`[广告费聚合查询] 分页查询完成，共获取 ${allData.length} 条记录`);

    // 获取所有门店的 store_id 列表（用于验证广告费记录的 store_id 是否真实存在）
    const { data: storesData, error: storesError } = await client
      .from('stores')
      .select('store_id')
      .eq('store_system', store_system);

    if (storesError) {
      console.error('[广告费聚合查询] 获取门店列表失败:', storesError);
      return NextResponse.json(
        { success: false, error: '获取门店列表失败' },
        { status: 500 }
      );
    }

    const validStoreIds = new Set(storesData?.map(s => s.store_id) || []);
    console.log(`[广告费聚合查询] 获取到 ${validStoreIds.size} 个门店的 store_id`);

    // 按门店ID分组统计（聚合格式）
    const storeStats: Record<string, {
      totalSpend: number;
      totalOrders: number;
      dailyStats: Record<string, { spend: number; orders: number }>;
    }> = {};

    // 未匹配数据统计
    const unmatchedDailyStats: Record<string, { spend: number; orders: number }> = {};
    let unmatchedTotal = { spend: 0, orders: 0 };
    let matchedRecords = 0;
    let unmatchedRecords = 0;

    // 按账户统计
    const accounts: Record<number, {
      totalSpend: number;
      totalOrders: number;
      totalRecords: number;
      minTime: string | null;
      maxTime: string | null;
    }> = {};
    for (let i = 0; i < 4; i++) {
      accounts[i] = { totalSpend: 0, totalOrders: 0, totalRecords: 0, minTime: null, maxTime: null };
    }

    let minTime = '';
    let maxTime = '';
    let totalRecords = 0;

    for (const record of allData) {
      totalRecords++;
      const sid = record.store_id;
      const spend = parseFloat(String(record.spend || 0)); // 数据库中存储的已经是元，无需转换
      const orders = parseInt(String(record.orders || 0));
      const recordDate = record.record_date ? String(record.record_date).substring(0, 10) : null;
      const accountIndex = record.account_index || 0;

      // 按门店分组（检查 store_id 是否真实存在）
      if (sid && validStoreIds.has(sid)) {
        // store_id 存在且在门店列表中 → 已匹配
        matchedRecords++;
        if (!storeStats[sid]) {
          storeStats[sid] = { totalSpend: 0, totalOrders: 0, dailyStats: {} };
        }
        storeStats[sid].totalSpend += spend;
        storeStats[sid].totalOrders += orders;

        if (recordDate) {
          if (!storeStats[sid].dailyStats[recordDate]) {
            storeStats[sid].dailyStats[recordDate] = { spend: 0, orders: 0 };
          }
          storeStats[sid].dailyStats[recordDate].spend += spend;
          storeStats[sid].dailyStats[recordDate].orders += orders;
        }
      } else {
        // store_id 为空 或 store_id 不在门店列表中 → 未匹配
        unmatchedRecords++;
        unmatchedTotal.spend += spend;
        unmatchedTotal.orders += orders;

        if (recordDate) {
          if (!unmatchedDailyStats[recordDate]) {
            unmatchedDailyStats[recordDate] = { spend: 0, orders: 0 };
          }
          unmatchedDailyStats[recordDate].spend += spend;
          unmatchedDailyStats[recordDate].orders += orders;
        }
      }

      // 按账户统计
      if (accounts[accountIndex]) {
        accounts[accountIndex].totalSpend += spend;
        accounts[accountIndex].totalOrders += orders;
        accounts[accountIndex].totalRecords++;
        if (recordDate) {
          if (!accounts[accountIndex].minTime || recordDate < accounts[accountIndex].minTime!) {
            accounts[accountIndex].minTime = recordDate;
          }
          if (!accounts[accountIndex].maxTime || recordDate > accounts[accountIndex].maxTime!) {
            accounts[accountIndex].maxTime = recordDate;
          }
        }
      }

      // 时间范围
      if (recordDate) {
        if (!minTime || recordDate < minTime) minTime = recordDate;
        if (!maxTime || recordDate > maxTime) maxTime = recordDate;
      }
    }

    // 计算总投入
    let totalSpend = 0;
    let totalOrders = 0;
    Object.values(storeStats).forEach(stats => {
      totalSpend += stats.totalSpend;
      totalOrders += stats.totalOrders;
    });

    return NextResponse.json({
      success: true,
      storeStats,
      timeRange: { minTime, maxTime },
      stats: {
        totalRecords,
        matchedRecords,
        unmatchedRecords,
        totalSpend,
        totalOrders,
      },
      accounts,
      unmatchedDailyStats,
      unmatchedTotal,
    });
  } catch (error) {
    console.error('获取门店广告费统计失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取失败' },
      { status: 500 }
    );
  }
}
