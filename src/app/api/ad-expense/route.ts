import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 上传广告费数据到数据库
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { store_system, account_index, records } = body;

    if (!store_system || account_index === undefined || !Array.isArray(records)) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      );
    }

    console.log(`[广告费上传] 账户${account_index + 1}, 记录数: ${records.length}`);

    // 先删除该账户的旧数据
    const { error: deleteError } = await client
      .from('ad_expense_records')
      .delete()
      .eq('store_system', store_system)
      .eq('account_index', account_index);

    if (deleteError) {
      console.error('删除旧数据失败:', deleteError);
    }

    // 插入新数据
    const insertData = records.map((record: any) => ({
      store_system,
      account_index,
      store_id: record.storeId || record.store_id || null,
      store_name: record.storeName || record.store_name || null,
      // Excel中的广告费单位是"元"，无需转换
      spend: parseFloat(record.spend || record.spend_amount || 0) || 0,
      orders: parseInt(record.orders || 0) || 0,
      record_date: record.date || record.record_date || null,
    }));

    const { data, error } = await client
      .from('ad_expense_records')
      .insert(insertData)
      .select();

    if (error) {
      console.error('插入广告费数据失败:', error);
      throw new Error(`插入失败: ${error.message}`);
    }

    // 获取时间范围
    const { data: rangeData } = await client
      .from('ad_expense_records')
      .select('record_date')
      .eq('store_system', store_system)
      .eq('account_index', account_index)
      .not('record_date', 'is', null)
      .order('record_date', { ascending: true })
      .limit(1);

    const { data: rangeDataEnd } = await client
      .from('ad_expense_records')
      .select('record_date')
      .eq('store_system', store_system)
      .eq('account_index', account_index)
      .not('record_date', 'is', null)
      .order('record_date', { ascending: false })
      .limit(1);

    const minTime = rangeData?.[0]?.record_date || null;
    const maxTime = rangeDataEnd?.[0]?.record_date || null;

    console.log(`[广告费上传] 完成，插入 ${data?.length || 0} 条记录，时间范围: ${minTime} ~ ${maxTime}`);

    return NextResponse.json({
      success: true,
      data: {
        accountIndex: account_index,
        totalRecords: records.length,
        insertedRecords: data?.length || 0,
        minTime,
        maxTime,
      }
    });
  } catch (error) {
    console.error('上传广告费数据失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '上传失败' },
      { status: 500 }
    );
  }
}

// 获取指定账户的广告费统计
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const store_system = searchParams.get('store_system');
    const account_index = searchParams.get('account_index');

    if (!store_system) {
      return NextResponse.json(
        { success: false, error: '缺少store_system参数' },
        { status: 400 }
      );
    }

    // 如果指定了账户索引，只查询该账户
    if (account_index !== null) {
      const idx = parseInt(account_index);

      // 使用分页获取该账户的所有数据（突破 Supabase 1000 条限制）
      const allStats: any[] = [];
      const pageSize = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await client
          .from('ad_expense_records')
          .select('spend, orders, record_date')
          .eq('store_system', store_system)
          .eq('account_index', idx)
          .range(from, to);

        if (error) throw new Error(`查询广告费数据失败: ${error.message}`);

        if (data && data.length > 0) {
          allStats.push(...data);
          page++;
          if (data.length < pageSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      // 计算统计数据
      const totalSpend = allStats.reduce((sum, r) => sum + parseFloat(String(r.spend || 0)), 0) || 0;
      const totalOrders = allStats.reduce((sum, r) => sum + parseInt(String(r.orders || 0)), 0) || 0;

      // 获取时间范围
      const allDates = allStats
        .filter(r => r.record_date)
        .map(r => String(r.record_date).substring(0, 10))
        .sort();

      const minTime = allDates[0] || null;
      const maxTime = allDates[allDates.length - 1] || null;

      return NextResponse.json({
        success: true,
        data: {
          accountIndex: idx,
          totalRecords: allStats.length,
          totalSpend,
          totalOrders,
          minTime,
          maxTime,
        }
      });
    }

    // 查询所有账户的汇总统计（使用分页突破 1000 条限制）
    const allStats: any[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await client
        .from('ad_expense_records')
        .select('account_index, spend, orders, record_date')
        .eq('store_system', store_system)
        .range(from, to);

      if (error) throw new Error(`查询广告费数据失败: ${error.message}`);

      if (data && data.length > 0) {
        allStats.push(...data);
        page++;
        if (data.length < pageSize) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    // 按账户分组统计
    const accountStats: Record<number, { spend: number; orders: number; records: number; minTime: string | null; maxTime: string | null }> = {};
    
    for (let i = 0; i < 4; i++) {
      accountStats[i] = { spend: 0, orders: 0, records: 0, minTime: null, maxTime: null };
    }

    allStats?.forEach(record => {
      const idx = record.account_index;
      if (accountStats[idx] !== undefined) {
        accountStats[idx].spend += parseFloat(String(record.spend || 0));
        accountStats[idx].orders += parseInt(String(record.orders || 0));
        accountStats[idx].records++;
        
        if (record.record_date) {
          if (!accountStats[idx].minTime || record.record_date < accountStats[idx].minTime) {
            accountStats[idx].minTime = record.record_date;
          }
          if (!accountStats[idx].maxTime || record.record_date > accountStats[idx].maxTime) {
            accountStats[idx].maxTime = record.record_date;
          }
        }
      }
    });

    // 计算汇总
    let totalSpend = 0;
    let totalOrders = 0;
    let totalRecords = 0;

    Object.values(accountStats).forEach(stat => {
      totalSpend += stat.spend;
      totalOrders += stat.orders;
      totalRecords += stat.records;
    });

    return NextResponse.json({
      success: true,
      data: {
        accounts: accountStats,
        totalSpend,
        totalOrders,
        totalRecords,
      }
    });
  } catch (error) {
    console.error('获取广告费数据失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取失败' },
      { status: 500 }
    );
  }
}

// 删除指定账户的广告费数据
export async function DELETE(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const store_system = searchParams.get('store_system');
    const account_index = searchParams.get('account_index');
    const delete_all = searchParams.get('delete_all'); // 新增：是否清空全部

    // 清空全部模式
    if (delete_all === 'true' && store_system) {
      const { error } = await client
        .from('ad_expense_records')
        .delete()
        .eq('store_system', store_system);

      if (error) {
        console.error('清空全部广告费数据失败:', error);
        throw new Error(`清空失败: ${error.message}`);
      }

      console.log(`[广告费清空] ${store_system} 体系所有数据已清空`);

      return NextResponse.json({
        success: true,
        message: `${store_system} 体系的广告费数据已全部清空`
      });
    }

    // 单个账户删除模式
    if (!store_system || account_index === null) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      );
    }

    const idx = parseInt(account_index);

    const { error } = await client
      .from('ad_expense_records')
      .delete()
      .eq('store_system', store_system)
      .eq('account_index', idx);

    if (error) {
      console.error('删除广告费数据失败:', error);
      throw new Error(`删除失败: ${error.message}`);
    }

    console.log(`[广告费删除] 账户${idx + 1} 数据已清空`);

    return NextResponse.json({
      success: true,
      message: `账户${idx + 1} 数据已清空`
    });
  } catch (error) {
    console.error('删除广告费数据失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '删除失败' },
      { status: 500 }
    );
  }
}
