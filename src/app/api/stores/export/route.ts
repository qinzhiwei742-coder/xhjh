import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import * as XLSX from 'xlsx';

/**
 * 导出门店数据为 Excel 格式
 * 支持按门店体系导出，包含完整门店信息（联系人、跟进记录等）
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const system = searchParams.get('system'); // meili | mama | all

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

    if (!data || data.length === 0) {
      return NextResponse.json({
        success: false,
        error: '没有门店数据',
      });
    }

    // 获取门店ID列表
    const storeIds = data.map(store => store.id);

    // 获取每个门店的最新跟进记录
    const { data: followData } = await supabase
      .from('follow_records')
      .select('store_id, next_follow_time, follow_time')
      .in('store_id', storeIds)
      .order('created_at', { ascending: false });

    // 按门店ID分组最新跟进记录
    const latestFollowByStore: Record<string, { next_follow_time: string | null; follow_time: string }> = {};
    followData?.forEach(f => {
      if (!latestFollowByStore[f.store_id]) {
        latestFollowByStore[f.store_id] = {
          next_follow_time: f.next_follow_time,
          follow_time: f.follow_time
        };
      }
    });

    // 获取每个门店的联系人
    const { data: contactsData } = await supabase
      .from('contacts')
      .select('*')
      .in('store_id', storeIds)
      .order('is_primary', { ascending: false }); // 首选联系人排前面

    // 按门店ID分组联系人
    const contactsByStore: Record<string, any[]> = {};
    contactsData?.forEach(c => {
      if (!contactsByStore[c.store_id]) {
        contactsByStore[c.store_id] = [];
      }
      contactsByStore[c.store_id].push(c);
    });

    // 门店体系名称映射
    const getSystemName = (sys: string | null) => {
      if (sys === 'meili') return '美丽妈妈';
      if (sys === 'mama') return '妈妈盒子';
      if (sys === 'hecha') return '和茶时代';
      return sys || '';
    };

    // 转换数据为 Excel 友好格式
    const excelData = data.map(store => {
      const contacts = contactsByStore[store.id] || [];
      const primaryContact = contacts.find((c: any) => c.is_primary) || contacts[0] || {};

      return {
        '门店ID': store.store_id || '',
        '门店名称': store.store_name,
        '品类': store.category || '',
        '商户名称': store.merchant_name || '',
        '商户ID': store.merchant_id || '',
        '省份': store.province || '',
        '城市': store.city || '',
        '地址': store.address || '',
        '入驻状态': store.attach_status || '',
        '服务状态': store.business_status || '',
        '门店等级': store.store_level || '',
        '商户电话': store.merchant_phone || '',
        '营业电话1': store.phone1 || '',
        '营业电话2': store.phone2 || '',
        '营业电话3': store.phone3 || '',
        '门店面积': store.store_area || '',
        '员工人数': store.staff_count || '',
        '获客渠道': store.customer_channel || '',
        '联系人姓名': primaryContact.name || '',
        '联系人职位': primaryContact.position || '',
        '联系人电话': primaryContact.phone || '',
        '联系人微信': primaryContact.wechat || '',
        '联系人备注': primaryContact.remark || '',
        '下次跟进时间': latestFollowByStore[store.id]?.next_follow_time
          ? new Date(latestFollowByStore[store.id]!.next_follow_time!).toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '',
        '最后跟进时间': latestFollowByStore[store.id]?.follow_time
          ? new Date(latestFollowByStore[store.id]!.follow_time!).toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '',
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

    // 如果是 'all' 或不指定，则按门店体系分 sheet 导出
    if (!system || system === 'all') {
      // 按门店体系分组
      const grouped = data.reduce((acc, store) => {
        const sys = store.store_system || 'other';
        if (!acc[sys]) acc[sys] = [];
        acc[sys].push(store);
        return acc;
      }, {} as Record<string, any[]>);

      // 为每个门店体系创建 sheet
      const systemNames: Record<string, string> = {
        meili: '美丽妈妈',
        mama: '妈妈盒子',
        hacea: '和茶时代',
      };

      Object.keys(grouped).forEach(sys => {
        const sysData = grouped[sys];
        const sheetData = sysData.map((store: any) => {
          const contacts = contactsByStore[store.id] || [];
          const primaryContact = contacts.find((c: any) => c.is_primary) || contacts[0] || {};

          return {
            '门店ID': store.store_id || '',
            '门店名称': store.store_name,
            '品类': store.category || '',
            '商户名称': store.merchant_name || '',
            '商户ID': store.merchant_id || '',
            '省份': store.province || '',
            '城市': store.city || '',
            '地址': store.address || '',
            '入驻状态': store.attach_status || '',
            '服务状态': store.business_status || '',
            '门店等级': store.store_level || '',
            '商户电话': store.merchant_phone || '',
            '营业电话1': store.phone1 || '',
            '营业电话2': store.phone2 || '',
            '营业电话3': store.phone3 || '',
            '门店面积': store.store_area || '',
            '员工人数': store.staff_count || '',
            '获客渠道': store.customer_channel || '',
            '联系人姓名': primaryContact.name || '',
            '联系人职位': primaryContact.position || '',
            '联系人电话': primaryContact.phone || '',
            '联系人微信': primaryContact.wechat || '',
            '联系人备注': primaryContact.remark || '',
            '下次跟进时间': latestFollowByStore[store.id]?.next_follow_time
              ? new Date(latestFollowByStore[store.id]!.next_follow_time!).toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '',
            '最后跟进时间': latestFollowByStore[store.id]?.follow_time
              ? new Date(latestFollowByStore[store.id]!.follow_time!).toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '',
          };
        });
        const worksheet = XLSX.utils.json_to_sheet(sheetData);
        XLSX.utils.book_append_sheet(workbook, worksheet, systemNames[sys] || sys);
      });
    } else {
      // 单个门店体系
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      XLSX.utils.book_append_sheet(workbook, worksheet, '门店数据');
    }

    // 生成 Excel 文件
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // 返回 Excel 文件
    const filename = system === 'all' || !system
      ? `门店数据完整导出-${new Date().toISOString().slice(0, 10)}.xlsx`
      : `${system === 'meili' ? '美丽妈妈' : system === 'mama' ? '妈妈盒子' : '和茶时代'}门店数据完整导出-${new Date().toISOString().slice(0, 10)}.xlsx`;

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
