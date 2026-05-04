import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  try {
    console.log('[职人数据上传] 开始处理请求...');
    
    const formData = await request.formData();
    const file1 = formData.get('file1') as File;
    const file2 = formData.get('file2') as File;
    const storeSystem = formData.get('storeSystem') as string || 'mama';

    console.log('[职人数据上传] storeSystem:', storeSystem);
    console.log('[职人数据上传] 文件1:', file1?.name);
    console.log('[职人数据上传] 文件2:', file2?.name);

    if (!file1 && !file2) {
      return NextResponse.json({ error: '未上传文件' }, { status: 400 });
    }

    // 读取Excel文件
    let allRows: any[] = [];
    let sourceFiles: string[] = [];
    
    if (file1) {
      const buffer1 = Buffer.from(await file1.arrayBuffer());
      const workbook1 = XLSX.read(buffer1);
      const worksheet1 = workbook1.Sheets[workbook1.SheetNames[0]];
      const rows1 = XLSX.utils.sheet_to_json(worksheet1, { defval: null, blankrows: false });
      allRows = allRows.concat(rows1.map((row: any, idx) => ({ ...row, _sourceFile: file1.name, _rowNumber: idx + 2 })));
      sourceFiles.push(file1.name);
      console.log('[职人数据上传] 文件1记录数:', rows1.length);
    }
    
    if (file2) {
      const buffer2 = Buffer.from(await file2.arrayBuffer());
      const workbook2 = XLSX.read(buffer2);
      const worksheet2 = workbook2.Sheets[workbook2.SheetNames[0]];
      const rows2 = XLSX.utils.sheet_to_json(worksheet2, { defval: null, blankrows: false });
      allRows = allRows.concat(rows2.map((row: any, idx) => ({ ...row, _sourceFile: file2.name, _rowNumber: idx + 2 })));
      sourceFiles.push(file2.name);
      console.log('[职人数据上传] 文件2记录数:', rows2.length);
    }

    console.log('[职人数据上传] 合并后总记录数:', allRows.length);

    if (allRows.length === 0) {
      return NextResponse.json({ error: 'Excel文件为空' }, { status: 400 });
    }

    // 打印前3行看看数据
    console.log('[职人数据上传] 前3行数据:');
    for (let i = 0; i < Math.min(3, allRows.length); i++) {
      console.log(`[职人数据上传] 第${i+2}行:`, allRows[i]);
    }

    // 打印所有可用列名
    console.log('[职人数据上传] 所有可用列名:', Object.keys(allRows[0] || {}));

    // 获取数据库中的门店
    const supabase = getSupabaseClient();
    const { data: stores, error: fetchError } = await supabase
      .from('stores')
      .select('id, store_id, store_name, store_system')
      .eq('store_system', storeSystem);

    if (fetchError) {
      console.error('[职人数据上传] 获取门店失败:', fetchError);
      return NextResponse.json({ error: '获取门店失败' }, { status: 500 });
    }

    console.log('[职人数据上传] 数据库中该体系门店数量:', stores?.length || 0);

    if (!stores || stores.length === 0) {
      return NextResponse.json({ error: '未找到该门店体系的门店数据' }, { status: 400 });
    }

    // 构建门店ID映射表
    const storeIdMap = new Map<string, { id: string; storeName: string }>();
    stores.forEach(store => {
      if (store.store_id) {
        const storeIdStr = String(store.store_id);
        storeIdMap.set(storeIdStr, { id: store.id, storeName: store.store_name });
        if (storeIdStr.trim() !== storeIdStr) {
          storeIdMap.set(storeIdStr.trim(), { id: store.id, storeName: store.store_name });
        }
      }
    });

    console.log('[职人数据上传] 映射表大小:', storeIdMap.size);

    // 清空策略：只清空相同门店体系 + 相同来源文件的数据
    // - 上传file1：清空该门店体系中source_file包含file1名称的记录
    // - 上传file2：清空该门店体系中source_file包含file2名称的记录
    // - 同时上传：清空该门店体系中两个来源的记录
    
    // 构建要清空的文件名称列表
    const filesToClear: string[] = [];
    if (file1) filesToClear.push(file1.name);
    if (file2) filesToClear.push(file2.name);
    
    console.log('[职人数据上传] 需要清空的文件来源:', filesToClear);
    
    if (filesToClear.length > 0) {
      // 逐个文件清空（Supabase不支持OR条件的delete，需要逐个处理）
      for (const fileName of filesToClear) {
        console.log(`[职人数据上传] 清空 ${storeSystem} 体系中来源为 ${fileName} 的数据...`);
        
        // 使用ilike匹配文件名，因为文件名可能有变化
        const { error: deleteError } = await supabase
          .from('staff_details')
          .delete()
          .eq('store_system', storeSystem)
          .ilike('source_file', `%${fileName}%`);

        if (deleteError) {
          console.error(`[职人数据上传] 清空 ${fileName} 数据失败:`, deleteError);
        } else {
          console.log(`[职人数据上传] 清空 ${fileName} 数据成功`);
        }
      }
    }

    // 处理每条记录
    const notFoundStores: Array<{ rowNumber: number; storeId: string; storeName: string; sourceFile: string }> = [];
    const staffDetailsToInsert: any[] = [];
    let processedRecordsCount = 0;

    // 辅助函数：解析数字
    const parseNumber = (value: any): number => {
      if (value === null || value === undefined || value === '') return 0;
      const num = Number(value);
      return isNaN(num) ? 0 : num;
    };

    // 辅助函数：解析字符串
    const parseString = (value: any): string | null => {
      if (value === null || value === undefined || value === '') return null;
      return String(value).trim();
    };

    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      const rowNumber = row._rowNumber;
      const sourceFile = row._sourceFile;

      // 获取绑定门店ID
      const boundStoreId = row['绑定门店ID'] || row['绑定门店'] || row['门店ID'];

      if (!boundStoreId) {
        continue;
      }

      const boundStoreIdStr = String(boundStoreId).trim();
      const storeInfo = storeIdMap.get(boundStoreIdStr);

      if (!storeInfo) {
        console.log(`[职人数据上传] 未找到门店: ${boundStoreIdStr}`);
        notFoundStores.push({
          rowNumber,
          storeId: boundStoreIdStr,
          storeName: row['门店名称'] || boundStoreIdStr,
          sourceFile
        });
        continue;
      }

      processedRecordsCount++;

      // 提取所有65个字段
      const staffDetail = {
        store_id: storeInfo.id,
        store_system: storeSystem,
        
        // Excel字段
        date_range: parseString(row['日期范围']),
        staff_uid: parseString(row['职人uid']),
        staff_nickname: parseString(row['职人昵称']),
        douyin_account: parseString(row['抖音号']),
        operator_name: parseString(row['运营员工姓名（仅商家职人号）']),
        bound_store_name: parseString(row['绑定门店']),
        area: parseString(row['所属区域']),
        position: parseString(row['职位']),
        title: parseString(row['头衔']),
        contract_status: parseString(row['签约状态']),
        staff_type: parseString(row['职人号类型']),
        employee_id: parseString(row['工号']),
        remark: parseString(row['备注']),
        brand: parseString(row['品牌']),
        team: parseString(row['团队']),
        bound_store_id: boundStoreIdStr,
        staff_fans_count: parseNumber(row['职人粉丝数']),
        is_violated: parseString(row['是否违规']),
        valid_fans: parseNumber(row['有效粉丝']),
        new_permission: parseString(row['新规则下的带货权限']),
        staff_deal_amount: parseNumber(row['职人成交金额（元）']),
        staff_deal_coupon_count: parseNumber(row['职人成交券数']),
        staff_deal_order_count: parseNumber(row['职人成交订单数']),
        staff_verify_amount: parseNumber(row['职人核销金额（元）']),
        staff_verify_coupon_count: parseNumber(row['职人核销券数']),
        staff_incentive_amount: parseNumber(row['职人激励金支出金额（元）']),
        live_deal_amount: parseNumber(row['直播成交金额（元）']),
        video_deal_amount: parseNumber(row['视频成交金额（元）']),
        short_video_deal_amount: parseNumber(row['短视频成交金额(不含AIGC,元)']),
        douyin_home_deal_amount: parseNumber(row['抖音号主页成交金额（元）']),
        staff_card_deal_amount: parseNumber(row['职人名片成交金额（元）']),
        social_share_deal_amount: parseNumber(row['社交分享成交金额（元）']),
        live_session_count: parseNumber(row['直播场次数']),
        live_deal_order_count: parseNumber(row['直播成交订单数']),
        live_view_count: parseNumber(row['直播观看人次']),
        live_thousand_view_deal_amount: parseNumber(row['直播千次观看成交金额']),
        live_view_to_deal_conversion_rate: parseString(row['直播观看-成交转化率']),
        live_avg_deal_amount: parseNumber(row['直播场均成交金额（元）']),
        live_duration: parseNumber(row['直播时长（秒）']),
        video_count: parseNumber(row['发布视频数']),
        video_count_excluding_aigc: parseNumber(row['发布视频数(不含AIGC)']),
        video_deal_order_count: parseNumber(row['视频成交订单数']),
        video_deal_order_count_excluding_aigc: parseNumber(row['视频成交订单数(不含AIGC)']),
        exposure_count: parseNumber(row['视频播放次数']),
        video_play_count_excluding_aigc: parseNumber(row['视频播放次数(不含AIGC)']),
        video_thousand_play_deal_amount: parseNumber(row['视频千次播放成交金额']),
        video_view_to_deal_conversion_rate: parseString(row['视频观看-成交转化率']),
        video_comment_count: parseNumber(row['视频评论数']),
        video_like_count: parseNumber(row['视频点赞数']),
        video_share_count: parseNumber(row['视频转发次数']),
        store_page_traffic_count: parseNumber(row['门店页引流人次']),
        douyin_home_page_view_count: parseNumber(row['抖音号主页访问量']),
        lead_count: parseNumber(row['线索量']),
        staff_card_view_count: parseNumber(row['职人名片访问量']),
        scan_deal_amount: parseNumber(row['扫码成交金额（元）']),
        scan_deal_coupon_count: parseNumber(row['扫码成交券数']),
        scan_verify_amount: parseNumber(row['扫码核销金额（元）']),
        scan_verify_coupon_count: parseNumber(row['扫码核销券数']),
        scan_user_count: parseNumber(row['扫码用户数']),
        platform_commission_incentive_amount: parseNumber(row['平台分佣激励金额（元）']),
        total_evaluation_count: parseNumber(row['总评价数']),
        good_evaluation_count: parseNumber(row['好评数']),
        staff_good_evaluation_rate: parseString(row['职人好评率']),
        is_special: parseString(row['是否特约']),
        store_type: parseString(row['门店类型']),
        
        // 系统字段
        row_number: rowNumber,
        source_file: sourceFile
      };

      // 只插入符合签约状态的记录：签约完成、运营中
      if (staffDetail.contract_status === '签约完成' || staffDetail.contract_status === '运营中') {
        staffDetailsToInsert.push(staffDetail);
      }
    }

    console.log('[职人数据上传] 准备插入的职人明细数:', staffDetailsToInsert.length);
    console.log('[职人数据上传] 未找到门店数:', notFoundStores.length);

    // 批量插入职人明细
    if (staffDetailsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('staff_details')
        .insert(staffDetailsToInsert);

      if (insertError) {
        console.error('[职人数据上传] 插入职人明细失败:', insertError);
        return NextResponse.json({ error: '插入职人明细失败' }, { status: 500 });
      }
    }

    // 统计数据（只插入符合签约状态的：签约完成、运营中）
    const totalStaffCount = staffDetailsToInsert.length;
    const totalVideoCount = staffDetailsToInsert.reduce((sum, d) => sum + (d.video_count || 0), 0);
    const totalExposureCount = staffDetailsToInsert.reduce((sum, d) => sum + (d.exposure_count || 0), 0);

    console.log('[职人数据上传] 统计结果:', {
      totalRecords: allRows.length,
      processedRecordsCount,
      validRecordsCount: staffDetailsToInsert.length,
      totalStaffCount,
      totalVideoCount,
      totalExposureCount,
      updatedStores: new Set(staffDetailsToInsert.map(d => d.store_id)).size
    });

    return NextResponse.json({
      success: true,
      totalRecords: allRows.length,                    // 表格内总条数
      staffCount: totalStaffCount,                     // 职人数（符合签约状态的）
      updatedCount: staffDetailsToInsert.length,      // 更新成功（插入的记录数，全部插入）
      videoCount: totalVideoCount,                     // 视频数（只统计符合签约状态的）
      exposureCount: totalExposureCount,               // 职人曝光量（只统计符合签约状态的）
      notFoundCount: notFoundStores.length,            // 更新失败（未找到门店）
      notFoundStores: notFoundStores.map(s => ({ rowNumber: s.rowNumber, storeId: s.storeId, storeName: s.storeName })),
      skippedStores: [],
      updateErrors: []
    });
  } catch (error) {
    console.error('[职人数据上传] 处理失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '处理失败' },
      { status: 500 }
    );
  }
}