import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import * as XLSX from 'xlsx';

/**
 * 更新门店状态和添加联系人信息
 * POST /api/stores/update-from-managed
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

    console.log('下载共管门店记录Excel文件...');

    // 下载Excel文件
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`下载文件失败: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 解析Excel
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    console.log('Excel数据行数:', jsonData.length);

    // 提取共管门店信息
    const managedStores = new Map<string, {
      storeName: string;
      province: string | null;
      city: string | null;
      phones: string[];
    }>();

    for (const row of jsonData as any[]) {
      const storeName = row['门店名称'];
      const storeId = row['门店ID']?.toString();
      const province = row['省份']?.toString() || null;
      const city = row['城市']?.toString() || null;

      // 提取电话号码
      const phones: string[] = [];
      if (row['营业电话1'] && row['营业电话1'] !== '-' && row['营业电话1'].trim()) {
        phones.push(row['营业电话1'].trim());
      }
      if (row['营业电话2'] && row['营业电话2'] !== '-' && row['营业电话2'].trim()) {
        phones.push(row['营业电话2'].trim());
      }
      if (row['营业电话3'] && row['营业电话3'] !== '-' && row['营业电话3'].trim()) {
        phones.push(row['营业电话3'].trim());
      }

      if (storeName && storeId) {
        managedStores.set(storeId, {
          storeName,
          province,
          city,
          phones,
        });
      }
    }

    console.log('提取共管门店数量:', managedStores.size);

    const supabase = getSupabaseClient();

    // 1. 获取所有和茶时代门店
    const { data: allStores, error: fetchError } = await supabase
      .from('stores')
      .select('id, store_name, store_id, business_status, province, city')
      .eq('store_system', 'hecha');

    if (fetchError) {
      throw new Error(`获取门店列表失败: ${fetchError.message}`);
    }

    console.log('当前门店总数:', allStores?.length || 0);

    if (!allStores || allStores.length === 0) {
      return NextResponse.json({
        success: true,
        message: '没有需要更新的门店',
        managedStoreCount: managedStores.size,
      });
    }

    // 2. 批量更新门店状态和信息
    const managedStoreIds = Array.from(managedStores.keys());
    let updatedCount = 0;
    let cancelledCount = 0;

    for (const store of allStores) {
      if (managedStores.has(store.store_id)) {
        // 在共管列表中：更新为"服务中"，并更新省市信息
        const managedInfo = managedStores.get(store.store_id)!;

        const { error: updateError } = await supabase
          .from('stores')
          .update({
            business_status: '服务中',
            province: managedInfo.province,
            city: managedInfo.city,
            updated_at: new Date().toISOString(),
          })
          .eq('id', store.id);

        if (updateError) {
          console.error('更新门店失败:', store.store_name, updateError);
        } else {
          updatedCount++;
          console.log(`更新门店: ${store.store_name} -> 服务中, ${managedInfo.province} ${managedInfo.city}`);

          // 3. 添加联系人（电话号码）
          if (managedInfo.phones.length > 0) {
            // 先检查是否已有联系人
            const { data: existingContacts } = await supabase
              .from('contacts')
              .select('id, phone')
              .eq('store_id', store.id);

            const existingPhones = new Set(
              existingContacts?.map((c: any) => c.phone) || []
            );

            // 添加新的联系人
            for (const phone of managedInfo.phones) {
              if (!existingPhones.has(phone)) {
                const { error: insertContactError } = await supabase
                  .from('contacts')
                  .insert({
                    store_id: store.id,
                    name: '营业电话',
                    phone: phone,
                    is_primary: existingPhones.size === 0, // 第一个联系人设为首选
                  });

                if (insertContactError) {
                  console.error('添加联系人失败:', phone, insertContactError);
                } else {
                  console.log(`  添加联系人: ${phone}`);
                }
              }
            }
          }
        }
      } else {
        // 不在共管列表中：更新为"取消合作"
        if (store.business_status !== '取消合作') {
          const { error: updateError } = await supabase
            .from('stores')
            .update({
              business_status: '取消合作',
              updated_at: new Date().toISOString(),
            })
            .eq('id', store.id);

          if (updateError) {
            console.error('更新门店失败:', store.store_name, updateError);
          } else {
            cancelledCount++;
            console.log(`取消门店: ${store.store_name} -> 取消合作`);
          }
        }
      }
    }

    console.log('更新完成 - 服务中:', updatedCount, '取消合作:', cancelledCount);

    return NextResponse.json({
      success: true,
      message: `成功更新门店状态`,
      stats: {
        totalStores: allStores.length,
        managedStores: managedStoreIds.length,
        updatedToServing: updatedCount,
        updatedToCancelled: cancelledCount,
      },
    });

  } catch (error) {
    console.error('更新门店状态失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}
