import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { CUSTOM_TAG_COLOR, PRESET_TAG_NAMES } from '@/constants/tag-presets';

// 迁移标签颜色：将所有自定义标签改为紫色
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();

    // 获取所有门店标签
    const { data: allTags, error: fetchError } = await supabase
      .from('store_tags')
      .select('tag_name, tag_color');

    if (fetchError) {
      console.error('获取门店标签失败:', fetchError);
      return NextResponse.json({ error: '获取门店标签失败' }, { status: 500 });
    }

    // 找出所有自定义标签（不在预设列表中的标签）
    const customTags = allTags?.filter(tag => !PRESET_TAG_NAMES.includes(tag.tag_name)) || [];

    if (customTags.length === 0) {
      return NextResponse.json({
        success: true,
        message: '没有需要迁移的自定义标签'
      });
    }

    // 提取自定义标签的名称列表
    const customTagNames = [...new Set(customTags.map(tag => tag.tag_name))];

    // 批量更新自定义标签颜色
    const { data: updatedTags, error: updateError } = await supabase
      .from('store_tags')
      .update({ tag_color: CUSTOM_TAG_COLOR })
      .in('tag_name', customTagNames)
      .select();

    if (updateError) {
      console.error('批量更新标签颜色失败:', updateError);
      return NextResponse.json({ error: '批量更新标签颜色失败' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `已将 ${customTagNames.length} 个自定义标签（共 ${updatedTags?.length || 0} 条记录）的颜色更新为紫色`,
      data: {
        updatedTagNames: customTagNames,
        updatedCount: updatedTags?.length || 0
      }
    });
  } catch (error) {
    console.error('迁移标签颜色异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
