import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 批量导入联系人
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { contacts } = body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json(
        { success: false, error: '缺少联系人数据' },
        { status: 400 }
      );
    }

    console.log('批量导入联系人:', contacts.length, '条');

    // 首先获取所有门店的 store_id -> id 映射
    const storeIds = contacts.map(c => c.storeId).filter(Boolean);
    const { data: stores, error: storesError } = await client
      .from('stores')
      .select('id, store_id')
      .in('store_id', storeIds);

    if (storesError) {
      console.error('获取门店错误:', storesError);
      throw new Error(`获取门店失败: ${storesError.message}`);
    }

    // 建立 store_id -> id 的映射
    const storeIdMap = new Map<string, string>();
    stores?.forEach(store => {
      if (store.store_id) {
        storeIdMap.set(store.store_id, store.id);
      }
    });

    console.log('找到门店数量:', storeIdMap.size);

    // 准备插入的数据
    const insertData = [];
    const errors = [];

    for (const contact of contacts) {
      if (!contact.storeId) {
        errors.push({ contact, error: '缺少门店ID' });
        continue;
      }

      const storeUuid = storeIdMap.get(contact.storeId);
      if (!storeUuid) {
        errors.push({ contact, error: `门店ID ${contact.storeId} 不存在` });
        continue;
      }

      if (!contact.name) {
        errors.push({ contact, error: '缺少姓名' });
        continue;
      }

      insertData.push({
        store_id: storeUuid,
        name: contact.name,
        position: contact.position || null,
        phone: contact.phone || null,
        wechat: contact.wechat || null,
        remark: contact.remark || null,
        is_primary: contact.isPrimary || false,
      });
    }

    console.log('准备插入联系人数量:', insertData.length, ', 错误数量:', errors.length);

    let insertedCount = 0;
    let updatedCount = 0;

    if (insertData.length > 0) {
      // 对于每个联系人，检查是否已存在（同一门店+同一姓名+同一电话），如果存在则更新
      for (const contact of insertData) {
        // 检查是否已存在
        const { data: existing } = await client
          .from('contacts')
          .select('id')
          .eq('store_id', contact.store_id)
          .eq('name', contact.name)
          .eq('phone', contact.phone || '')
          .single();

        if (existing) {
          // 更新已有联系人
          const { error: updateError } = await client
            .from('contacts')
            .update({
              position: contact.position,
              wechat: contact.wechat,
              remark: contact.remark,
            })
            .eq('id', existing.id);

          if (updateError) {
            errors.push({ contact, error: `更新失败: ${updateError.message}` });
          } else {
            updatedCount++;
          }
        } else {
          // 插入新联系人
          const { error: insertError } = await client
            .from('contacts')
            .insert(contact);

          if (insertError) {
            errors.push({ contact, error: `插入失败: ${insertError.message}` });
          } else {
            insertedCount++;
          }
        }
      }
    }

    console.log('导入完成: 新增', insertedCount, ', 更新', updatedCount, ', 失败', errors.length);

    return NextResponse.json({
      success: true,
      data: {
        total: contacts.length,
        inserted: insertedCount,
        updated: updatedCount,
        failed: errors.length,
        errors: errors.slice(0, 20), // 只返回前20个错误
      },
    });
  } catch (error) {
    console.error('批量导入联系人失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '批量导入联系人失败' },
      { status: 500 }
    );
  }
}
