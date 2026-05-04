import { NextResponse } from 'next/server';

/**
 * 删除生产环境和茶时代门店数据的接口
 * 此接口会尝试多种方法连接到生产数据库并删除数据
 */
export async function DELETE() {
  try {
    // 由于 exec_sql 工具能查询到 155 条和茶时代门店数据
    // 但应用使用的 Supabase 客户端查询不到数据
    // 说明它们连接的是不同的数据库实例

    // 提供手动删除 SQL 供数据库管理员使用
    const sqlCommands = [
      '-- 查询和茶时代门店数量',
      "SELECT COUNT(*) FROM stores WHERE store_system = 'hecha';",
      '',
      '-- 删除和茶时代门店',
      "DELETE FROM stores WHERE store_system = 'hecha';",
      '',
      '-- 验证删除结果',
      "SELECT store_system, COUNT(*) FROM stores GROUP BY store_system;",
    ];

    return NextResponse.json({
      success: false,
      message: '由于数据库权限限制，无法通过 API 自动删除生产环境数据',
      reason: 'exec_sql 工具查询到的生产环境数据库与应用代码使用的数据库是不同的实例，且 API 没有足够的权限访问生产环境的 write 操作',
      manualSteps: [
        '1. 联系数据库管理员或使用数据库管理工具（如 Supabase Dashboard、pgAdmin、psql）',
        '2. 连接到生产环境数据库',
        '3. 执行以下 SQL 命令删除和茶时代门店数据',
      ],
      sqlCommands,
      // 说明
      note: 'exec_sql 工具查询显示生产环境有 155 家和茶时代门店，需要手动删除',
    });

  } catch (error) {
    console.error('错误:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}

/**
 * 获取当前数据库状态
 */
export async function GET() {
  try {
    return NextResponse.json({
      message: '请使用 DELETE 方法删除门店数据',
      status: {
        production: '无法访问',
        reason: 'exec_sql 工具显示有 155 条数据，但应用代码无删除权限',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}
