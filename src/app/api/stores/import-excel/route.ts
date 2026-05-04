import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 从 Excel 导入门店数据到美丽妈妈体系
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { stores } = body;

    if (!Array.isArray(stores) || stores.length === 0) {
      return NextResponse.json(
        { error: '门店数据格式错误，需要数组' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // 获取美丽妈妈体系中已存在的门店ID
    const { data: existingStores, error: checkError } = await supabase
      .from('stores')
      .select('store_id')
      .eq('store_system', 'meili');

    if (checkError) {
      throw checkError;
    }

    const existingStoreIds = new Set(existingStores?.map(s => s.store_id) || []);

    // 过滤出需要添加的门店（不存在的）
    const newStores = stores
      .filter(store => !existingStoreIds.has(store.store_id))
      .map(store => ({
        store_id: store.store_id,
        store_name: store.store_name,
        store_system: 'meili',
        business_status: '服务中',
        category: '产后恢复',
      }));

    if (newStores.length === 0) {
      return NextResponse.json({
        success: true,
        message: '所有门店已存在，无需添加',
        totalStores: stores.length,
        existingCount: stores.length,
        newCount: 0,
      });
    }

    // 批量插入新门店
    const { data: inserted, error: insertError } = await supabase
      .from('stores')
      .insert(newStores)
      .select();

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({
      success: true,
      message: `成功添加 ${inserted?.length || 0} 家新门店`,
      totalStores: stores.length,
      existingCount: stores.length - newStores.length,
      newCount: inserted?.length || 0,
      data: inserted || [],
    });
  } catch (error) {
    console.error('导入门店数据失败:', error);
    return NextResponse.json(
      { error: '导入门店数据失败' },
      { status: 500 }
    );
  }
}
