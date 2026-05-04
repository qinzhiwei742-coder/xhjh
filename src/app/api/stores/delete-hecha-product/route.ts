import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// 删除生产环境门店数据的专用接口
export async function POST() {
  try {
    // 尝试连接到 product 数据库
    // 使用和 exec_sql 工具相同的连接配置
    const connectionString = process.env.PGDATABASE_URL;

    if (!connectionString) {
      return NextResponse.json({
        success: false,
        error: '数据库连接配置缺失',
      }, { status: 500 });
    }

    // 尝试多种可能的数据库配置
    const url = new URL(connectionString.replace('postgresql://', 'postgres://'));
    const host = url.hostname;
    const port = parseInt(url.port || '5432', 10);
    const user = url.username;
    const password = url.password;

    // 尝试不同的数据库名称和 schema 组合
    const databaseVariants = [
      url.pathname.replace('/', ''), // 原始数据库名
      'postgres',
      'product',
      'production',
    ];

    for (const dbName of databaseVariants) {
      try {
        const pool = new Pool({
          host,
          port,
          user,
          password,
          database: dbName,
          max: 1,
          connectionTimeoutMillis: 5000,
        });

        try {
          // 查询门店统计
          const { rows: statsRows } = await pool.query(
            `SELECT store_system, COUNT(*) as count FROM stores GROUP BY store_system`
          );

          console.log(`数据库 ${dbName} 门店统计:`, statsRows);

          const hechaCount = statsRows.find((r: any) => r.store_system === 'hecha')?.count || 0;

          if (hechaCount > 0) {
            // 删除和茶时代门店
            const result = await pool.query(
              `DELETE FROM stores WHERE store_system = 'hecha'`
            );

            console.log(`从数据库 ${dbName} 删除了 ${result.rowCount} 家和茶时代门店`);

            await pool.end();

            return NextResponse.json({
              success: true,
              message: `成功删除 ${result.rowCount} 家和茶时代门店`,
              deletedCount: result.rowCount,
              database: dbName,
            });
          }

          await pool.end();
        } catch (queryError) {
          await pool.end();
          console.log(`数据库 ${dbName} 查询失败:`, queryError);
          // 继续尝试下一个数据库
        }
      } catch (poolError) {
        console.log(`数据库 ${dbName} 连接失败:`, poolError);
        // 继续尝试下一个数据库
      }
    }

    return NextResponse.json({
      success: false,
      error: '无法找到包含和茶时代门店的数据库',
    }, { status: 500 });

  } catch (error) {
    console.error('删除门店失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}
