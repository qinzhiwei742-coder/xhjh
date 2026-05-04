import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 格式化门店数据
 * 清空指定门店体系的数据及相关数据（联系人、跟进记录、标签等）
 * POST /api/stores/init
 * Body: { storeSystem?: 'meili' | 'mama' } // 不传则格式化所有
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { storeSystem } = body;
    
    const supabase = getSupabaseClient();
    
    // 验证门店体系参数
    const validSystems = ['meili', 'mama', 'hecha'];
    const systemFilter = storeSystem && validSystems.includes(storeSystem) 
      ? storeSystem 
      : null;

    // 获取要删除的门店ID列表（用于关联删除其他表数据）
    let storeIdsQuery = supabase.from('stores').select('id');
    if (systemFilter) {
      storeIdsQuery = storeIdsQuery.eq('store_system', systemFilter);
    }
    const { data: storeIds, error: storeIdsError } = await storeIdsQuery;
    
    if (storeIdsError) {
      console.error('获取门店ID失败:', storeIdsError);
    }
    
    const storeIdList = storeIds?.map(s => s.id) || [];
    
    // 1. 删除关联的跟进记录图片
    if (storeIdList.length > 0) {
      // 先获取所有跟进记录ID
      const { data: followRecordIds } = await supabase
        .from('follow_records')
        .select('id')
        .in('store_id', storeIdList);
      
      if (followRecordIds && followRecordIds.length > 0) {
        const { error: followImagesError } = await supabase
          .from('follow_images')
          .delete()
          .in('follow_record_id', followRecordIds.map(r => r.id));
        
        if (followImagesError) {
          console.error('删除跟进记录图片失败:', followImagesError);
        }
      }
    }

    // 2. 删除跟进记录
    if (systemFilter) {
      const { error: followRecordsError } = await supabase
        .from('follow_records')
        .delete()
        .eq('store_system', systemFilter);
      
      if (followRecordsError) {
        console.error('删除跟进记录失败:', followRecordsError);
      }
    } else if (storeIdList.length > 0) {
      const { error: followRecordsError } = await supabase
        .from('follow_records')
        .delete()
        .in('store_id', storeIdList);
      
      if (followRecordsError) {
        console.error('删除跟进记录失败:', followRecordsError);
      }
    }

    // 3. 删除联系人
    if (systemFilter) {
      const { error: contactsError } = await supabase
        .from('contacts')
        .delete()
        .eq('store_system', systemFilter);
      
      if (contactsError) {
        console.error('删除联系人失败:', contactsError);
      }
    } else if (storeIdList.length > 0) {
      const { error: contactsError } = await supabase
        .from('contacts')
        .delete()
        .in('store_id', storeIdList);
      
      if (contactsError) {
        console.error('删除联系人失败:', contactsError);
      }
    }

    // 4. 删除门店标签
    if (systemFilter) {
      const { error: storeTagsError } = await supabase
        .from('store_tags')
        .delete()
        .eq('store_system', systemFilter);
      
      if (storeTagsError) {
        console.error('删除门店标签失败:', storeTagsError);
      }
    } else if (storeIdList.length > 0) {
      const { error: storeTagsError } = await supabase
        .from('store_tags')
        .delete()
        .in('store_id', storeIdList);
      
      if (storeTagsError) {
        console.error('删除门店标签失败:', storeTagsError);
      }
    }

    // 5. 删除机器人配置
    if (systemFilter) {
      const { error: robotConfigsError } = await supabase
        .from('robot_configs')
        .delete()
        .eq('store_system', systemFilter);
      
      if (robotConfigsError) {
        console.error('删除机器人配置失败:', robotConfigsError);
      }
    } else if (storeIdList.length > 0) {
      const { error: robotConfigsError } = await supabase
        .from('robot_configs')
        .delete()
        .in('store_id', storeIdList);
      
      if (robotConfigsError) {
        console.error('删除机器人配置失败:', robotConfigsError);
      }
    }

    // 6. 删除门店资料图片
    if (systemFilter) {
      const { error: storeImagesError } = await supabase
        .from('store_images')
        .delete()
        .eq('store_system', systemFilter);
      
      if (storeImagesError) {
        console.error('删除门店资料图片失败:', storeImagesError);
      }
    } else if (storeIdList.length > 0) {
      const { error: storeImagesError } = await supabase
        .from('store_images')
        .delete()
        .in('store_id', storeIdList);
      
      if (storeImagesError) {
        console.error('删除门店资料图片失败:', storeImagesError);
      }
    }

    // 7. 删除门店
    if (systemFilter) {
      const { error: storesError } = await supabase
        .from('stores')
        .delete()
        .eq('store_system', systemFilter);
      
      if (storesError) {
        throw storesError;
      }
    } else {
      const { error: storesError } = await supabase
        .from('stores')
        .delete()
        .not('id', 'eq', '00000000-0000-0000-0000-000000000000');
      
      if (storesError) {
        throw storesError;
      }
    }

    const systemName = systemFilter === 'meili' ? '美丽妈妈' 
      : systemFilter === 'mama' ? '妈妈盒子'
      : '所有门店';
    const deletedCount = storeIds?.length || 0;

    return NextResponse.json({
      success: true,
      message: `格式化完成，${systemName}的门店数据及相关数据已清空${deletedCount > 0 ? `（共 ${deletedCount} 家门店）` : ''}`,
    });
  } catch (error) {
    console.error('格式化门店数据失败:', error);
    return NextResponse.json(
      { success: false, error: '格式化门店数据失败' },
      { status: 500 }
    );
  }
}

/**
 * 批量导入门店数据（从外部导入）
 * PUT /api/stores/init/batch
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { stores: storeData, overwrite = false } = body;
    const supabase = getSupabaseClient();

    if (!Array.isArray(storeData)) {
      return NextResponse.json(
        { error: '门店数据格式错误，需要数组' },
        { status: 400 }
      );
    }

    // 清空现有数据（如果 overwrite 为 true）
    if (overwrite) {
      const { error: deleteError } = await supabase
        .from('stores')
        .delete()
        .not('id', 'eq', '00000000-0000-0000-0000-000000000000');

      if (deleteError) {
        throw deleteError;
      }
    }

    // 批量插入数据
    const { data: inserted, error: insertError } = await supabase
      .from('stores')
      .insert(storeData)
      .select();

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({
      success: true,
      message: `成功导入 ${inserted?.length || 0} 家门店`,
      count: inserted?.length || 0,
      data: inserted || [],
    });
  } catch (error) {
    console.error('批量导入门店数据失败:', error);
    return NextResponse.json(
      { error: '批量导入门店数据失败' },
      { status: 500 }
    );
  }
}
