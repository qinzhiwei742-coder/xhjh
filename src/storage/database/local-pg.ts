import { Pool, QueryResult, QueryResultRow } from 'pg';

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE || 'coze_scram',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '123456',
});

export { pool };

// ========== Supabase 兼容层 ==========

interface SupabaseFromReturn<T> {
  select(columns?: string): { eq(column: string, value: any): SupabaseQuery<T>; single(): Promise<{ data: T | null; error: SupabaseError | null }> };
  insert(data: any | any[]): Promise<{ data: T | null; error: SupabaseError | null }>;
  update(data: any): { eq(column: string, value: any): SupabaseQuery<T> };
  delete(): { eq(column: string, value: any): SupabaseQuery<T> };
}

interface SupabaseQuery<T> {
  select(columns?: string): Promise<{ data: T[] | null; error: SupabaseError | null; count?: number }>;
  insert(data: any | any[]): Promise<{ data: T | null; error: SupabaseError | null }>;
  update(data: any): Promise<{ data: T | null; error: SupabaseError | null }>;
  delete(): Promise<{ data: null; error: SupabaseError | null }>;
}

interface SupabaseError {
  code: string;
  message: string;
  details?: string;
  hint?: string;
}

function buildQuery<T extends QueryResultRow>(table: string, conditions: { column: string; value: any }[] = []): SupabaseQuery<T> {
  return {
    async select(columns?: string) {
      try {
        const cols = columns && columns !== '*' ? columns : '*';
        let sql = `SELECT ${cols} FROM ${table}`;
        const params: any[] = [];
        if (conditions.length > 0) {
          const whereClauses = conditions.map((c, i) => {
            params.push(c.value);
            return `${c.column} = $${i + 1}`;
          });
          sql += ` WHERE ${whereClauses.join(' AND ')}`;
        }
        const result = await pool.query(sql, params);
        return { data: result.rows, error: null };
      } catch (err: any) {
        return { data: null, error: { code: err.code || 'UNKNOWN', message: err.message || '查询失败' } };
      }
    },
    async insert(data: any | any[]) {
      try {
        const rows = Array.isArray(data) ? data : [data];
        if (rows.length === 0) return { data: null, error: null };
        const columns = Object.keys(rows[0]).filter(k => k !== 'id' || rows[0].id === undefined);
        const placeholders = rows.map((_, ri) =>
          `(${columns.map((_, ci) => `$${ri * columns.length + ci + 1}`).join(', ')})`
        ).join(', ');
        const allValues = rows.flatMap(row => columns.map(col => row[col]));
        const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders} RETURNING *`;
        const result = await pool.query(sql, allValues);
        return { data: Array.isArray(data) ? result.rows : (result.rows[0] || null), error: null };
      } catch (err: any) {
        return { data: null, error: { code: err.code || 'UNKNOWN', message: err.message || '插入失败' } };
      }
    },
    async update(data: any) {
      try {
        const columns = Object.keys(data);
        const setClauses = columns.map((col, i) => `${col} = $${i + 1}`);
        const whereClauses = conditions.map((c, i) => {
          return `${c.column} = $${columns.length + i + 1}`;
        });
        const allValues = [...columns.map(col => data[col]), ...conditions.map(c => c.value)];
        const sql = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')} RETURNING *`;
        const result = await pool.query(sql, allValues);
        return { data: result.rows[0] || null, error: null };
      } catch (err: any) {
        return { data: null, error: { code: err.code || 'UNKNOWN', message: err.message || '更新失败' } };
      }
    },
    async delete() {
      try {
        const whereClauses = conditions.map((c, i) => {
          return `${c.column} = $${i + 1}`;
        });
        const allValues = conditions.map(c => c.value);
        const sql = `DELETE FROM ${table} WHERE ${whereClauses.join(' AND ')}`;
        await pool.query(sql, allValues);
        return { data: null, error: null };
      } catch (err: any) {
        return { data: null, error: { code: err.code || 'UNKNOWN', message: err.message || '删除失败' } };
      }
    },
  };
}

function buildFrom<T extends QueryResultRow>(table: string): SupabaseFromReturn<T> {
  return {
    select(columns?: string) {
      return {
        eq(column: string, value: any) {
          return buildQuery<T>(table, [{ column, value }]);
        },
        async single() {
          try {
            const cols = columns && columns !== '*' ? columns : '*';
            const result = await pool.query(`SELECT ${cols} FROM ${table} LIMIT 1`);
            return { data: result.rows[0] || null, error: null };
          } catch (err: any) {
            return { data: null, error: { code: err.code || 'UNKNOWN', message: err.message } };
          }
        },
      };
    },
    async insert(data: any | any[]) {
      return buildQuery<T>(table).insert(data);
    },
    update(data: any) {
      return {
        eq(column: string, value: any) {
          const q = buildQuery<T>(table, [{ column, value }]);
          return {
            ...q,
            async update(d: any) {
              return q.update(d);
            },
          };
        },
      };
    },
    delete() {
      return {
        eq(column: string, value: any) {
          return buildQuery<T>(table, [{ column, value }]);
        },
      };
    },
  };
}

export function getSupabaseClient() {
  return {
    from<T extends QueryResultRow = any>(table: string): SupabaseFromReturn<T> {
      return buildFrom<T>(table);
    },
    rpc: async () => ({ data: null, error: null }),
  };
}

// ========== S3 存储兼容层 ==========

import * as fs from 'fs';
import * as path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export class S3Storage {
  constructor(_config: any) {}

  async uploadFile({ fileContent, fileName, contentType }: { fileContent: Buffer; fileName: string; contentType?: string }): Promise<string> {
    const safeName = fileName.replace(/\//g, '_');
    const filePath = path.join(UPLOAD_DIR, safeName);
    fs.writeFileSync(filePath, fileContent);
    return safeName;
  }

  async generatePresignedUrl({ key, expireTime: _expireTime }: { key: string; expireTime?: number }): Promise<string> {
    return `/api/storage/local/${encodeURIComponent(key)}`;
  }

  async downloadFile(key: string): Promise<Buffer> {
    const safeName = key.replace(/\//g, '_');
    const filePath = path.join(UPLOAD_DIR, safeName);
    return fs.readFileSync(filePath);
  }

  async deleteFile(key: string): Promise<void> {
    const safeName = key.replace(/\//g, '_');
    const filePath = path.join(UPLOAD_DIR, safeName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

// ========== 批量查询辅助 ==========

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

export async function execute(sql: string, params?: any[]): Promise<number> {
  const result = await pool.query(sql, params);
  return result.rowCount || 0;
}
