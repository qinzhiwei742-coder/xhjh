import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import * as XLSX from 'xlsx';

interface ImportTagData {
  '门店ID'?: string;
  '门店名称'?: string;
  '标签名称': string;
  '标签颜色'?: string;
}

interface ImportResult {
  success: boolean;
  message: string;
  data?: {
    created: number;
    skipped: number;
    errors: Array<{ row: number; message: string; tagName: string }>;
  };
}

/**
 * 导入门店标签数据
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
    const jsonData = XLSX.utils.sheet_to_json<ImportTagData[]>(worksheet);

    if (jsonData.length === 0) {
      return NextResponse.json({ error: '文件中没有数据' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const errors: Array<{ row: number; message: string; tagName: string }> = [];
    let created = 0;
    let skipped = 0;

    // 获取门店信息
    const { data: stores } = await supabase
      .from('stores')
      .select('id, store_id, store_name, store_system');

    const storeIdMap: Record<string, string> = {};
    (stores || []).forEach(store => {
      if (store.store_id) {
        storeIdMap[store.store_id] = store.id;
      }
      if (store.store_name) {
        storeIdMap[store.store_name] = store.id;
      }
    });

    // 过滤指定门店体系的数据
    const jsonDataTyped = jsonData as unknown as ImportTagData[];
    const filteredData: ImportTagData[] = storeSystem === 'all' 
      ? jsonDataTyped
      : jsonDataTyped.filter(row => {
          const storeId = row['门店ID'];
          const storeName = row['门店名称'];
          const store = stores?.find(s => 
            (storeId && s.store_id === storeId) || 
            (storeName && s.store_name === storeName)
          );
          return store?.store_system === storeSystem;
        });

    // 处理每条记录
    for (let i = 0; i < filteredData.length; i++) {
      const row = filteredData[i];
      const rowNum = i + 2; // Excel行号（1是表头）

      try {
        // 通过门店ID或门店名称查找门店UUID
        const storeId = row['门店ID'];
        const storeName = row['门店名称'];
        const storeUuid = storeIdMap[storeId || ''] || storeIdMap[storeName || ''];

        if (!storeUuid) {
          errors.push({
            row: rowNum,
            message: `未找到门店: ${storeId || storeName}`,
            tagName: row['标签名称']
          });
          continue;
        }

        // 检查是否已存在相同标签
        const { data: existingTags } = await supabase
          .from('store_tags')
          .select('id')
          .eq('store_id', storeUuid)
          .eq('tag_name', row['标签名称']);

        if (existingTags && existingTags.length > 0) {
          // 已存在，跳过
          skipped++;
          continue;
        }

        // 创建新标签
        const { error } = await supabase
          .from('store_tags')
          .insert({
            store_id: storeUuid,
            tag_name: row['标签名称'],
            tag_color: row['标签颜色'] || '#165dff'
          });

        if (error) {
          errors.push({
            row: rowNum,
            message: `创建失败: ${error.message}`,
            tagName: row['标签名称']
          });
        } else {
          created++;
        }
      } catch (err) {
        errors.push({
          row: rowNum,
          message: `处理失败: ${(err as Error).message}`,
          tagName: row['标签名称']
        });
      }
    }

    const result: ImportResult = {
      success: errors.length === 0,
      message: `导入完成：新增 ${created} 条，跳过 ${skipped} 条${
        errors.length > 0 ? `，失败 ${errors.length} 条` : ''
      }`,
      data: { created, skipped, errors }
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('导入标签失败:', error);
    return NextResponse.json(
      { error: '导入标签失败' },
      { status: 500 }
    );
  }
}
