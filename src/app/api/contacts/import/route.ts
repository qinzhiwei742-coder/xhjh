import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import * as XLSX from 'xlsx';

interface ImportContactData {
  '门店ID'?: string;
  '门店名称'?: string;
  '联系人姓名': string;
  '职位'?: string;
  '电话'?: string;
  '微信'?: string;
  '备注'?: string;
  '首选联系人'?: string;
}

interface ImportResult {
  success: boolean;
  message: string;
  data?: {
    created: number;
    updated: number;
    errors: Array<{ row: number; message: string; contactName: string }>;
  };
}

/**
 * 导入联系人数据
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
    const jsonData = XLSX.utils.sheet_to_json<ImportContactData[]>(worksheet);

    if (jsonData.length === 0) {
      return NextResponse.json({ error: '文件中没有数据' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const errors: Array<{ row: number; message: string; contactName: string }> = [];
    let created = 0;
    let updated = 0;

    // 获取门店ID到UUID的映射
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
    const jsonDataTyped = jsonData as unknown as ImportContactData[];
    const filteredData: ImportContactData[] = storeSystem === 'all' 
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
        let storeUuid = storeIdMap[storeId || ''] || storeIdMap[storeName || ''];

        if (!storeUuid) {
          errors.push({
            row: rowNum,
            message: `未找到门店: ${storeId || storeName}`,
            contactName: row['联系人姓名']
          });
          continue;
        }

        // 检查是否已存在相同联系人
        const { data: existingContacts } = await supabase
          .from('contacts')
          .select('id')
          .eq('store_id', storeUuid)
          .eq('name', row['联系人姓名'])
          .eq('phone', row['电话'] || null);

        const isPrimary = row['首选联系人'] === '是';

        if (existingContacts && existingContacts.length > 0) {
          // 更新现有联系人
          const { error } = await supabase
            .from('contacts')
            .update({
              position: row['职位'] || null,
              phone: row['电话'] || null,
              wechat: row['微信'] || null,
              remark: row['备注'] || null,
              is_primary: isPrimary,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingContacts[0].id);

          if (error) {
            errors.push({
              row: rowNum,
              message: `更新失败: ${error.message}`,
              contactName: row['联系人姓名']
            });
          } else {
            updated++;
          }
        } else {
          // 创建新联系人
          const { error } = await supabase
            .from('contacts')
            .insert({
              store_id: storeUuid,
              name: row['联系人姓名'],
              position: row['职位'] || null,
              phone: row['电话'] || null,
              wechat: row['微信'] || null,
              remark: row['备注'] || null,
              is_primary: isPrimary
            });

          if (error) {
            errors.push({
              row: rowNum,
              message: `创建失败: ${error.message}`,
              contactName: row['联系人姓名']
            });
          } else {
            created++;
          }
        }
      } catch (err) {
        errors.push({
          row: rowNum,
          message: `处理失败: ${(err as Error).message}`,
          contactName: row['联系人姓名']
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
    console.error('导入联系人失败:', error);
    return NextResponse.json(
      { error: '导入联系人失败' },
      { status: 500 }
    );
  }
}
