import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import * as XLSX from 'xlsx';

/**
 * 导出联系人数据为 Excel 格式
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const system = searchParams.get('system'); // meili | mama | hacea | all

    const supabase = getSupabaseClient();

    // 如果指定了门店体系，需要先获取该体系下的门店ID
    let storeIds: string[] | null = null;
    if (system && system !== 'all') {
      const { data: stores } = await supabase
        .from('stores')
        .select('id')
        .eq('store_system', system);
      storeIds = (stores || []).map(s => s.id);
      
      if (storeIds.length === 0) {
        return NextResponse.json({
          success: false,
          error: '没有门店数据',
        });
      }
    }

    // 构建查询条件
    let query = supabase.from('contacts').select('*').order('created_at', { ascending: false });
    if (storeIds) {
      query = query.in('store_id', storeIds);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // 获取门店ID到门店名称的映射
    const allStoreIds = [...new Set((data || []).map(c => c.store_id))];
    let storeNameMap: Record<string, string> = {};
    
    if (allStoreIds.length > 0) {
      const { data: stores } = await supabase
        .from('stores')
        .select('id, store_name, store_system')
        .in('id', allStoreIds);
      
      if (stores) {
        storeNameMap = stores.reduce((acc, s) => {
          acc[s.id] = s.store_name || '';
          return acc;
        }, {} as Record<string, string>);
      }
    }

    // 转换数据为 Excel 友好格式
    const excelData = (data || []).map(contact => {
      return {
        '门店ID': contact.store_id || '',
        '门店名称': storeNameMap[contact.store_id] || '',
        '联系人姓名': contact.name || '',
        '职位': contact.position || '',
        '电话': contact.phone || '',
        '微信': contact.wechat || '',
        '备注': contact.remark || '',
        '首选联系人': contact.is_primary ? '是' : '否',
        '创建时间': contact.created_at
          ? new Date(contact.created_at).toLocaleString('zh-CN', {
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
    XLSX.utils.book_append_sheet(workbook, worksheet, '联系人数据');

    // 生成 Excel 文件
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // 文件名
    const systemName = !system || system === 'all' ? '全部' :
      system === 'meili' ? '美丽妈妈' : system === 'mama' ? '妈妈盒子' : '和茶时代';
    const filename = `联系人数据-${systemName}-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error) {
    console.error('导出联系人数据失败:', error);
    return NextResponse.json(
      { error: '导出联系人数据失败' },
      { status: 500 }
    );
  }
}
