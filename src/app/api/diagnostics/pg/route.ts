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

    // 创建 PostgreSQL 连接池
    const pool = new Pool({
      connectionString: pgUrl,
      max: 1,
    });

    try {
      // 查询美丽妈妈门店数量
      const result = await pool.query(
        "SELECT COUNT(*) as count FROM stores WHERE store_system = 'meili'"
      );

      // 查询总门店数量
      const totalResult = await pool.query(
        "SELECT COUNT(*) as count FROM stores"
      );

      // 查询门店体系分布
      const distributionResult = await pool.query(
        "SELECT store_system, COUNT(*) as count FROM stores GROUP BY store_system"
      );

      return NextResponse.json({
        success: true,
        database: 'PostgreSQL (PGDATABASE_URL)',
        meiliStores: parseInt(result.rows[0].count),
        totalStores: parseInt(totalResult.rows[0].count),
        distribution: distributionResult.rows,
      });
    } finally {
      await pool.end();
    }
  } catch (error) {
    console.error('PostgreSQL 查询失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}
