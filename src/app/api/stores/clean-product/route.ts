import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export async function DELETE() {
  try {
    const pgUrl = process.env.PGDATABASE_URL;

    if (!pgUrl) {
      return NextResponse.json({
        success: false,
        error: 'PGDATABASE_URL is not set',
      });
    }

    // 尝试查找 product 数据库
    // 从 PGDATABASE_URL 中提取基础连接信息
    const urlObj = new URL(pgUrl.replace('postgresql://', 'postgres://'));
    const hostname = urlObj.hostname;
    const port = urlObj.port || 5432;
    const username = urlObj.username;
    const password = urlObj.password;

    // 尝试连接到不同的 schema 或数据库
    const possibilities = [
      { database: urlObj.pathname.replace('/', ''), schema: 'public' },
      { database: urlObj.pathname.replace('/', ''), schema: 'product' },
      { database: urlObj.pathname.replace('/', ''), schema: 'production' },
    ];

    for (const { database, schema } of possibilities) {
      try {
        const pool = new Pool({
          host: hostname,
          port: Number(port),
          user: username,
          password: password,
          database: database,
          max: 1,
          connectionTimeoutMillis: 5000,
        });

        try {
          // 先检查 stores 表
          const checkResult = await pool.query(
            `SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'stores' AND table_schema = '${schema}'`
          );

          if (parseInt(checkResult.rows[0].count) > 0) {
            // 查询和茶时代门店数量
            const countResult = await pool.query(
              `SELECT COUNT(*) FROM ${schema}.stores WHERE store_system = 'hecha'`
            );

            const hechaCount = parseInt(countResult.rows[0].count);

            if (hechaCount > 0) {
              // 尝试删除
              const deleteResult = await pool.query(
                `DELETE FROM ${schema}.stores WHERE store_system = 'hecha'`
              );

              await pool.end();

              return NextResponse.json({
                success: true,
                message: `成功删除 ${hechaCount} 家和茶时代门店`,
                deletedCount: hechaCount,
                database: database,
                schema: schema,
              });
            }
          }

          await pool.end();
        } catch (err) {
          await pool.end();
          // 继续尝试下一个可能性
        }
      } catch (err) {
        // 继续尝试下一个可能性
      }
    }

    return NextResponse.json({
      success: false,
      error: '无法找到 product 数据库或没有删除权限',
    });
  } catch (error) {
    console.error('删除失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}
