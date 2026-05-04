import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSupabaseClient } from '@/storage/database/supabase-client';

interface DailyRefundStats {
  refundCount: number;
  refundAmount: number;
  sameDayRefundCount: number;
  sameDayRefundAmount: number;
}

interface StoreRefundStats {
  totalRefundCount: number;
  totalRefundAmount: number;
  totalSameDayRefundCount: number;
  totalSameDayRefundAmount: number;
  // 按日期统计退款数
  dailyStats: Record<string, DailyRefundStats>;
}

interface UnmatchedRefundDetail {
  orderId: string;
  refundDate: string;
  payTime: string;
  quantity: number;
  amount: number;
  sameDayRefund: boolean;
  reason: string;
}

interface AggregatedResult {
  // 按门店统计的退款数据
  storeStats: Record<string, StoreRefundStats>;
  // 时间范围
  timeRange: {
    minTime: string;
    maxTime: string;
  };
  // 统计信息
  stats: {
    totalRecords: number;
    matchedRecords: number;
    unmatchedRecords: number;
  };
  // 未匹配的退款记录（门店ID为空的）- 按日期聚合
  unmatchedDailyStats: Record<string, DailyRefundStats>;
  unmatchedTotal: {
    refundCount: number;
    refundAmount: number;
    sameDayRefundCount: number;
    sameDayRefundAmount: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const orderMappingStr = formData.get('orderMapping') as string;
    const validStoreIdsStr = formData.get('validStoreIds') as string;
    const storeSystem = formData.get('storeSystem') as string || 'unknown';
    
    if (!file) {
      return NextResponse.json({ error: '文件未上传' }, { status: 400 });
    }

    // 解析订单ID到门店ID的映射
    const orderMapping: Record<string, string> = orderMappingStr ? JSON.parse(orderMappingStr) : {};
    
    // 解析有效门店ID列表
    const validStoreIds: Set<string> = validStoreIdsStr ? new Set(JSON.parse(validStoreIdsStr)) : new Set();
    
    // 读取文件
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null, blankrows: false }) as Record<string, unknown>[];
    
    console.log(`[退款文件解析] 总记录数: ${jsonData.length}`);
    
    // 聚合结果
    const storeStats: Record<string, StoreRefundStats> = {};
    const unmatchedDailyStats: Record<string, DailyRefundStats> = {};
    let minTime = '';
    let maxTime = '';
    let matchedCount = 0;
    let unmatchedTotalCount = 0;
    let unmatchedTotalAmount = 0;
    let unmatchedSameDayCount = 0;
    let unmatchedSameDayAmount = 0;
    
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
    
    // 辅助函数：添加到日期统计
    const addToDailyStats = (
      dailyStats: Record<string, DailyRefundStats>, 
      date: string, 
      quantity: number,
      amount: number,
      isSameDay: boolean
    ) => {
      if (!date) return;
      if (!dailyStats[date]) {
        dailyStats[date] = { 
          refundCount: 0, 
          refundAmount: 0,
          sameDayRefundCount: 0,
          sameDayRefundAmount: 0
        };
      }
      dailyStats[date].refundCount += quantity;
      dailyStats[date].refundAmount += amount;
      if (isSameDay) {
        dailyStats[date].sameDayRefundCount += quantity;
        dailyStats[date].sameDayRefundAmount += amount;
      }
    };
    
    // 处理每条记录
    for (const row of jsonData) {
      const orderId = String(row['订单 ID'] || row['订单ID'] || '');
      const storeId = orderMapping[orderId] || '';
      const refundTime = String(row['售后完成时间'] || row['退款审核完成时间'] || '');
      const payTime = String(row['支付时间'] || '');
      const quantity = Number(row['退款券数']) || 1;
      // 退款金额可能字段：退款金额、用户实退金额等，单位是"元"，无需转换
      const refundAmount = Number(row['退款金额'] || row['用户实退金额'] || row['实退金额'] || 0) || 0;
      // 售后状态：只统计"已退款"状态（与抖音来客口径一致）
      const refundStatus = String(row['售后状态'] || '');
      if (refundStatus !== '已退款') {
        continue; // 跳过非"已退款"状态的记录（如"已关闭"）
      }
      
      // 提取日期部分用于统计
      const refundDate = refundTime ? refundTime.split(' ')[0] : '';
      
      // 更新时间范围
      if (refundDate) {
        if (!minTime || refundDate < minTime) minTime = refundDate;
        if (!maxTime || refundDate > maxTime) maxTime = refundDate;
      }
      
      // 判断是否当天退款
      const isSameDay = isSameDayRefund(refundTime, payTime);
      
      // 判断是否应该计入门店统计：门店ID存在且在有效列表中
      const isValidStore = storeId && (validStoreIds.size === 0 || validStoreIds.has(storeId));
      
      if (isValidStore) {
        // 有效门店，统计到对应门店
        matchedCount++;
        
        if (!storeStats[storeId]) {
          storeStats[storeId] = {
            totalRefundCount: 0,
            totalRefundAmount: 0,
            totalSameDayRefundCount: 0,
            totalSameDayRefundAmount: 0,
            dailyStats: {}
          };
        }
        
        storeStats[storeId].totalRefundCount += quantity;
        storeStats[storeId].totalRefundAmount += refundAmount;
        if (isSameDay) {
          storeStats[storeId].totalSameDayRefundCount += quantity;
          storeStats[storeId].totalSameDayRefundAmount += refundAmount;
        }
        
        // 按日期统计
        addToDailyStats(storeStats[storeId].dailyStats, refundDate, quantity, refundAmount, isSameDay);
      } else {
        // 无门店ID或门店ID不在有效列表中，归入未匹配
        unmatchedTotalCount += quantity;
        unmatchedTotalAmount += refundAmount;
        if (isSameDay) {
          unmatchedSameDayCount += quantity;
          unmatchedSameDayAmount += refundAmount;
        }
        addToDailyStats(unmatchedDailyStats, refundDate, quantity, refundAmount, isSameDay);
      }
    }
    
    // ========== 返回完整聚合数据，前端需要 storeStats 来计算退款统计 ==========
    const fullResult: AggregatedResult = {
      // 按门店统计的退款数据
      storeStats,
      // 时间范围
      timeRange: { minTime, maxTime },
      // 统计信息
      stats: {
        totalRecords: jsonData.length,
        matchedRecords: matchedCount,
        unmatchedRecords: jsonData.length - matchedCount
      },
      // 未匹配的退款记录（门店ID为空的）- 按日期聚合
      unmatchedDailyStats,
      unmatchedTotal: {
        refundCount: unmatchedTotalCount,
        refundAmount: unmatchedTotalAmount,
        sameDayRefundCount: unmatchedSameDayCount,
        sameDayRefundAmount: unmatchedSameDayAmount
      }
    };

    console.log(`[退款文件解析] 完成: 匹配${matchedCount}/${jsonData.length}条, 门店数${Object.keys(storeStats).length}`);
    
    // 保存原始数据到数据库
    try {
      const client = getSupabaseClient();
      
      // 转换并插入新数据
      const insertData = jsonData.map((row) => {
        const orderId = String(row['订单 ID'] || row['订单ID'] || '');
        const storeId = orderMapping[orderId] || '';
        const refundTime = String(row['售后完成时间'] || row['退款审核完成时间'] || '');
        // 退款金额单位是"元"，无需转换
        const refundAmount = Number(row['退款金额'] || row['用户实退金额'] || row['实退金额'] || 0) || 0;
        const afterSaleStatus = String(row['售后状态'] || '');
        const refundCompleteTime = String(row['售后完成时间'] || row['退款审核完成时间'] || '');

        return {
          store_id: storeId || null,
          order_id: orderId || null,
          refund_time: refundTime || null,
          refund_amount: refundAmount,
          after_sale_status: afterSaleStatus || null,
          refund_complete_time: refundCompleteTime || null,
          store_system: storeSystem
        };
      });
      
      // 删除旧数据并插入新数据
      if (insertData.length > 0) {
        // 删除旧退款数据（按store_system）
        await client.from('refund_records').delete().eq('store_system', storeSystem);
        
        // 批量插入新数据
        await client.from('refund_records').insert(insertData);
        
        // 保存到历史记录
        await client.from('data_upload_history').insert({
          store_system: storeSystem,
          file_type: 'refund',
          file_name: file.name,
          record_count: insertData.length,
          min_time: minTime || null,
          max_time: maxTime || null,
          uploaded_by: 'current_user'
        });
        
        console.log(`[退款保存数据库] 完成，插入 ${insertData.length} 条记录`);
      }
    } catch (dbError) {
      console.error('保存退款数据到数据库失败:', dbError);
      // 不影响主流程，只记录错误
    }
    
    return NextResponse.json(fullResult);
  } catch (error) {
    console.error('退款文件解析错误:', error);
    return NextResponse.json({ 
      error: '文件解析失败',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
