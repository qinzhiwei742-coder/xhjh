import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 上传核销数据到数据库
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

    console.log(`[核销上传] 门店体系: ${store_system}, 记录数: ${records.length}`);

    // 先删除该门店体系的旧核销数据
    const { error: deleteError } = await client
      .from('verify_records')
      .delete()
      .eq('store_system', store_system);

    if (deleteError) {
      console.error('删除旧核销数据失败:', deleteError);
    }

    // 计算时间范围
    let minTime: string | null = null;
    let maxTime: string | null = null;

    // 转换并插入新数据
    const insertData = records.map((record: any) => {
      const verifyTime = record.verifyTime || record.verify_time || record.核销时间 || null;
      if (verifyTime && (!minTime || verifyTime < minTime)) minTime = verifyTime;
      if (verifyTime && (!maxTime || verifyTime > maxTime)) maxTime = verifyTime;

      return {
        store_system,
        store_id: record.storeId || record.store_id || record.门店ID || null,
        store_name: record.storeName || record.store_name || record.门店名称 || null,
        verify_id: record.verifyId || record.verify_id || record.核销ID || null,
        verify_time: verifyTime,
        // Excel中的核销金额单位是"元"，无需转换
        order_actual_amount: parseFloat(record.verifyAmount || record.verify_amount || record.核销金额 || 0) || 0,
        channel: record.channel || record.渠道 || null,
        product_name: record.productName || record.product_name || record.商品名称 || null,
      };
    });

    const { data, error } = await client
      .from('verify_records')
      .insert(insertData)
      .select();

    if (error) {
      console.error('插入核销数据失败:', error);
      throw new Error(`插入失败: ${error.message}`);
    }

    // 记录上传历史
    await client.from('data_upload_history').insert({
      store_system,
      file_type: 'verify',
      file_name: file_name || '核销数据',
      record_count: records.length,
      min_time: minTime,
      max_time: maxTime,
    });

    console.log(`[核销上传] 完成，插入 ${data?.length || 0} 条记录，时间范围: ${minTime} ~ ${maxTime}`);

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
    console.error('上传核销数据失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '上传失败' },
      { status: 500 }
    );
  }
}

// 获取核销数据
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
      // 使用分页查询获取所有核销数据（Supabase 默认限制 1000 条/页）
      const allData: any[] = [];
      const pageSize = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        let query = client.from('verify_records')
          .select('*')
          .eq('store_system', store_system)
          .range(from, to);

        if (store_id) {
          query = query.eq('store_id', store_id);
        }
        if (time_start) {
          query = query.gte('verify_time', time_start);
        }
        if (time_end) {
          query = query.lte('verify_time', time_end);
        }

        const { data, error } = await query;
        if (error) throw new Error(`查询核销数据失败: ${error.message}`);

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

      console.log(`[核销聚合查询] 分页查询完成，共获取 ${allData.length} 条记录`);
      const data = allData;

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

      // 计算聚合数据
      const storeStats: Record<string, {
        totalVerifyCount: number;
        totalVerifyAmount: number;
        dailyStats: Record<string, any>;
        channelStats: Record<string, number>;
      }> = {};

      const unmatchedDailyStats: Record<string, any> = {};
      const unmatchedTotal = {
        verifyCount: 0,
        verifyAmount: 0,
        fakeVerifyCount: 0,  // 刷单核销数（核销金额 ≤ 10元，包含10元）
        validVerifyCount: 0, // 有效核销数（核销金额 > 10元，不包含10元）
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

      let matchedCount = 0;
      let totalRecords = 0;
      let minTime = '';
      let maxTime = '';

      for (const verify of data || []) {
        // 只统计已核销的记录，排除已撤销核销和核销后退款
        if (verify.status !== '已核销') {
          continue;
        }

        totalRecords++;

        const verifyTime = verify.verify_time || '';
        // order_actual_amount 存储的是"元"，直接使用
        const verifyAmount = parseFloat(verify.order_actual_amount || '0') || 0;
        // 提取日期部分 YYYY-MM-DD（处理多种格式）
        const verifyDate = verifyTime ? verifyTime.substring(0, 10) : '';
        const channel = verify.channel || '未知';

        // 判断是否刷单核销（核销金额 <= 10元）
        const isFake = verifyAmount <= 10;

        if (verifyDate) {
          if (!minTime || verifyDate < minTime) minTime = verifyDate;
          if (!maxTime || verifyDate > maxTime) maxTime = verifyDate;
        }

        // 判断是否匹配门店（store_id 存在且在 stores 表中）
        const storeIdStr = verify.store_id ? String(verify.store_id) : null;
        const isMatched = storeIdStr && validStoreIds.has(storeIdStr);

        if (isMatched) {
          matchedCount++;
          if (!storeStats[storeIdStr]) {
            storeStats[storeIdStr] = {
              totalVerifyCount: 0,
              totalVerifyAmount: 0,
              dailyStats: {},
              channelStats: {},
            };
          }

          const stats = storeStats[storeIdStr];
          stats.totalVerifyCount++;
          stats.totalVerifyAmount += verifyAmount;

          // 渠道统计
          stats.channelStats[channel] = (stats.channelStats[channel] || 0) + 1;

          // 按日统计
          if (verifyDate) {
            if (!stats.dailyStats[verifyDate]) {
              stats.dailyStats[verifyDate] = {
                verifyCount: 0,
                verifyAmount: 0,
                fakeVerifyCount: 0,
                validVerifyCount: 0,
                fakeVerifyAmount: 0,
                validVerifyAmount: 0,
                channelStats: {},
              };
            }
            const daily = stats.dailyStats[verifyDate];
            daily.verifyCount++;
            daily.verifyAmount += verifyAmount;
            if (isFake) {
              daily.fakeVerifyCount++;
              daily.fakeVerifyAmount += verifyAmount;
            } else {
              daily.validVerifyCount++;
              daily.validVerifyAmount += verifyAmount;
            }
            daily.channelStats[channel] = (daily.channelStats[channel] || 0) + 1;
          }
        } else {
          // 未匹配核销（store_id 为空或不在 stores 表中）
          const reason = !storeIdStr ? '门店ID为空' : '门店ID不在系统中';

          unmatchedTotal.verifyCount++;
          unmatchedTotal.verifyAmount += verifyAmount;

          if (isFake) {
            unmatchedTotal.fakeVerifyCount++;
          } else {
            unmatchedTotal.validVerifyCount++;
          }

          // 保存未匹配核销详情（最多保存100条）
          if (unmatchedVerifyDetails.length < 100) {
            unmatchedVerifyDetails.push({
              verifyId: verify.verify_id || verify.id || '',
              storeId: storeIdStr,
              reason,
              verifyTime: verify.verify_time || '',
              verifyCount: 1,
              verifyAmount,
            });
          }

          if (verifyDate) {
            if (!unmatchedDailyStats[verifyDate]) {
              unmatchedDailyStats[verifyDate] = {
                verifyCount: 0,
                verifyAmount: 0,
                fakeVerifyCount: 0,
                validVerifyCount: 0,
                fakeVerifyAmount: 0,
                validVerifyAmount: 0,
              };
            }
            const daily = unmatchedDailyStats[verifyDate];
            daily.verifyCount++;
            daily.verifyAmount += verifyAmount;
            if (isFake) {
              daily.fakeVerifyCount++;
              daily.fakeVerifyAmount += verifyAmount;
            } else {
              daily.validVerifyCount++;
              daily.validVerifyAmount += verifyAmount;
            }
          }
        }
      }

      // ========== 计算全局渠道统计 ==========
      const globalChannelStats: Record<string, number> = {};
      const globalDailyChannelStats: Record<string, Record<string, number>> = {};
      const globalValidChannelStats: Record<string, number> = {};
      const globalDailyValidChannelStats: Record<string, Record<string, number>> = {};

      for (const verify of data || []) {
        // 只统计已核销的记录
        if (verify.status !== '已核销') {
          continue;
        }

        const verifyTime = verify.verify_time || '';
        // order_actual_amount 存储的是"元"，无需转换
        const verifyAmount = parseFloat(verify.order_actual_amount || '0') || 0;
        const verifyDate = verifyTime ? verifyTime.substring(0, 10) : '';
        const channel = verify.channel || '未知';

        const isFake = verifyAmount <= 10;

        // 累计渠道统计
        globalChannelStats[channel] = (globalChannelStats[channel] || 0) + 1;

        // 按日渠道统计
        if (verifyDate) {
          if (!globalDailyChannelStats[verifyDate]) {
            globalDailyChannelStats[verifyDate] = {};
          }
          globalDailyChannelStats[verifyDate][channel] = (globalDailyChannelStats[verifyDate][channel] || 0) + 1;

          // 有效核销渠道统计（核销金额 > 10元）
          if (!isFake) {
            globalValidChannelStats[channel] = (globalValidChannelStats[channel] || 0) + 1;

            if (!globalDailyValidChannelStats[verifyDate]) {
              globalDailyValidChannelStats[verifyDate] = {};
            }
            globalDailyValidChannelStats[verifyDate][channel] = (globalDailyValidChannelStats[verifyDate][channel] || 0) + 1;
          }
        }
      }

      // ========== 计算全局套餐统计（基于商品名称）==========
      const globalPackageStats: Record<string, number> = {};
      const globalDailyPackageStats: Record<string, Record<string, number>> = {};
      const globalValidPackageStats: Record<string, number> = {};
      const globalDailyValidPackageStats: Record<string, Record<string, number>> = {};
      // 新增：套餐金额统计
      const globalPackageAmountStats: Record<string, number> = {};
      const globalDailyPackageAmountStats: Record<string, Record<string, number>> = {};
      const globalValidPackageAmountStats: Record<string, number> = {};
      const globalDailyValidPackageAmountStats: Record<string, Record<string, number>> = {};

      for (const verify of data || []) {
        // 只统计已核销的记录
        if (verify.status !== '已核销') {
          continue;
        }

        const verifyTime = verify.verify_time || '';
        // order_actual_amount 存储的是"元"，无需转换
        const verifyAmount = parseFloat(verify.order_actual_amount || '0') || 0;
        const verifyDate = verifyTime ? verifyTime.substring(0, 10) : '';
        const packageName = verify.product_name || '未知';

        const isFake = verifyAmount <= 10;

        // 累计套餐统计
        globalPackageStats[packageName] = (globalPackageStats[packageName] || 0) + 1;
        globalPackageAmountStats[packageName] = (globalPackageAmountStats[packageName] || 0) + verifyAmount;

        // 按日套餐统计
        if (verifyDate) {
          if (!globalDailyPackageStats[verifyDate]) {
            globalDailyPackageStats[verifyDate] = {};
          }
          if (!globalDailyPackageAmountStats[verifyDate]) {
            globalDailyPackageAmountStats[verifyDate] = {};
          }
          globalDailyPackageStats[verifyDate][packageName] = (globalDailyPackageStats[verifyDate][packageName] || 0) + 1;
          globalDailyPackageAmountStats[verifyDate][packageName] = (globalDailyPackageAmountStats[verifyDate][packageName] || 0) + verifyAmount;

          // 有效核销套餐统计（核销金额 > 10元）
          if (!isFake) {
            globalValidPackageStats[packageName] = (globalValidPackageStats[packageName] || 0) + 1;
            globalValidPackageAmountStats[packageName] = (globalValidPackageAmountStats[packageName] || 0) + verifyAmount;

            if (!globalDailyValidPackageStats[verifyDate]) {
              globalDailyValidPackageStats[verifyDate] = {};
            }
            if (!globalDailyValidPackageAmountStats[verifyDate]) {
              globalDailyValidPackageAmountStats[verifyDate] = {};
            }
            globalDailyValidPackageStats[verifyDate][packageName] = (globalDailyValidPackageStats[verifyDate][packageName] || 0) + 1;
            globalDailyValidPackageAmountStats[verifyDate][packageName] = (globalDailyValidPackageAmountStats[verifyDate][packageName] || 0) + verifyAmount;
          }
        }
      }

      return NextResponse.json({
        success: true,
        storeStats,
        timeRange: { minTime, maxTime },
        stats: { totalRecords, matchedRecords: matchedCount, unmatchedRecords: totalRecords - matchedCount },
        unmatchedDailyStats,
        unmatchedTotal,
        unmatchedVerifyDetails, // 添加未匹配核销详情
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
    let query = client.from('verify_records').select('*').eq('store_system', store_system);

    if (store_id) {
      query = query.eq('store_id', store_id);
    }

    if (time_start) {
      query = query.gte('verify_time', time_start);
    }

    if (time_end) {
      query = query.lte('verify_time', time_end);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询失败: ${error.message}`);
    }

    // 获取时间范围
    const { data: rangeData } = await client
      .from('verify_records')
      .select('verify_time')
      .eq('store_system', store_system)
      .not('verify_time', 'is', null)
      .order('verify_time', { ascending: true })
      .limit(1);

    const { data: rangeDataEnd } = await client
      .from('verify_records')
      .select('verify_time')
      .eq('store_system', store_system)
      .not('verify_time', 'is', null)
      .order('verify_time', { ascending: false })
      .limit(1);

    return NextResponse.json({
      success: true,
      data: {
        records: data || [],
        totalCount: data?.length || 0,
        minTime: rangeData?.[0]?.verify_time || null,
        maxTime: rangeDataEnd?.[0]?.verify_time || null,
      }
    });
  } catch (error) {
    console.error('获取核销数据失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '查询失败' },
      { status: 500 }
    );
  }
}

// 删除核销数据
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
      .from('verify_records')
      .select('*', { count: 'exact', head: true })
      .eq('store_system', store_system);

    // 删除该门店体系的核销数据
    const { error } = await client
      .from('verify_records')
      .delete()
      .eq('store_system', store_system);

    if (error) {
      throw new Error(`删除失败: ${error.message}`);
    }

    console.log(`[核销删除] 门店体系: ${store_system}, 删除 ${count} 条记录`);

    return NextResponse.json({
      success: true,
      data: { deletedCount: count || 0 }
    });
  } catch (error) {
    console.error('删除核销数据失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '删除失败' },
      { status: 500 }
    );
  }
}
