import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取门店的标签
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('store_id');
    
    if (!storeId) {
      return NextResponse.json({ error: '缺少 store_id 参数' }, { status: 400 });
    }
    
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('store_tags')
      .select('*')
      .eq('store_id', storeId);
    
    if (error) {
      console.error('获取门店标签失败:', error);
      return NextResponse.json({ error: '获取门店标签失败' }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true, 
      data: data 
    });
  } catch (error) {
    console.error('获取门店标签异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 更新门店标签（支持两种模式）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // 单个添加模式：包含 store_id, tag_name, tag_color
    if (body.store_id && body.tag_name && body.tag_color) {
      const supabase = getSupabaseClient();
      
      // 检查是否已存在相同标签
      const { data: existing } = await supabase
        .from('store_tags')
        .select('*')
        .eq('store_id', body.store_id)
        .eq('tag_name', body.tag_name)
        .single();
      
      if (existing) {
        return NextResponse.json({ 
          success: true, 
          data: existing,
          message: '标签已存在'
        });
      }
      
      const { data, error } = await supabase
        .from('store_tags')
        .insert({
          store_id: body.store_id,
          tag_name: body.tag_name,
          tag_color: body.tag_color
        })
        .select()
        .single();
      
      if (error) {
        console.error('添加标签失败:', error);
        return NextResponse.json({ error: '添加标签失败' }, { status: 500 });
      }
      
      return NextResponse.json({ 
        success: true, 
        data: data,
        message: '标签添加成功'
      });
    }
    
    // 替换模式：包含 storeId 和 tags 数组
    if (body.storeId && Array.isArray(body.tags)) {
      const supabase = getSupabaseClient();
      
      // 先删除该门店的所有标签
      const { error: deleteError } = await supabase
        .from('store_tags')
        .delete()
        .eq('store_id', body.storeId);
      
      if (deleteError) {
        console.error('删除旧标签失败:', deleteError);
        return NextResponse.json({ error: '删除旧标签失败' }, { status: 500 });
      }
      
      // 如果有新标签，插入新标签
      if (body.tags.length > 0) {
        const insertData = body.tags.map((tag: { tag_name?: string; name?: string; tag_color?: string; color?: string }) => ({
          store_id: body.storeId,
          tag_name: tag.tag_name || tag.name,
          tag_color: tag.tag_color || tag.color
        }));
        
        const { error: insertError } = await supabase
          .from('store_tags')
          .insert(insertData);
        
        if (insertError) {
          console.error('插入新标签失败:', insertError);
          return NextResponse.json({ error: '插入新标签失败' }, { status: 500 });
        }
      }
      
      return NextResponse.json({ 
        success: true,
        message: '标签更新成功'
      });
    }
    
    return NextResponse.json({ error: '参数错误' }, { status: 400 });
  } catch (error) {
    console.error('更新门店标签异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 批量更新门店标签颜色（用于将自定义标签统一改为紫色）
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    // 批量更新指定标签名称的颜色
    if (body.tag_names && Array.isArray(body.tag_names) && body.new_color) {
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('store_tags')
        .update({ tag_color: body.new_color })
        .in('tag_name', body.tag_names)
        .select();

      if (error) {
        console.error('批量更新标签颜色失败:', error);
        return NextResponse.json({ error: '批量更新标签颜色失败' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        data: data,
        message: `已更新 ${data.length} 个标签的颜色`
      });
    }

    return NextResponse.json({ error: '参数错误' }, { status: 400 });
  } catch (error) {
    console.error('批量更新标签颜色异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 删除门店标签
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tagId = searchParams.get('id');
    
    if (!tagId) {
      return NextResponse.json({ error: '缺少标签ID' }, { status: 400 });
    }
    
    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from('store_tags')
      .delete()
      .eq('id', tagId);
    
    if (error) {
      console.error('删除标签失败:', error);
      return NextResponse.json({ error: '删除标签失败' }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true,
      message: '标签删除成功'
    });
  } catch (error) {
    console.error('删除标签异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
