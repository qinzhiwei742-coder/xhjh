import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 核销按日统计
interface DailyVerifyStats {
  verifyCount: number;        // 核销数
  verifyAmount: number;       // 核销金额
  fakeVerifyCount: number;    // 刷单核销数（核销金额 ≤ 10元，包含10元）
  validVerifyCount: number;   // 有效核销数（核销金额 > 10元，不包含10元）
  fakeVerifyAmount: number;   // 刷单核销金额（核销金额 ≤ 10元，包含10元）
  validVerifyAmount: number;  // 有效核销金额（核销金额 > 10元，不包含10元）
  // 渠道统计
  channelStats: Record<string, number>;  // 渠道名称 -> 核销数
  // 套餐统计
  packageStats: Record<string, number>;         // 套餐名 -> 核销数
  packageAmountStats: Record<string, number>;    // 套餐名 -> 核销金额
}

// 门店核销统计
interface StoreVerifyStats {
  totalVerifyCount: number;
  totalVerifyAmount: number;
  dailyStats: Record<string, DailyVerifyStats>;
  // 渠道统计
  channelStats: Record<string, number>;  // 渠道名称 -> 核销数
  // 套餐统计
  packageStats: Record<string, number>;         // 套餐名 -> 核销数
  packageAmountStats: Record<string, number>;    // 套餐名 -> 核销金额
}

// 未匹配核销详情
interface UnmatchedVerifyDetail {
  verifyId: string;              // 核销ID
  storeId: string | null;       // 门店ID（可能为空）
  reason: string;               // 未匹配原因
  verifyTime: string;           // 核销时间
  verifyCount: number;          // 核销数量
  verifyAmount: number;         // 核销金额
}

// 聚合结果
interface AggregatedResult {
  storeStats: Record<string, StoreVerifyStats>;
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
  unmatchedDailyStats: Record<string, DailyVerifyStats>;
  unmatchedTotal: {
    verifyCount: number;
    verifyAmount: number;
  };
  // 未匹配核销详情
  unmatchedVerifyDetails: UnmatchedVerifyDetail[];
  // 渠道统计（全部数据）
  channelStats: Record<string, number>;  // 渠道名称 -> 核销数
  // 按日渠道统计（用于时间筛选）
  dailyChannelStats: Record<string, Record<string, number>>;  // 日期 -> 渠道名称 -> 核销数
  // 有效核销渠道统计（核销金额 > 10元）
  validChannelStats: Record<string, number>;  // 渠道名称 -> 有效核销数
  // 按日有效渠道统计
  dailyValidChannelStats: Record<string, Record<string, number>>;  // 日期 -> 渠道名称 -> 有效核销数
}

// 安全解析金额函数
const parseAmount = (value: unknown): number => {
  if (value === null || value === undefined || value === '') return 0;
  const str = String(value).replace(/[¥￥$,\s]/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
};

// 安全解析数字函数
const parseNumber = (value: unknown, defaultValue: number = 0): number => {
  if (value === null || value === undefined || value === '' || value === '-') return defaultValue;
  const num = parseFloat(String(value));
  return isNaN(num) ? defaultValue : num;
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
    
    console.log(`[核销文件解析] 总记录数: ${jsonData.length}`);
    
    // 聚合结果
    const storeStats: Record<string, StoreVerifyStats> = {};
    const unmatchedDailyStats: Record<string, DailyVerifyStats> = {};
    const unmatchedVerifyDetails: UnmatchedVerifyDetail[] = [];
    let minTime = '';
    let maxTime = '';
    let matchedCount = 0;
    
    // 未匹配总计
    let unmatchedVerifyCount = 0;
    let unmatchedVerifyAmount = 0;
    
    // 渠道统计
    const channelStats: Record<string, number> = {};
    // 按日渠道统计
    const dailyChannelStats: Record<string, Record<string, number>> = {};
    // 有效核销渠道统计（核销金额 > 10元）
    const validChannelStats: Record<string, number> = {};
    // 按日有效渠道统计
    const dailyValidChannelStats: Record<string, Record<string, number>> = {};
    
    // 辅助函数：添加到日期统计
    const addToDailyStats = (
      dailyStats: Record<string, DailyVerifyStats>,
      date: string,
      count: number,
      amount: number,
      packageName?: string
    ) => {
      if (!date) return;
      if (!dailyStats[date]) {
        dailyStats[date] = {
          verifyCount: 0,
          verifyAmount: 0,
          fakeVerifyCount: 0,
          validVerifyCount: 0,
          fakeVerifyAmount: 0,
          validVerifyAmount: 0,
          channelStats: {},
          packageStats: {},
          packageAmountStats: {}
        };
      }
      dailyStats[date].verifyCount += count;
      dailyStats[date].verifyAmount += amount;
      // 统计刷单核销数和金额：核销金额 ≤ 10（包含10元）
      if (amount <= 10) {
        dailyStats[date].fakeVerifyCount += count;
        dailyStats[date].fakeVerifyAmount += amount;
      }
      // 统计有效核销数和金额：核销金额 > 10（不包含10元）
      if (amount > 10) {
        dailyStats[date].validVerifyCount += count;
        dailyStats[date].validVerifyAmount += amount;
      }
      // 统计套餐数据
      if (packageName) {
        if (!dailyStats[date].packageStats[packageName]) {
          dailyStats[date].packageStats[packageName] = 0;
        }
        dailyStats[date].packageStats[packageName] += count;

        if (!dailyStats[date].packageAmountStats[packageName]) {
          dailyStats[date].packageAmountStats[packageName] = 0;
        }
        dailyStats[date].packageAmountStats[packageName] += amount;
      }
    };
    
    // 处理每条记录
    for (const row of jsonData) {
      const storeId = String(row['核销门店ID'] || '').trim();
      const verifyTime = String(row['核销时间'] || '');
      const verifyStatus = String(row['核销状态'] || '');
      const channel = String(row['成交渠道'] || '未知');
      const packageName = String(row['套餐名'] || row['套餐'] || '');

      // 排除已撤销核销和核销后退款
      if (verifyStatus === '已撤销核销' || verifyStatus === '核销后退款') continue;

      // 提取日期
      const verifyDate = verifyTime ? verifyTime.split(' ')[0] : '';

      // 更新时间范围
      if (verifyDate) {
        if (!minTime || verifyDate < minTime) minTime = verifyDate;
        if (!maxTime || verifyDate > maxTime) maxTime = verifyDate;
      }

      // 计算核销金额 - 使用 parseAmount 安全解析金额
      const verifyAmount = parseAmount(row['订单实收'] || row['顾客实付金额'] || row['核销实收'] || row['核销金额']);

      // 判断是否匹配门店
      const isMatched = storeId && storeIdSet.has(storeId);

      if (isMatched) {
        matchedCount++;

        if (!storeStats[storeId]) {
          storeStats[storeId] = {
            totalVerifyCount: 0,
            totalVerifyAmount: 0,
            dailyStats: {},
            channelStats: {},
            packageStats: {},
            packageAmountStats: {}
          };
        }

        // 累加总数
        storeStats[storeId].totalVerifyCount += 1;
        storeStats[storeId].totalVerifyAmount += verifyAmount;

        // 按日统计（包含套餐统计）
        addToDailyStats(storeStats[storeId].dailyStats, verifyDate, 1, verifyAmount, packageName);

        // 套餐统计（总计）
        if (packageName) {
          if (!storeStats[storeId].packageStats[packageName]) {
            storeStats[storeId].packageStats[packageName] = 0;
          }
          storeStats[storeId].packageStats[packageName] += 1;

          if (!storeStats[storeId].packageAmountStats[packageName]) {
            storeStats[storeId].packageAmountStats[packageName] = 0;
          }
          storeStats[storeId].packageAmountStats[packageName] += verifyAmount;
        }
      } else {
        // 未匹配
        const reason = !storeId ? '门店ID为空' : '门店ID不在系统中';
        
        unmatchedVerifyCount += 1;
        unmatchedVerifyAmount += verifyAmount;
        
        addToDailyStats(unmatchedDailyStats, verifyDate, 1, verifyAmount);
        
        // 保存未匹配核销详情（最多保存100条）
        if (unmatchedVerifyDetails.length < 100) {
          unmatchedVerifyDetails.push({
            verifyId: String(row['订单ID'] || ''),
            storeId: storeId || null,
            reason,
            verifyTime,
            verifyCount: 1,
            verifyAmount
          });
        }
      }
      
      // 渠道统计（全部有效核销记录）
      if (!channelStats[channel]) {
        channelStats[channel] = 0;
      }
      channelStats[channel]++;

      // 更新按日渠道统计
      if (!dailyChannelStats[verifyDate]) {
        dailyChannelStats[verifyDate] = {};
      }
      if (!dailyChannelStats[verifyDate][channel]) {
        dailyChannelStats[verifyDate][channel] = 0;
      }
      dailyChannelStats[verifyDate][channel]++;

      // 更新有效核销渠道统计（核销金额 > 10元）
      if (verifyAmount > 10) {
        if (!validChannelStats[channel]) {
          validChannelStats[channel] = 0;
        }
        validChannelStats[channel]++;

        // 更新按日有效渠道统计
        if (!dailyValidChannelStats[verifyDate]) {
          dailyValidChannelStats[verifyDate] = {};
        }
        if (!dailyValidChannelStats[verifyDate][channel]) {
          dailyValidChannelStats[verifyDate][channel] = 0;
        }
        dailyValidChannelStats[verifyDate][channel]++;
      }
    }
    
    // ========== 返回简化结果（不返回大聚合数据，前端从 store-stats API 获取）==========
    const simpleResult = {
      success: true,
      storeSystem,
      fileName: file.name,
      recordCount: 0, // 稍后更新
      timeRange: { minTime, maxTime },
      stats: {
        totalRecords: jsonData.length,
        matchedRecords: matchedCount,
        unmatchedRecords: jsonData.length - matchedCount
      }
    };

    console.log(`[核销文件解析] 完成: 匹配${matchedCount}/${jsonData.length}条, 门店数${Object.keys(storeStats).length}`);
    
    // 保存原始数据到数据库
    try {
      const client = getSupabaseClient();
      
      // 转换并插入新数据 - 保存所有字段
      const insertData = jsonData.map((row) => {
        return {
          // 门店体系
          store_system: storeSystem,
          
          // 基础字段
          order_id: row['订单ID'] || null,
          order_label: row['订单标签'] || null,
          order_time: row['下单时间'] || null,
          payment_time: row['支付时间'] || null,
          coupon_code: row['券码（已撤销核销加密）'] || null,
          store_id: String(row['核销门店ID'] || '').trim() || null,
          store_name: row['核销门店'] || null,
          status: row['核销状态'] || null,
          verify_time: row['核销时间'] || null,
          cancel_verify_time: row['撤销核销时间'] || null,
          
          // 商品信息
          product_name: row['商品名称'] || null,
          product_type: row['商品类型'] || null,
          product_id: row['商品ID'] || null,
          product_category: row['商品类目'] || null,
          merchant_name: row['商品归属商户'] || null,
          merchant_id: row['商品归属商户ID'] || null,
          purchase_quantity: parseNumber(row['购买数量'], 1),
          product_price: parseAmount(row['商品售价（单价）']),
          original_price: parseAmount(row['用户侧划线价']),

          // 用户实付 - Excel中单位是"元"，无需转换
          user_currency: row['用户实付金额币种'] || null,
          user_paid_amount: parseAmount(row['券用户实付金额']),
          merchant_subsidy: parseAmount(row['代商家出资补贴']),
          tiktok_discount: parseAmount(row['抖音支付优惠']),

          // 订单实收 - Excel中单位是"元"，无需转换
          order_currency: row['订单实收币种'] || null,
          order_actual_amount: parseAmount(row['订单实收']),

          // 预计收入 - Excel中单位是"元"，无需转换
          expected_currency: row['预计收入币种'] || null,
          expected_income: parseAmount(row['预计收入']),

          // 补贴信息 - Excel中单位是"元"，无需转换
          merchant_subsidy_detail: row['商家补贴优惠明细'] || null,
          merchant_fund_subsidy: parseAmount(row['商家货款补贴']),
          platform_subsidy: parseAmount(row['平台补贴']),
          platform_subsidy_detail: row['平台补贴优惠明细'] || null,
          brand_subsidy: parseAmount(row['品牌商补贴']),
          brand_subsidy_detail: row['品牌商补贴优惠明细'] || null,
          service_provider_subsidy: parseAmount(row['服务商补贴']),
          service_provider_subsidy_detail: row['服务商补贴优惠明细'] || null,
          government_subsidy: parseAmount(row['政府补贴']),
          government_subsidy_detail: row['政府补贴优惠明细'] || null,

          // 服务费 - Excel中单位是"元"，无需转换
          service_fee_base: parseAmount(row['各类服务费率基数']),
          software_service_fee: parseAmount(row['软件服务费']),
          software_service_fee_rate: row['软件服务费率'] || null,
         托管_service_fee: parseAmount(row['出单宝托管服务费']),
         托管_service_fee_rate: row['出单宝托管服务费率'] || null,
          payment_fee: parseAmount(row['支付手续费（已含在软件服务费中）']),
          payment_fee_rate: row['支付手续费费率'] || null,

          // 达人服务费 - Excel中单位是"元"，无需转换
          influencer_service_fee: parseAmount(row['达人服务费']),
          influencer_service_fee_rate: row['达人服务费比例'] || null,
          staff_incentive: parseAmount(row['职人激励金']),
          staff_incentive_rate: row['职人激励金比例'] || null,

          // 服务商服务费 - Excel中单位是"元"，无需转换
          broker_service_fee: parseAmount(row['撮合经纪服务费']),
          service_provider_service_fee: parseAmount(row['服务商服务费']),
          service_provider_service_fee_rate: row['服务商服务费比例'] || null,
          service_provider_name: row['服务商名称'] || null,

          // 其他费用 - Excel中单位是"元"，无需转换
          store_staff_incentive: parseAmount(row['店员激励金额']),
          store_staff_incentive_rate: row['店员激励金额比例'] || null,
          monthly_installment_interest: parseAmount(row['月付贴息金额']),
          promotion_fee: parseAmount(row['增量宝推广费']),
          
          // 渠道信息
          channel: row['成交渠道'] || '未知',
          sales_role: row['带货角色'] || null,
          sales_person: row['带货人'] || null,
          order_owner_nickname: row['订单归属人昵称(字段如果获取不到就默认展示商家，如对账以账单为主)'] || null,
          order_owner_uid: row['订单归属人uid'] || null,
          influencer_nickname: row['达人昵称'] || null,
          influencer_tiktok_account: row['达人抖音号'] || null,
          influencer_uid: row['达人uid'] || null,
          
          // 提货信息
          pickup_spec: row['提货规格'] || null,
          pickup_deadline: row['提货截止时间'] || null
        };
      });
      
      // 更新 recordCount
      simpleResult.recordCount = insertData.length;

      // 删除旧数据并插入新数据
      if (insertData.length > 0) {
        // 删除旧核销数据（按store_system）
        await client.from('verify_records').delete().eq('store_system', storeSystem);

        // 批量插入新数据
        await client.from('verify_records').insert(insertData);

        // 保存到历史记录
        await client.from('data_upload_history').insert({
          store_system: storeSystem,
          file_type: 'verify',
          file_name: file.name,
          record_count: insertData.length,
          min_time: minTime || null,
          max_time: maxTime || null,
          uploaded_by: 'current_user'
        });

        console.log(`[核销保存数据库] 完成，插入 ${insertData.length} 条记录`);
      }
    } catch (dbError) {
      console.error('保存核销数据到数据库失败:', dbError);
      throw new Error(`保存数据失败: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
    }
    
    return NextResponse.json(simpleResult);
  } catch (error) {
    console.error('核销文件解析错误:', error);
    return NextResponse.json({ 
      error: '文件解析失败',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET - 从数据库获取核销统计信息
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const storeSystem = searchParams.get('storeSystem') || 'unknown';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const client = getSupabaseClient();

    // 构建查询条件
    let query = client
      .from('verify_records')
      .select('*')
      .eq('store_system', storeSystem);

    // 时间筛选
    if (startDate) {
      query = query.gte('verify_time', startDate);
    }
    if (endDate) {
      query = query.lte('verify_time', endDate);
    }

    const { data: records, error } = await query;

    if (error) {
      console.error('查询核销数据失败:', error);
      return NextResponse.json({ error: '查询核销数据失败' }, { status: 500 });
    }

    if (!records || records.length === 0) {
      return NextResponse.json({
        totalVerifyCount: 0,
        totalVerifyAmount: 0,
        fakeVerifyCount: 0,
        validVerifyCount: 0,
        fakeVerifyAmount: 0,
        validVerifyAmount: 0,
        records: []
      });
    }

    // 过滤已核销状态（排除已撤销核销和核销后退款）
    const filteredRecords = records.filter(
      r => r.status === '已核销' && r.store_id
    );

    // 统计
    let totalVerifyCount = 0;
    let totalVerifyAmount = 0;
    let fakeVerifyCount = 0;
    let validVerifyCount = 0;
    let fakeVerifyAmount = 0;
    let validVerifyAmount = 0;

    filteredRecords.forEach(record => {
      const verifyAmount = Number(record.order_actual_amount) || 0;
      const quantity = Number(record.purchase_quantity) || 1;

      totalVerifyCount += quantity;
      totalVerifyAmount += verifyAmount;

      // 刷单核销：核销金额 ≤ 10元（包含10元）
      if (verifyAmount <= 10) {
        fakeVerifyCount += quantity;
        fakeVerifyAmount += verifyAmount;
      }

      // 有效核销：核销金额 > 10元（不包含10元）
      if (verifyAmount > 10) {
        validVerifyCount += quantity;
        validVerifyAmount += verifyAmount;
      }
    });

    return NextResponse.json({
      totalVerifyCount,
      totalVerifyAmount,
      fakeVerifyCount,
      validVerifyCount,
      fakeVerifyAmount,
      validVerifyAmount,
      records: filteredRecords
    });
  } catch (error) {
    console.error('获取核销统计失败:', error);
    return NextResponse.json({ 
      error: '获取核销统计失败',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
