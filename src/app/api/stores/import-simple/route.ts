import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import * as XLSX from 'xlsx';

interface ImportStoreData {
  '门店ID'?: string;
  '门店名称': string;
  '品类'?: string;
  '商户名称'?: string;
  '商户ID'?: string;
  '商户电话'?: string;
  '省份'?: string;
  '城市'?: string;
  '地址'?: string;
  '入驻状态'?: string;
  '服务状态'?: string;
  '门店等级'?: string;
  '营业电话1'?: string;
  '营业电话2'?: string;
  '营业电话3'?: string;
  '门店面积'?: string;
  '员工人数'?: string;
  '获客渠道'?: string;
  '门店体系'?: string;
}

interface ImportResult {
  success: boolean;
  message: string;
  data?: {
    created: number;
    updated: number;
    errors: Array<{ row: number; message: string; storeName: string }>;
  };
}

/**
 * 导入门店数据
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const storeSystem = formData.get('storeSystem') as string || 'all';

    if (!file) {
      return NextResponse.json({ error: '请选择文件' }, { status: 400 });
    }

    // 读取文件
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<ImportStoreData[]>(worksheet);

    if (jsonData.length === 0) {
      return NextResponse.json({ error: '文件中没有数据' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const errors: Array<{ row: number; message: string; storeName: string }> = [];
    let created = 0;
    let updated = 0;

    // 门店体系名称到值的映射
    const systemNameToValue: Record<string, string> = {
      '美丽妈妈': 'meili',
      '妈妈盒子': 'mama',
      '和茶时代': 'hecha'
    };

    // 获取现有门店用于去重检查
    const { data: existingStores } = await supabase
      .from('stores')
      .select('id, store_id, store_name');

    const storeIdSet = new Set((existingStores || []).map(s => s.store_id).filter(Boolean));
    const storeNameSet = new Set((existingStores || []).map(s => s.store_name).filter(Boolean));

    // 过滤指定门店体系的数据
    const jsonDataTyped = jsonData as unknown as ImportStoreData[];
    const filteredData: ImportStoreData[] = storeSystem === 'all' 
      ? jsonDataTyped
      : jsonDataTyped.filter(row => {
          const systemName = row['门店体系'];
          const systemValue = systemNameToValue[systemName || ''] || systemName;
          return systemValue === storeSystem;
        });

    // 处理每条记录
    for (let i = 0; i < filteredData.length; i++) {
      const row = filteredData[i];
      const rowNum = i + 2; // Excel行号（1是表头）

      try {
        // 确定门店体系
        let storeSystemValue = storeSystem === 'all' ? 'hecha' : storeSystem;
        const systemName = row['门店体系'];
        if (systemName && systemNameToValue[systemName]) {
          storeSystemValue = systemNameToValue[systemName];
        } else if (['meili', 'mama', 'hecha'].includes(systemName || '')) {
          storeSystemValue = systemName!;
        }

        // 检查是否已存在（通过门店ID或门店名称）
        const existingStore = (existingStores || []).find(s => 
          (row['门店ID'] && s.store_id === row['门店ID']) ||
          (row['门店名称'] && s.store_name === row['门店名称'])
        );

        const storeData = {
          store_id: row['门店ID'] || null,
          store_name: row['门店名称'],
          category: row['品类'] || null,
          merchant_name: row['商户名称'] || null,
          merchant_id: row['商户ID'] || null,
          merchant_phone: row['商户电话'] || null,
          province: row['省份'] || null,
          city: row['城市'] || null,
          address: row['地址'] || null,
          attach_status: row['入驻状态'] || null,
          business_status: row['服务状态'] || null,
          phone1: row['营业电话1'] || null,
          phone2: row['营业电话2'] || null,
          phone3: row['营业电话3'] || null,
          store_area: row['门店面积'] || null,
          staff_count: row['员工人数'] || null,
          customer_channel: row['获客渠道'] || null,
          store_system: storeSystemValue,
          updated_at: new Date().toISOString()
        };

        if (existingStore) {
          // 更新现有门店
          const { error } = await supabase
            .from('stores')
            .update(storeData)
            .eq('id', existingStore.id);

          if (error) {
            errors.push({
              row: rowNum,
              message: `更新失败: ${error.message}`,
              storeName: row['门店名称']
            });
          } else {
            updated++;
          }
        } else {
          // 创建新门店
          const { error } = await supabase
            .from('stores')
            .insert({
              ...storeData,
              created_at: new Date().toISOString()
            });

          if (error) {
            errors.push({
              row: rowNum,
              message: `创建失败: ${error.message}`,
              storeName: row['门店名称']
            });
          } else {
            created++;
            // 更新本地缓存
            if (row['门店ID']) storeIdSet.add(row['门店ID']);
            storeNameSet.add(row['门店名称']);
          }
        }
      } catch (err) {
        errors.push({
          row: rowNum,
          message: `处理失败: ${(err as Error).message}`,
          storeName: row['门店名称']
        });
      }
    }

    const result: ImportResult = {
      success: errors.length === 0,
      message: `导入完成：新增 ${created} 条，更新 ${updated} 条${
        errors.length > 0 ? `，失败 ${errors.length} 条` : ''
      }`,
      data: { created, updated, errors }
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('导入门店失败:', error);
    return NextResponse.json(
      { error: '导入门店失败' },
      { status: 500 }
    );
  }
}
