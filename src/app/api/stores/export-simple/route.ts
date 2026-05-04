import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import * as XLSX from 'xlsx';

/**
 * 导出门店数据为 Excel 格式
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const system = searchParams.get('system'); // meili | mama | hacea | all

    const supabase = getSupabaseClient();

    // 构建查询条件
    let query = supabase.from('stores').select('*').order('created_at', { ascending: false });
    if (system && system !== 'all') {
      query = query.eq('store_system', system);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // 转换数据为 Excel 友好格式
    const excelData = (data || []).map(store => {
      // 门店体系名称映射
      const getSystemName = (sys: string | null) => {
        if (sys === 'meili') return '美丽妈妈';
        if (sys === 'mama') return '妈妈盒子';
        if (sys === 'hecha') return '和茶时代';
        return sys || '';
      };

      return {
        '门店ID': store.store_id || '',
        '门店名称': store.store_name || '',
        '品类': store.category || '',
        '商户名称': store.merchant_name || '',
        '商户ID': store.merchant_id || '',
        '商户电话': store.merchant_phone || '',
        '省份': store.province || '',
        '城市': store.city || '',
        '地址': store.address || '',
        '入驻状态': store.attach_status || '',
        '服务状态': store.business_status || '',
        '门店等级': store.store_level || '',
        '营业电话1': store.phone1 || '',
        '营业电话2': store.phone2 || '',
        '营业电话3': store.phone3 || '',
        '门店面积': store.store_area || '',
        '员工人数': store.staff_count || '',
        '获客渠道': store.customer_channel || '',
        '门店体系': getSystemName(store.store_system),
        '创建时间': store.created_at
          ? new Date(store.created_at).toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '',
      };
    });

    // 创建工作簿
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(workbook, worksheet, '门店数据');

    // 生成 Excel 文件
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // 文件名
    const systemName = !system || system === 'all' ? '全部' :
      system === 'meili' ? '美丽妈妈' : system === 'mama' ? '妈妈盒子' : '和茶时代';
    const filename = `门店数据-${systemName}-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error) {
    console.error('导出门店数据失败:', error);
    return NextResponse.json(
      { error: '导出门店数据失败' },
      { status: 500 }
    );
  }
}
