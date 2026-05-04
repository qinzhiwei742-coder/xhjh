import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 订单按日统计
interface DailyOrderStats {
  orderCount: number;           // 订单数（购买数量之和）
  fakeOrderCount: number;       // 刷单数（订单实收 ≤ 10元，包含10元）
  validOrderCount: number;      // 有效订单数（订单实收 > 10元，不包含10元）
  fakeOrderAmount: number;      // 刷单金额
  validOrderAmount: number;     // 有效订单金额
  orderAmount: number;          // 订单金额
  refundCount: number;          // 退款数（无退款文件时从订单统计）
  refundAmount: number;         // 退款金额（无退款文件时从订单统计）
  sameDayRefundCount: number;   // 当天退款数
  sameDayRefundAmount: number;  // 当天退款金额
  unverifiedCount: number;      // 未核销数
  unverifiedAmount: number;     // 未核销金额
  // 渠道统计
  channelStats: Record<string, number>;  // 渠道名称 -> 订单数
  // 套餐统计
  packageStats: Record<string, number>;      // 套餐名 -> 数量
  packageAmountStats: Record<string, number>; // 套餐名 -> 金额
}

// 门店订单统计
interface StoreOrderStats {
  totalOrderCount: number;
  totalFakeOrderCount: number;       // 刷单数（订单实收 ≤ 10元，包含10元）
  totalValidOrderCount: number;      // 有效订单数（订单实收 > 10元，不包含10元）
  totalFakeOrderAmount: number;
  totalValidOrderAmount: number;
  totalOrderAmount: number;
  totalRefundCount: number;       // 无退款文件时使用
  totalRefundAmount: number;       // 无退款文件时使用
  totalSameDayRefundCount: number;
  totalSameDayRefundAmount: number;
  totalUnverifiedCount: number;
  totalUnverifiedAmount: number;
  dailyStats: Record<string, DailyOrderStats>;
  // 订单ID到门店ID的映射（用于退款文件关联）
  orderIdToStoreId: Record<string, string>;
  // 渠道统计
  channelStats: Record<string, number>;  // 渠道名称 -> 订单数
  // 套餐统计
  packageStats: Record<string, number>;      // 套餐名 -> 数量
  packageAmountStats: Record<string, number>; // 套餐名 -> 金额
}

// 未匹配订单按日统计
interface UnmatchedDailyStats extends DailyOrderStats {}

// 未匹配订单详情
interface UnmatchedOrderDetail {
  orderId: string;              // 订单ID
  storeId: string | null;       // 门店ID（可能为空）
  reason: string;               // 未匹配原因
  payTime: string;              // 支付时间
  quantity: number;             // 购买数量
  amount: number;               // 顾客实付金额
  orderAmount: number;          // 订单实收
  orderStatus: string;          // 订单状态
}

// 未匹配门店ID统计（用于诊断）
interface UnmatchedStoreIdStats {
  storeId: string;              // 门店ID
  orderCount: number;          // 订单数量
  totalAmount: number;          // 总金额
  reason: string;               // 未匹配原因
}

// 聚合结果
interface AggregatedResult {
  storeStats: Record<string, StoreOrderStats>;
  timeRange: {
    minTime: string;
    maxTime: string;
  };
  stats: {
    totalRecords: number;
    matchedRecords: number;
    unmatchedRecords: number;
  };
  // 未匹配数据统计
  unmatchedDailyStats: Record<string, UnmatchedDailyStats>;
  unmatchedTotal: {
    orderCount: number;
    fakeOrderCount: number;       // 刷单数（订单实收 ≤ 10元，包含10元）
    validOrderCount: number;      // 有效订单数（订单实收 > 10元，不包含10元）
    fakeOrderAmount: number;
    validOrderAmount: number;
    orderAmount: number;
    refundCount: number;
    refundAmount: number;
    sameDayRefundCount: number;
    sameDayRefundAmount: number;
    unverifiedCount: number;
    unverifiedAmount: number;
  };
  // 未匹配订单详情
  unmatchedOrderDetails: UnmatchedOrderDetail[];
  // 未匹配门店ID统计（新增，用于诊断）
  unmatchedStoreIdStats: UnmatchedStoreIdStats[];
  // 订单ID映射（用于退款文件关联）
  orderMapping: Record<string, string>;
  // 渠道统计（全部数据）
  channelStats: Record<string, number>;  // 渠道名称 -> 订单数
  // 按日渠道统计（用于时间筛选）
  dailyChannelStats: Record<string, Record<string, number>>;  // 日期 -> 渠道名称 -> 订单数
  // 有效订单渠道统计（订单实收 > 10元）
  validChannelStats: Record<string, number>;  // 渠道名称 -> 有效订单数
  // 按日有效渠道统计
  dailyValidChannelStats: Record<string, Record<string, number>>;  // 日期 -> 渠道名称 -> 有效订单数
}

// 辅助函数：判断是否当天退款
const isSameDayRefund = (refundTime: string, payTime: string): boolean => {
  if (!refundTime || !payTime) return false;
  try {
    const refundDate = new Date(refundTime);
    const payDate = new Date(payTime);
    const hoursDiff = (refundDate.getTime() - payDate.getTime()) / (1000 * 60 * 60);
    return hoursDiff <= 24;
  } catch {
    return false;
  }
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const storeIdSetStr = formData.get('storeIdSet') as string;
    const storeSystem = formData.get('storeSystem') as string || 'unknown';
    
    if (!file) {
      return NextResponse.json({ error: '文件未上传' }, { status: 400 });
    }

    // 门店ID集合
    const storeIdSet = new Set<string>(storeIdSetStr ? JSON.parse(storeIdSetStr) : []);
    
    // 读取文件
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null, blankrows: false }) as Record<string, unknown>[];
    
    console.log(`[订单文件解析] 总记录数: ${jsonData.length}`);
    
    // 聚合结果
    const storeStats: Record<string, StoreOrderStats> = {};
    const unmatchedDailyStats: Record<string, UnmatchedDailyStats> = {};
    const orderMapping: Record<string, string> = {};
    const unmatchedOrderDetails: UnmatchedOrderDetail[] = [];
    // 未匹配门店ID统计（用于诊断哪些门店ID未匹配）
    const unmatchedStoreIdCount: Record<string, { orderCount: number; totalAmount: number; reason: string }> = {};
    let minTime = '';
    let maxTime = '';
    let matchedCount = 0;
    
    // 未匹配总计
    let unmatchedOrderCount = 0;
    let unmatchedFakeOrderCount = 0;
    let unmatchedValidOrderCount = 0;
    let unmatchedFakeOrderAmount = 0;
    let unmatchedValidOrderAmount = 0;
    let unmatchedOrderAmount = 0;
    let unmatchedRefundCount = 0;
    let unmatchedRefundAmount = 0;
    let unmatchedSameDayRefundCount = 0;
    let unmatchedSameDayRefundAmount = 0;
    let unmatchedUnverifiedCount = 0;
    let unmatchedUnverifiedAmount = 0;
    
    // 辅助函数：添加到日期统计
    const addToDailyStats = (
      dailyStats: Record<string, DailyOrderStats>,
      date: string,
      stats: Partial<DailyOrderStats>,
      orderQuantity: number
    ) => {
      if (!date) return;
      if (!dailyStats[date]) {
        dailyStats[date] = {
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
          packageStats: {},
          packageAmountStats: {}
        };
      }
      for (const key of Object.keys(stats) as (keyof DailyOrderStats)[]) {
        if (key !== 'channelStats' && key !== 'packageStats' && key !== 'packageAmountStats') {
          dailyStats[date][key] += stats[key] || 0;
        }
      }
    };
    
    // 渠道统计变量
    const channelStats: Record<string, number> = {};
    // 按日渠道统计
    const dailyChannelStats: Record<string, Record<string, number>> = {};
    // 有效订单渠道统计（订单实收 > 10元）
    const validChannelStats: Record<string, number> = {};
    // 按日有效渠道统计
    const dailyValidChannelStats: Record<string, Record<string, number>> = {};
    
    // 处理每条记录
    for (const row of jsonData) {
      const orderId = String(row['订单 ID'] || row['订单ID'] || '');
      const storeId = String(row['意向门店ID'] || '').trim();
      const payTime = String(row['支付时间'] || '');
      const quantity = Number(row['购买数量']) || 1;
      const amount = Number(row['顾客实付金额']) || 0;
      const orderAmount = Number(row['订单实收']) || 0;
      const orderStatus = String(row['订单状态'] || '');
      const refundTime = String(row['售后完成时间'] || row['退款审核完成时间'] || '');
      const channel = String(row['成交渠道'] || '未知');
      const packageName = String(row['商品名称'] || '').trim();  // 商品名称作为套餐名

      // 提取日期
      const payDate = payTime ? payTime.split(' ')[0] : '';
      
      // 更新时间范围
      if (payDate) {
        if (!minTime || payDate < minTime) minTime = payDate;
        if (!maxTime || payDate > maxTime) maxTime = payDate;
      }
      
      // 计算各项指标
      const isFake = orderAmount <= 10;  // 刷单数：订单实收 ≤ 10元（包含10元）
      const isRefund = orderStatus === '未使用取消';
      const isUnverified = orderStatus === '待使用';
      const isCompleted = orderStatus === '已完成';  // 已完成订单
      const isSameDay = isRefund && isSameDayRefund(refundTime, payTime);

      // 有效订单定义：订单实收 > 10元 且 订单状态为"已完成"
      const isValid = !isFake && isCompleted;
      
      // 统计数据
      const stats: Partial<DailyOrderStats> = {
        orderCount: quantity,
        fakeOrderCount: isFake ? quantity : 0,
        validOrderCount: isValid ? quantity : 0,  // 有效订单数：订单实收 > 10元且已完成
        fakeOrderAmount: isFake ? orderAmount : 0,
        validOrderAmount: isValid ? orderAmount : 0,  // 有效订单金额
        orderAmount: orderAmount,
        refundCount: isRefund ? quantity : 0,
        refundAmount: isRefund ? orderAmount : 0,  // 退款金额：订单状态为'未使用取消'时，取订单实收
        sameDayRefundCount: isSameDay ? quantity : 0,
        sameDayRefundAmount: isSameDay ? orderAmount : 0,  // 当天退款金额
        unverifiedCount: isUnverified ? quantity : 0,
        unverifiedAmount: isUnverified ? orderAmount : 0
      };
      
      // 保存订单ID映射
      if (orderId && storeId) {
        orderMapping[orderId] = storeId;
      }
      
      // 判断是否匹配门店
      const isMatched = storeId && storeIdSet.has(storeId);
      
      if (isMatched) {
        matchedCount++;
        
        if (!storeStats[storeId]) {
          storeStats[storeId] = {
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
            packageStats: {},
            packageAmountStats: {}
          };
        }
        
        // 累加总数
        storeStats[storeId].totalOrderCount += quantity;
        storeStats[storeId].totalFakeOrderCount += isFake ? quantity : 0;
        storeStats[storeId].totalValidOrderCount += !isFake ? quantity : 0;
        storeStats[storeId].totalFakeOrderAmount += isFake ? orderAmount : 0;
        storeStats[storeId].totalValidOrderAmount += !isFake ? orderAmount : 0;
        storeStats[storeId].totalOrderAmount += orderAmount;
        storeStats[storeId].totalRefundCount += isRefund ? quantity : 0;
        storeStats[storeId].totalRefundAmount += isRefund ? orderAmount : 0;
        storeStats[storeId].totalSameDayRefundCount += isSameDay ? quantity : 0;
        storeStats[storeId].totalSameDayRefundAmount += isSameDay ? orderAmount : 0;
        storeStats[storeId].totalUnverifiedCount += isUnverified ? quantity : 0;
        storeStats[storeId].totalUnverifiedAmount += isUnverified ? orderAmount : 0;

        // 累加套餐统计
        if (packageName && packageName !== '') {
          if (!storeStats[storeId].packageStats[packageName]) {
            storeStats[storeId].packageStats[packageName] = 0;
          }
          storeStats[storeId].packageStats[packageName] += quantity;

          if (!storeStats[storeId].packageAmountStats[packageName]) {
            storeStats[storeId].packageAmountStats[packageName] = 0;
          }
          storeStats[storeId].packageAmountStats[packageName] += orderAmount;
        }
        
        // 按日统计
        addToDailyStats(storeStats[storeId].dailyStats, payDate, stats, quantity);

        // 累加套餐统计到日数据
        if (packageName && packageName !== '') {
          const dailyData = storeStats[storeId].dailyStats[payDate];
          if (dailyData) {
            if (!dailyData.packageStats[packageName]) {
              dailyData.packageStats[packageName] = 0;
            }
            dailyData.packageStats[packageName] += quantity;

            if (!dailyData.packageAmountStats[packageName]) {
              dailyData.packageAmountStats[packageName] = 0;
            }
            dailyData.packageAmountStats[packageName] += orderAmount;
          }
        }

        // 保存订单映射
        if (orderId) {
          storeStats[storeId].orderIdToStoreId[orderId] = storeId;
        }
        
        // 更新渠道统计
        if (!storeStats[storeId].channelStats[channel]) {
          storeStats[storeId].channelStats[channel] = 0;
        }
        storeStats[storeId].channelStats[channel] += quantity;
        
        // 更新全局渠道统计
        if (!channelStats[channel]) {
          channelStats[channel] = 0;
        }
        channelStats[channel] += quantity;

        // 更新按日渠道统计
        if (!dailyChannelStats[payDate]) {
          dailyChannelStats[payDate] = {};
        }
        if (!dailyChannelStats[payDate][channel]) {
          dailyChannelStats[payDate][channel] = 0;
        }
        dailyChannelStats[payDate][channel] += quantity;

        // 更新有效订单渠道统计（订单实收 > 10元）
        if (!isFake) {
          if (!validChannelStats[channel]) {
            validChannelStats[channel] = 0;
          }
          validChannelStats[channel] += quantity;

          // 更新按日有效渠道统计
          if (!dailyValidChannelStats[payDate]) {
            dailyValidChannelStats[payDate] = {};
          }
          if (!dailyValidChannelStats[payDate][channel]) {
            dailyValidChannelStats[payDate][channel] = 0;
          }
          dailyValidChannelStats[payDate][channel] += quantity;
        }
      } else {
        // 未匹配
        const reason = !storeId ? '门店ID为空' : '门店ID不在系统中';
        
        unmatchedOrderCount += quantity;
        unmatchedFakeOrderCount += isFake ? quantity : 0;
        unmatchedValidOrderCount += !isFake ? quantity : 0;
        unmatchedFakeOrderAmount += isFake ? orderAmount : 0;
        unmatchedValidOrderAmount += !isFake ? orderAmount : 0;
        unmatchedOrderAmount += orderAmount;
        unmatchedRefundCount += isRefund ? quantity : 0;
        unmatchedRefundAmount += isRefund ? orderAmount : 0;
        unmatchedSameDayRefundCount += isSameDay ? quantity : 0;
        unmatchedSameDayRefundAmount += isSameDay ? orderAmount : 0;
        unmatchedUnverifiedCount += isUnverified ? quantity : 0;
        unmatchedUnverifiedAmount += isUnverified ? orderAmount : 0;
        
        addToDailyStats(unmatchedDailyStats, payDate, stats, quantity);
        
        // 统计未匹配门店ID（用于诊断）
        const unmatchedId = storeId || '__EMPTY__';
        if (!unmatchedStoreIdCount[unmatchedId]) {
          unmatchedStoreIdCount[unmatchedId] = { orderCount: 0, totalAmount: 0, reason };
        }
        unmatchedStoreIdCount[unmatchedId].orderCount += quantity;
        unmatchedStoreIdCount[unmatchedId].totalAmount += orderAmount;
        
        // 保存未匹配订单详情（最多保存100条）
        if (unmatchedOrderDetails.length < 100) {
          unmatchedOrderDetails.push({
            orderId,
            storeId: storeId || null,
            reason,
            payTime,
            quantity,
            amount,
            orderAmount,
            orderStatus
          });
        }
      }
    }
    
    // 构建未匹配门店ID统计结果
    const unmatchedStoreIdStats: UnmatchedStoreIdStats[] = Object.entries(unmatchedStoreIdCount)
      .map(([storeId, data]) => ({
        storeId: storeId === '__EMPTY__' ? '' : storeId,
        orderCount: data.orderCount,
        totalAmount: data.totalAmount,
        reason: data.reason
      }))
      .sort((a, b) => b.orderCount - a.orderCount); // 按订单数降序排列
    
    console.log(`[订单文件解析] 完成: 匹配${matchedCount}/${jsonData.length}条, 门店数${Object.keys(storeStats).length}, 未匹配门店ID统计: ${JSON.stringify(unmatchedStoreIdStats)}`);

    // 转换数据用于数据库插入（需要提前定义，因为fullResult中需要使用）
    const insertData = jsonData.map((row) => {
      const orderId = String(row['订单 ID'] || row['订单ID'] || '');
      const storeId = String(row['意向门店ID'] || '').trim();
      const payTime = String(row['支付时间'] || '');
      const quantity = Number(row['购买数量']) || 1;
      const amount = Number(row['顾客实付金额']) || 0;
      const orderAmount = Number(row['订单实收']) || 0;
      const channel = String(row['成交渠道'] || '未知');
      const orderStatus = String(row['订单状态'] || '');
      const productName = String(row['商品名称'] || '');

      return {
        store_id: storeId || null,
        order_id: orderId || null,
        order_time: payTime || null,
        order_amount: orderAmount,
        actual_amount: amount,
        quantity: quantity,
        channel: channel,
        order_status: orderStatus || null,
        product_name: productName || null,
        store_system: storeSystem
      };
    });

    // ========== 返回完整结果（包含详细的聚合数据）==========
    const fullResult = {
      success: true,
      storeSystem,
      fileName: file.name,
      recordCount: insertData.length,
      timeRange: { minTime, maxTime },
      stats: {
        totalRecords: jsonData.length,
        matchedRecords: matchedCount,
        unmatchedRecords: jsonData.length - matchedCount
      },
      // 详细的统计数据
      storeStats,
      unmatchedDailyStats,
      unmatchedTotal: {
        orderCount: unmatchedOrderCount,
        fakeOrderCount: unmatchedFakeOrderCount,
        validOrderCount: unmatchedValidOrderCount,
        fakeOrderAmount: unmatchedFakeOrderAmount,
        validOrderAmount: unmatchedValidOrderAmount,
        orderAmount: unmatchedOrderAmount,
        refundCount: unmatchedRefundCount,
        refundAmount: unmatchedRefundAmount,
        sameDayRefundCount: unmatchedSameDayRefundCount,
        sameDayRefundAmount: unmatchedSameDayRefundAmount,
        unverifiedCount: unmatchedUnverifiedCount,
        unverifiedAmount: unmatchedUnverifiedAmount,
      },
      unmatchedOrderDetails,
      unmatchedStoreIdStats,
      orderMapping,
      channelStats,
      dailyChannelStats,
      validChannelStats,
      dailyValidChannelStats
    };

    // 保存原始数据到数据库
    try {
      const client = getSupabaseClient();

      // recordCount已经在fullResult中设置了

      // 删除旧数据并插入新数据
      if (insertData.length > 0) {
        // 删除旧订单数据（按store_system）
        await client.from('order_records').delete().eq('store_system', storeSystem);
        
        // 批量插入新数据
        await client.from('order_records').insert(insertData);
        
        // 保存到历史记录
        await client.from('data_upload_history').insert({
          store_system: storeSystem,
          file_type: 'order',
          file_name: file.name,
          record_count: insertData.length,
          min_time: minTime || null,
          max_time: maxTime || null,
          uploaded_by: 'current_user'
        });
        
        console.log(`[订单保存数据库] 完成，插入 ${insertData.length} 条记录`);
      }
    } catch (dbError) {
      console.error('保存订单数据到数据库失败:', dbError);
      // 不影响主流程，只记录错误
    }
    
    return NextResponse.json(fullResult);
  } catch (error) {
    console.error('订单文件解析错误:', error);
    return NextResponse.json({ 
      error: '文件解析失败',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
