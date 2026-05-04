import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { PRESET_TAGS, PRESET_TAG_NAMES } from '@/constants/tag-presets';

// GET - 获取标签预设列表
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();

    // 先查询是否已有预设数据
    const { data: existingPresets, error: queryError } = await supabase
      .from('tag_presets')
      .select('*')
      .order('sort_order', { ascending: true });

    if (queryError) {
      console.error('查询标签预设失败:', queryError);
      return NextResponse.json({ error: '查询失败' }, { status: 500 });
    }

    // 如果没有数据，初始化默认预设
    if (!existingPresets || existingPresets.length === 0) {
      const { data: insertedPresets, error: insertError } = await supabase
        .from('tag_presets')
        .insert(PRESET_TAGS)
        .select();

      if (insertError) {
        console.error('初始化标签预设失败:', insertError);
        return NextResponse.json({ error: '初始化失败' }, { status: 500 });
      }

      return NextResponse.json({ data: insertedPresets });
    }

    // 清理不在允许列表中的预设标签
    const presetsToDelete = existingPresets.filter(
      preset => !PRESET_TAG_NAMES.includes(preset.tag_name)
    );

    if (presetsToDelete.length > 0) {
      const idsToDelete = presetsToDelete.map(p => p.id);
      const { error: deleteError } = await supabase
        .from('tag_presets')
        .delete()
        .in('id', idsToDelete);

      if (deleteError) {
        console.error('清理多余标签预设失败:', deleteError);
        // 删除失败不影响返回现有数据
      }
    }

    // 确保必须的预设标签存在
    const missingPresets = PRESET_TAG_NAMES.filter(
      (allowedName: string) => !existingPresets.some(p => p.tag_name === allowedName)
    );

    if (missingPresets.length > 0) {
      const presetsToInsert = PRESET_TAGS.filter(p => missingPresets.includes(p.tag_name));

      if (presetsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('tag_presets')
          .insert(presetsToInsert);

        if (insertError) {
          console.error('补全标签预设失败:', insertError);
        }
      }
    }

    // 重新查询返回最新数据
    const { data: finalPresets } = await supabase
      .from('tag_presets')
      .select('*')
      .order('sort_order', { ascending: true });

    return NextResponse.json({ data: finalPresets || [] });
  } catch (error) {
    console.error('获取标签预设失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// POST - 添加标签预设
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // 兼容多种字段名
    const name = body.name || body.tag_name;
    const color = body.color || body.tag_color;

    if (!name || !color) {
      return NextResponse.json({ error: '标签名称和颜色不能为空' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 获取当前最大排序号
    const { data: maxOrderData } = await supabase
      .from('tag_presets')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1);

    const nextSortOrder = maxOrderData && maxOrderData.length > 0 
      ? (maxOrderData[0].sort_order || 0) + 1 
      : 0;

    const { data, error } = await supabase
      .from('tag_presets')
      .insert({
        tag_name: name,
        tag_color: color,
        sort_order: nextSortOrder,
      })
      .select()
      .single();

    if (error) {
      console.error('添加标签预设失败:', error);
      return NextResponse.json({ error: '添加失败' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('添加标签预设失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
