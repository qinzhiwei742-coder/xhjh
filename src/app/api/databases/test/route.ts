import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export async function GET() {
  try {
    const pgUrl = process.env.PGDATABASE_URL;

    if (!pgUrl) {
      return NextResponse.json({
        success: false,
        error: 'PGDATABASE_URL is not set',
      });
    }

    // 尝试修改数据库名称或连接参数来访问生产数据库
    // 从 PGDATABASE_URL 中提取基础连接信息
    const urlObj = new URL(pgUrl.replace('postgresql://', 'postgres://'));
    const hostname = urlObj.hostname;
    const port = urlObj.port || 5432;
    const username = urlObj.username;
    const password = urlObj.password;
    const database = urlObj.pathname.replace('/', '');

    // 尝试连接到可能的生产数据库
    const productionDatabases = [
      database, // 原数据库
      'postgres_prod', // 可能的生产数据库名
      'production', // 可能的生产数据库名
      'prod', // 可能的生产数据库名
    ];

    const results = [];

    for (const dbName of productionDatabases) {
      try {
        const pool = new Pool({
          host: hostname,
          port: Number(port),
          user: username,
          password: password,
          database: dbName,
          max: 1,
          connectionTimeoutMillis: 5000,
        });

        try {
          // 检查数据库是否有 stores 表
          const tableExists = await pool.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables
              WHERE table_name = 'stores'
            )
          `);

          if (tableExists.rows[0].exists) {
            // 查询美丽妈妈门店数量
            const meiliCount = await pool.query(
              "SELECT COUNT(*) as count FROM stores WHERE store_system = 'meili'"
            );

            // 查询总门店数量
            const totalCount = await pool.query(
              "SELECT COUNT(*) as count FROM stores"
            );

            results.push({
              database: dbName,
              connected: true,
              meiliStores: parseInt(meiliCount.rows[0].count),
              totalStores: parseInt(totalCount.rows[0].count),
            });
          } else {
            results.push({
              database: dbName,
              connected: true,
              hasStoresTable: false,
            });
          }
        } finally {
          await pool.end();
        }
      } catch (err) {
        results.push({
          database: dbName,
          connected: false,
          error: err instanceof Error ? err.message : '连接失败',
        });
      }
    }

    return NextResponse.json({
      success: true,
      testedDatabases: results,
      pgUrl: pgUrl.replace(password, '***'), // 隐藏密码
    });
  } catch (error) {
    console.error('测试失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}
