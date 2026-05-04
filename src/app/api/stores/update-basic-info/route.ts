import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 从Excel文件更新门店基础信息（经营评分、新增好评数、新增中差评数）
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

    // 先清空该门店体系的所有旧数据
    console.log(`[基础信息上传] 清空旧数据: storeSystem=${storeSystem}`);
    const { error: clearError } = await supabase
      .from('stores')
      .update({
        business_score: null,
        new_positive_review_count: null,
        new_negative_review_count: null
      })
      .eq('store_system', storeSystem);

    if (clearError) {
      console.error('[基础信息上传] 清空旧数据失败:', clearError);
    }

    // 读取文件
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null, blankrows: false }) as Record<string, unknown>[];
    
    console.log(`[基础信息上传] 总记录数: ${jsonData.length}, 门店体系: ${storeSystem}`);
    
    // 获取门店ID到数据库ID的映射
    const { data: stores, error: fetchError } = await supabase
      .from('stores')
      .select('id, store_id, store_name')
      .eq('store_system', storeSystem);
    
    if (fetchError) {
      console.error('[基础信息上传] 查询门店失败:', fetchError);
      return NextResponse.json({ error: '查询门店失败' }, { status: 500 });
    }
    
    console.log(`[基础信息上传] 数据库中该体系门店数量: ${stores?.length || 0}`);
    
    const storeIdMap = new Map<string, { id: string; name: string | null }>();
    stores?.forEach(store => {
      if (store.store_id) {
        const trimmedId = String(store.store_id).trim();
        storeIdMap.set(String(store.store_id), { id: store.id, name: store.store_name });
        storeIdMap.set(trimmedId, { id: store.id, name: store.store_name });
      }
    });
    
    console.log(`[基础信息上传] 映射表大小(包含trim): ${storeIdMap.size}`);
    
    let totalRecords = jsonData.length;
    let businessScoreOnly = 0;
    let positiveReviewOnly = 0;
    let negativeReviewOnly = 0;
    let businessAndPositive = 0;
    let businessAndNegative = 0;
    let positiveAndNegative = 0;
    let allThree = 0;
    let updateCount = 0;
    let notFoundCount = 0;
    let skippedNoDataCount = 0;
    const errors: string[] = [];
    const notFoundStores: Array<{ row: number; storeId: string; storeName: string | null }> = [];
    
    for (let rowIndex = 0; rowIndex < jsonData.length; rowIndex++) {
      const row = jsonData[rowIndex];
      try {
        const storeId = row['门店ID'] || row['门店id'] || row['store_id'];
        const businessScore = row['经营分'] || row['经营评分'] || row['门店经营分'] || row['business_score'];
        const newPositiveReviewCount = row['新增好评数'] || row['好评数'] || row['positive_review_count'];
        const newNegativeReviewCount = row['新增中差评数'] || row['中差评数'] || row['negative_review_count'];
        const storeName = row['门店名称'] || null;
        
        if (!storeId) {
          errors.push(`第${rowIndex + 1}行缺少门店ID: ${JSON.stringify(row)}`);
          continue;
        }
        
        let storeInfo = storeIdMap.get(String(storeId));
        if (!storeInfo) {
          storeInfo = storeIdMap.get(String(storeId).trim());
        }
        
        if (!storeInfo) {
          notFoundCount++;
          notFoundStores.push({
            row: rowIndex + 1,
            storeId: String(storeId),
            storeName: storeName as string | null
          });
          continue;
        }
        
        const updateData: Record<string, unknown> = {};
        const hasBusinessScore = businessScore !== null && businessScore !== undefined;
        const hasPositiveReview = newPositiveReviewCount !== null && newPositiveReviewCount !== undefined;
        const hasNegativeReview = newNegativeReviewCount !== null && newNegativeReviewCount !== undefined;
        
        if (hasBusinessScore) {
          if (businessScore === '' || businessScore === '-') {
            updateData.business_score = null;
          } else {
            const score = Number(businessScore);
            if (!isNaN(score)) {
              updateData.business_score = score;
            }
          }
        }
        
        if (hasPositiveReview) {
          if (newPositiveReviewCount === '' || newPositiveReviewCount === '-') {
            updateData.new_positive_review_count = null;
          } else {
            const count = Number(newPositiveReviewCount);
            if (!isNaN(count)) {
              updateData.new_positive_review_count = count;
            }
          }
        }
        
        if (hasNegativeReview) {
          if (newNegativeReviewCount === '' || newNegativeReviewCount === '-') {
            updateData.new_negative_review_count = null;
          } else {
            const count = Number(newNegativeReviewCount);
            if (!isNaN(count)) {
              updateData.new_negative_review_count = count;
            }
          }
        }
        
        if (Object.keys(updateData).length > 0) {
          if (hasBusinessScore && !hasPositiveReview && !hasNegativeReview) {
            businessScoreOnly++;
          } else if (!hasBusinessScore && hasPositiveReview && !hasNegativeReview) {
            positiveReviewOnly++;
          } else if (!hasBusinessScore && !hasPositiveReview && hasNegativeReview) {
            negativeReviewOnly++;
          } else if (hasBusinessScore && hasPositiveReview && !hasNegativeReview) {
            businessAndPositive++;
          } else if (hasBusinessScore && !hasPositiveReview && hasNegativeReview) {
            businessAndNegative++;
          } else if (!hasBusinessScore && hasPositiveReview && hasNegativeReview) {
            positiveAndNegative++;
          } else if (hasBusinessScore && hasPositiveReview && hasNegativeReview) {
            allThree++;
          }
          
          const { error: updateError } = await supabase
            .from('stores')
            .update(updateData)
            .eq('id', storeInfo.id);
          
          if (updateError) {
            errors.push(`第${rowIndex + 1}行更新失败 ${storeId}: ${updateError.message}`);
            console.error(`[基础信息上传] 更新失败 ${storeId}:`, updateError);
          } else {
            updateCount++;
          }
        } else {
          skippedNoDataCount++;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`第${rowIndex + 1}行处理失败: ${errorMsg}`);
        console.error(`[基础信息上传] 处理行失败:`, err);
      }
    }
    
    console.log(`[基础信息上传] 完成: 
      总记录: ${totalRecords}, 
      更新成功: ${updateCount}, 
      - 仅经营分: ${businessScoreOnly}, 
      - 仅好评数: ${positiveReviewOnly}, 
      - 仅中差评数: ${negativeReviewOnly},
      - 经营分+好评数: ${businessAndPositive},
      - 经营分+中差评数: ${businessAndNegative},
      - 好评数+中差评数: ${positiveAndNegative},
      - 三个字段都更新: ${allThree},
      未找到: ${notFoundCount}, 
      无数据跳过: ${skippedNoDataCount}, 
      错误: ${errors.length}`);
    
    if (notFoundStores.length > 0) {
      console.log('[基础信息上传] 未找到的门店列表:', notFoundStores);
    }
    
    return NextResponse.json({
      success: true,
      message: `成功更新 ${updateCount} 家门店信息`,
      totalRecords,
      updatedCount: updateCount,
      notFoundCount,
      skippedNoDataCount,
      errorCount: errors.length,
      errors: errors.slice(0, 10),
      notFoundStores: notFoundStores.map((s, i) => ({ rowNumber: s.row, storeId: s.storeId, storeName: s.storeName })),
      updateBreakdown: {
        businessScoreOnly,
        positiveReviewOnly,
        negativeReviewOnly,
        businessAndPositive,
        businessAndNegative,
        positiveAndNegative,
        allThree
      }
    });
  } catch (error) {
    console.error('[基础信息上传] 失败:', error);
    return NextResponse.json(
      { error: '上传失败', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
