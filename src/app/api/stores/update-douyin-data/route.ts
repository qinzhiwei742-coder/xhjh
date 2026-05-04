import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 从Excel文件更新门店抖音蓝V数据（抖音号ID、视频数、播放量、成交券数）
 * 逻辑：先清空该门店体系的所有旧数据，再根据新文件更新
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const storeSystem = formData.get('storeSystem') as string || 'unknown';

    if (!file) {
      return NextResponse.json({ error: '文件未上传' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 先清空该门店体系的所有旧数据（只清空抖音蓝V字段）
    console.log(`[抖音蓝V上传] 清空旧数据: storeSystem=${storeSystem}`);
    const { error: clearError } = await supabase
      .from('stores')
      .update({
        douyin_account_ids: null,
        douyin_video_count: null,
        douyin_video_play_count: null,
        douyin_deal_count: null
      })
      .eq('store_system', storeSystem);

    if (clearError) {
      console.error('[抖音蓝V上传] 清空旧数据失败:', clearError);
    }

    // 读取文件
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null, blankrows: false }) as Record<string, unknown>[];

    console.log(`[抖音蓝V上传] 总记录数: ${jsonData.length}, 门店体系: ${storeSystem}`);

    // 获取门店名称到数据库ID的映射
    const { data: stores, error: fetchError } = await supabase
      .from('stores')
      .select('id, store_name')
      .eq('store_system', storeSystem);

    if (fetchError) {
      console.error('[抖音蓝V上传] 查询门店失败:', fetchError);
      return NextResponse.json({ error: '查询门店失败' }, { status: 500 });
    }

    console.log(`[抖音蓝V上传] 数据库中该体系门店数量: ${stores?.length || 0}`);

    // 建立门店名称映射（支持一个名称对应多个门店）
    const storeNameMap = new Map<string, Array<{ id: string; name: string }>>();
    stores?.forEach(store => {
      if (store.store_name) {
        if (!storeNameMap.has(store.store_name)) {
          storeNameMap.set(store.store_name, []);
        }
        storeNameMap.get(store.store_name)!.push({
          id: store.id,
          name: store.store_name
        });
      }
    });

    console.log(`[抖音蓝V上传] 映射表大小: ${storeNameMap.size}`);

    // 按"账号所属门店"分组数据
    const storeDataMap = new Map<string, Array<{
      douyinId: string;
      videoCount: number;
      playCount: number;
      dealCount: number;
    }>>();

    for (const row of jsonData) {
      const storeName = row['账号所属门店'] as string;

      // 排除"上海壹珩健康科技有限公司"
      if (storeName === '上海壹珩健康科技有限公司') {
        continue;
      }

      if (!storeName) {
        continue;
      }

      if (!storeDataMap.has(storeName)) {
        storeDataMap.set(storeName, []);
      }

      storeDataMap.get(storeName)!.push({
        douyinId: String(row['抖音号ID'] || ''),
        videoCount: Number(row['新发布视频数']) || 0,
        playCount: Number(row['视频新增播放量']) || 0,
        dealCount: Number(row['成交券数']) || 0
      });
    }

    console.log(`[抖音蓝V上传] 分组后门店数量: ${storeDataMap.size}`);

    let totalRecords = jsonData.length;
    let updateCount = 0;
    let notFoundCount = 0;
    const errors: string[] = [];
    const notFoundStores: Array<{ rowNumber: number; storeId: string; storeName: string }> = [];

    // 统计合计
    let totalVideoCount = 0;
    let totalPlayCount = 0;
    let totalDealCount = 0;

    // 遍历门店数据，累加并更新
    for (const [storeName, accounts] of storeDataMap) {
      const matchedStores = storeNameMap.get(storeName);

      if (!matchedStores || matchedStores.length === 0) {
        notFoundCount++;
        notFoundStores.push({
          rowNumber: 0, // 分组后无法确定具体行号
          storeId: storeName,
          storeName: storeName
        });
        continue;
      }

      // 累加数据
      const douyinAccountIds = accounts.map(a => a.douyinId).join('&');
      const groupVideoCount = accounts.reduce((sum, a) => sum + a.videoCount, 0);
      const groupPlayCount = accounts.reduce((sum, a) => sum + a.playCount, 0);
      const groupDealCount = accounts.reduce((sum, a) => sum + a.dealCount, 0);

      // 累加到合计
      totalVideoCount += groupVideoCount;
      totalPlayCount += groupPlayCount;
      totalDealCount += groupDealCount;

      // 更新所有匹配的门店（可能有多个）
      for (const store of matchedStores) {
        const { error: updateError } = await supabase
          .from('stores')
          .update({
            douyin_account_ids: douyinAccountIds,
            douyin_video_count: groupVideoCount,
            douyin_video_play_count: groupPlayCount,
            douyin_deal_count: groupDealCount
          })
          .eq('id', store.id);

        if (updateError) {
          errors.push(`更新失败 ${storeName}: ${updateError.message}`);
          console.error(`[抖音蓝V上传] 更新失败 ${storeName}:`, updateError);
        } else {
          updateCount++;
        }
      }
    }

    console.log(`[抖音蓝V上传] 完成:
      总记录: ${totalRecords},
      更新成功: ${updateCount},
      未找到: ${notFoundCount},
      错误: ${errors.length},
      合计 - 视频数: ${totalVideoCount},
      合计 - 播放量: ${totalPlayCount},
      合计 - 成交数: ${totalDealCount}`);

    if (notFoundStores.length > 0) {
      console.log('[抖音蓝V上传] 未找到的门店列表:', notFoundStores);
    }

    return NextResponse.json({
      success: true,
      message: `成功更新 ${updateCount} 家门店信息`,
      totalRecords,
      updatedCount: updateCount,
      notFoundCount,
      errorCount: errors.length,
      errors: errors.slice(0, 10),
      notFoundStores: notFoundStores,
      totalVideoCount,
      totalPlayCount,
      totalDealCount
    });
  } catch (error) {
    console.error('[抖音蓝V上传] 失败:', error);
    return NextResponse.json(
      { error: '上传失败', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
