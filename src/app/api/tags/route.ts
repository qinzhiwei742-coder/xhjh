import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取预设标签列表
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('tag_presets')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    
    if (error) {
      console.error('获取预设标签失败:', error);
      return NextResponse.json({ error: '获取预设标签失败' }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true, 
      tags: data 
    });
  } catch (error) {
    console.error('获取预设标签异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
