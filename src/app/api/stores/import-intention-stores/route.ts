import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import * as XLSX from 'xlsx';

/**
 * 从Excel文件导入意向门店到和茶时代（去重版本）
 * POST /api/stores/import-intention-stores
 * Body: { url: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json(
        { success: false, error: '缺少Excel文件URL' },
        { status: 400 }
      );
    }

    console.log('下载Excel文件:', url);

    // 下载Excel文件
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`下载文件失败: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log('Excel文件大小:', buffer.length, 'bytes');

    // 解析Excel
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    console.log('Excel数据行数:', jsonData.length);
    console.log('Excel列名:', Object.keys(jsonData[0] || {}));

    // 查找意向门店和意向门店ID列
    const firstRow = jsonData[0] as any;
    const storeNameKey = Object.keys(firstRow).find(
      key => key === '意向门店'
    );
    const storeIdKey = Object.keys(firstRow).find(
      key => key === '意向门店ID'
    );

    if (!storeNameKey) {
      return NextResponse.json(
        { success: false, error: 'Excel中未找到"意向门店"列' },
        { status: 400 }
      );
    }

    if (!storeIdKey) {
      return NextResponse.json(
        { success: false, error: 'Excel中未找到"意向门店ID"列' },
        { status: 400 }
      );
    }

    console.log('找到列名 - 门店名称:', storeNameKey, '门店ID:', storeIdKey || '未找到');

    // 提取门店数据（按门店名称+门店ID去重）
    const intentionStores: any[] = [];
    const storeKeys = new Set<string>();

    for (const row of jsonData as any[]) {
      const storeName = row[storeNameKey];
      const storeId = storeIdKey ? row[storeIdKey] : null;

      if (storeName && storeName.trim()) {
        // 使用门店名称+门店ID作为唯一键
        const uniqueKey = `${storeName.trim()}_${storeId ? storeId.toString().trim() : ''}`;
        
        if (!storeKeys.has(uniqueKey)) {
          storeKeys.add(uniqueKey);
          intentionStores.push({
            store_name: storeName.trim(),
            store_id: storeId ? storeId.toString().trim() : null,
            store_system: 'hecha',
            business_status: '待选择',
            created_at: new Date().toISOString(),
          });
        }
      }
    }

    console.log('去重后的意向门店数量:', intentionStores.length);
    console.log('Excel原始行数:', jsonData.length);
    console.log('去重过滤掉:', jsonData.length - intentionStores.length, '条重复数据');

    if (intentionStores.length === 0) {
      return NextResponse.json(
        { success: false, error: '未找到有效的意向门店数据' },
        { status: 400 }
      );
    }

    // 连接数据库
    const supabase = getSupabaseClient();

    // 检查已存在的门店ID
    const existingStoreIds = new Set<string>();

    for (const store of intentionStores) {
      if (store.store_id) {
        const { data: existing } = await supabase
          .from('stores')
          .select('store_id')
          .eq('store_system', 'hecha')
          .eq('store_id', store.store_id)
          .maybeSingle();

        if (existing) {
          existingStoreIds.add(store.store_id);
        }
      }
    }

    // 过滤出需要添加的门店
    const storesToAdd = intentionStores.filter(
      store => !existingStoreIds.has(store.store_id)
    );

    console.log('数据库中已存在:', existingStoreIds.size, '家门店');
    console.log('需要新增的门店:', storesToAdd.length, '家');

    if (storesToAdd.length === 0) {
      return NextResponse.json({
        success: true,
        message: '所有意向门店已存在，无需添加',
        excelTotal: jsonData.length,
        deduplicated: intentionStores.length,
        skipped: existingStoreIds.size,
        added: 0,
      });
    }

    // 批量插入新门店
    const { data: inserted, error: insertError } = await supabase
      .from('stores')
      .insert(storesToAdd)
      .select();

    if (insertError) {
      throw new Error(`插入门店失败: ${insertError.message}`);
    }

    return NextResponse.json({
      success: true,
      message: `成功导入 ${inserted?.length || 0} 家意向门店`,
      excelTotal: jsonData.length,
      deduplicated: intentionStores.length,
      skipped: existingStoreIds.size,
      added: inserted?.length || 0,
      data: inserted,
    });

  } catch (error) {
    console.error('导入意向门店失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}
