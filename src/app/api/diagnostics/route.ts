import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET() {
  try {
    // 检查环境变量
    const envInfo = {
      COZE_SUPABASE_URL: process.env.COZE_SUPABASE_URL ? '已设置' : '未设置',
      COZE_SUPABASE_ANON_KEY: process.env.COZE_SUPABASE_ANON_KEY ? '已设置' : '未设置',
      COZE_PROJECT_ENV: process.env.COZE_PROJECT_ENV || '未知',
    };

    // 测试数据库连接
    const supabase = getSupabaseClient();

    // 测试查询
    const { count: totalCount, error: totalError } = await supabase
      .from('stores')
      .select('*', { count: 'exact', head: true });

    // 测试美丽妈妈门店查询
    const { count: meiliCount, error: meiliError } = await supabase
      .from('stores')
      .select('*', { count: 'exact', head: true })
      .eq('store_system', 'meili');

    // 测试和茶时代门店查询
    const { count: hechaCount, error: hechaError } = await supabase
      .from('stores')
      .select('*', { count: 'exact', head: true })
      .eq('store_system', 'hecha');

    return NextResponse.json({
      success: true,
      environment: envInfo,
      database: {
        connected: !totalError,
        totalStores: totalCount || 0,
        meiliStores: meiliCount || 0,
        hechaStores: hechaCount || 0,
        errors: {
          total: totalError?.message,
          meili: meiliError?.message,
          hecha: hechaError?.message,
        },
      },
    });
  } catch (error) {
    console.error('诊断失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}
