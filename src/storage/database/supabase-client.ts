import { Pool, QueryResult, QueryResultRow } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE || 'coze_scram',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '123456',
});

function isCloudEnv(): boolean {
  return !!process.env.COZE_SUPABASE_URL && !!process.env.COZE_SUPABASE_ANON_KEY;
}

// ============================================================
// Types
// ============================================================

interface SupabaseError {
  code: string;
  message: string;
  details?: string;
}

type ConditionOp = '=' | 'LIKE' | 'ILIKE' | 'IN' | 'IS' | '>' | '<' | '>=' | '<=' | '!=' | 'IS NOT';

interface Condition {
  column: string;
  operator: ConditionOp;
  value: any;
}

// ============================================================
// SQL Building Helpers
// ============================================================

function buildWhereClause(conditions: Condition[]): { clause: string; params: any[] } {
  const parts: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  for (const c of conditions) {
    switch (c.operator) {
      case 'IN':
        if (Array.isArray(c.value) && c.value.length > 0) {
          const placeholders = c.value.map(() => `$${paramIdx++}`).join(',');
          parts.push(`${c.column} IN (${placeholders})`);
          params.push(...c.value);
        }
        break;
      case 'LIKE':
        parts.push(`${c.column} LIKE $${paramIdx++}`);
        params.push(c.value);
        break;
      case 'ILIKE':
        parts.push(`${c.column} ILIKE $${paramIdx++}`);
        params.push(c.value);
        break;
      case 'IS':
        parts.push(`${c.column} IS NULL`);
        break;
      case 'IS NOT':
        parts.push(`${c.column} IS NOT NULL`);
        break;
      case '!=':
        if (c.value === null || c.value === undefined) {
          parts.push(`${c.column} IS NOT NULL`);
        } else {
          parts.push(`${c.column} != $${paramIdx++}`);
          params.push(c.value);
        }
        break;
      default:
        parts.push(`${c.column} ${c.operator} $${paramIdx++}`);
        params.push(c.value);
    }
  }

  return { clause: parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '', params };
}

function parseOrFilter(filter: string): Condition[] {
  const conditions: Condition[] = [];
  const tokens = filter.split(',');
  for (const token of tokens) {
    const t = token.trim();
    if (!t) continue;
    const dotParts = t.split('.');
    if (dotParts.length >= 3) {
      const column = dotParts[0];
      const op = dotParts[1];
      const value = dotParts.slice(2).join('.');
      switch (op) {
        case 'ilike': conditions.push({ column, operator: 'ILIKE', value }); break;
        case 'like': conditions.push({ column, operator: 'LIKE', value }); break;
        case 'eq': conditions.push({ column, operator: value === '' ? 'IS' : '=', value: value === '' ? null : value }); break;
        case 'is': conditions.push({ column, operator: 'IS', value: null }); break;
        case 'neq': conditions.push({ column, operator: '!=', value }); break;
        case 'gt': conditions.push({ column, operator: '>', value }); break;
        case 'lt': conditions.push({ column, operator: '<', value }); break;
        case 'gte': conditions.push({ column, operator: '>=', value }); break;
        case 'lte': conditions.push({ column, operator: '<=', value }); break;
        case 'in':
          if (value.startsWith('(') && value.endsWith(')')) {
            conditions.push({ column, operator: 'IN', value: value.slice(1, -1).split(',').map(v => v.trim()) });
          }
          break;
        default: conditions.push({ column, operator: '=', value });
      }
    }
  }
  return conditions;
}

// ============================================================
// Builder Classes
// ============================================================

// SELECT builder: client.from('table').select().eq().order().range()
class SelectBuilder<T extends QueryResultRow> {
  private table: string;
  private columns = '*';
  private conditions: Condition[] = [];
  private orGroups: Condition[][] = [];
  private orderByList: { column: string; ascending: boolean }[] = [];
  private limitCount: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private doCount = false;

  constructor(table: string, conditions?: Condition[], orGroups?: Condition[][]) {
    this.table = table;
    if (conditions) this.conditions = [...conditions];
    if (orGroups) this.orGroups = orGroups.map(g => [...g]);
  }

  select(columns: string = '*', options?: { count?: 'exact' | 'planned' | 'estimated' }) {
    this.columns = columns;
    if (options?.count) this.doCount = true;
    return this;
  }

  eq(column: string, value: any) {
    if (value === null || value === undefined) {
      this.conditions.push({ column, operator: 'IS', value: null });
    } else {
      this.conditions.push({ column, operator: '=', value });
    }
    return this;
  }

  neq(column: string, value: any) {
    this.conditions.push({ column, operator: '!=', value });
    return this;
  }

  is(column: string, value: any) {
    this.conditions.push({ column, operator: value === null ? 'IS' : '=', value });
    return this;
  }

  like(column: string, pattern: string) {
    this.conditions.push({ column, operator: 'LIKE', value: pattern });
    return this;
  }

  ilike(column: string, pattern: string) {
    this.conditions.push({ column, operator: 'ILIKE', value: pattern });
    return this;
  }

  in(column: string, values: any[]) {
    if (values.length > 0) this.conditions.push({ column, operator: 'IN', value: values });
    return this;
  }

  or(filter: string) {
    const orConds = parseOrFilter(filter);
    if (orConds.length > 0) this.orGroups.push(orConds);
    return this;
  }

  not(column: string, operator: string, value: any) {
    if (operator === 'is' && value === null) {
      this.conditions.push({ column, operator: 'IS NOT', value: null });
    } else {
      this.conditions.push({ column, operator: '!=', value });
    }
    return this;
  }

  gte(column: string, value: any) { this.conditions.push({ column, operator: '>=', value }); return this; }
  lte(column: string, value: any) { this.conditions.push({ column, operator: '<=', value }); return this; }
  gt(column: string, value: any) { this.conditions.push({ column, operator: '>', value }); return this; }
  lt(column: string, value: any) { this.conditions.push({ column, operator: '<', value }); return this; }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderByList.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number) { this.limitCount = count; return this; }

  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  count(_options?: { count?: 'exact' }) { this.doCount = true; return this; }

  private _buildSql(): { sql: string; params: any[]; countSql?: string } {
    const cols = this.columns !== '*' ? this.columns : '*';
    let sql = `SELECT ${cols} FROM ${this.table}`;
    const allConditions: Condition[] = [...this.conditions];
    for (const orGroup of this.orGroups) {
      allConditions.push(...orGroup);
    }
    const { clause, params } = buildWhereClause(allConditions);

    // Build OR clause separately
    let orClause = '';
    if (this.orGroups.length > 0) {
      const orParts: string[] = [];
      for (const orGroup of this.orGroups) {
        const { clause: oc, params: op } = buildWhereClause(orGroup);
        if (oc) {
          // Replace WHERE with just the conditions
          orParts.push(oc.replace(/^WHERE /, ''));
          params.push(...op);
        }
      }
      if (orParts.length > 0) {
        orClause = `(${orParts.join(' OR ')})`;
      }
    }

    let whereClause = clause;
    if (orClause) {
      whereClause = whereClause ? `${whereClause} AND ${orClause}` : `WHERE ${orClause}`;
    }

    if (whereClause) sql += ` ${whereClause}`;

    if (this.orderByList.length > 0) {
      sql += ` ORDER BY ${this.orderByList.map(o => `${o.column} ${o.ascending ? 'ASC' : 'DESC'}`).join(', ')}`;
    }

    if (this.rangeFrom !== null && this.rangeTo !== null) {
      sql += ` LIMIT ${this.rangeTo - this.rangeFrom + 1} OFFSET ${this.rangeFrom}`;
    } else if (this.limitCount !== null) {
      sql += ` LIMIT ${this.limitCount}`;
    }

    let countSql: string | undefined;
    if (this.doCount) {
      countSql = `SELECT COUNT(*) as count FROM ${this.table}${whereClause}`;
    }

    return { sql, params, countSql };
  }

  async single(): Promise<{ data: T | null; error: SupabaseError | null }> {
    try {
      const { sql, params } = this._buildSql();
      const limitedSql = sql.includes('LIMIT') ? sql.replace(/LIMIT \d+/, 'LIMIT 1') : `${sql} LIMIT 1`;
      const result = await pool.query(limitedSql, params);
      return { data: result.rows[0] || null, error: null };
    } catch (err: any) {
      return { data: null, error: { code: err.code || 'UNKNOWN', message: err.message } };
    }
  }

  async maybeSingle(): Promise<{ data: T | null; error: SupabaseError | null }> {
    return this.single();
  }

  async then(): Promise<{ data: T[] | null; error: SupabaseError | null; count?: number }> {
    try {
      let count: number | undefined;
      const { sql, params, countSql } = this._buildSql();

      if (countSql) {
        const countResult = await pool.query(countSql, params.slice());
        count = parseInt(countResult.rows[0]?.count || '0');
      }

      const result = await pool.query(sql, params);
      return { data: result.rows, error: null, count };
    } catch (err: any) {
      return { data: null, error: { code: err.code || 'UNKNOWN', message: err.message } };
    }
  }
}

// INSERT/UPSERT builder: client.from('table').insert(data).select()
class InsertBuilder<T extends QueryResultRow> {
  private table: string;
  private data: any | any[];
  private selectColumns: string | null = null;
  private isUpsert = false;
  private onConflict: string | null = null;

  constructor(table: string, data: any | any[], isUpsert = false) {
    this.table = table;
    this.data = data;
    this.isUpsert = isUpsert;
  }

  select(columns: string = '*') {
    this.selectColumns = columns;
    return this;
  }

  onConflict(column: string) {
    this.onConflict = column;
    return this;
  }

  private _execute(): Promise<{ data: T | T[] | null; error: SupabaseError | null }> {
    return this._doInsert();
  }

  private async _doInsert(): Promise<{ data: T | T[] | null; error: SupabaseError | null }> {
    try {
      const rows = Array.isArray(this.data) ? this.data : [this.data];
      if (rows.length === 0) return { data: null, error: null };

      const colSet = new Set<string>();
      for (const row of rows) {
        for (const col of Object.keys(row)) colSet.add(col);
      }
      const columns = Array.from(colSet);
      const placeholders = rows.map((_, ri) =>
        `(${columns.map((_, ci) => `$${ri * columns.length + ci + 1}`).join(', ')})`
      ).join(', ');
      const allValues = rows.flatMap(row => columns.map(col => row[col]));

      const returningCols = this.selectColumns && this.selectColumns !== '*' ? this.selectColumns : '*';

      let sql: string;
      if (this.isUpsert) {
        const conflictCol = this.onConflict || 'id';
        const updateCols = columns.filter(c => c !== conflictCol);
        const updateClause = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
        sql = `INSERT INTO ${this.table} (${columns.map(c => `"${c}"`).join(', ')}) VALUES ${placeholders} ON CONFLICT (${conflictCol}) DO UPDATE SET ${updateClause} RETURNING ${returningCols}`;
      } else {
        sql = `INSERT INTO ${this.table} (${columns.map(c => `"${c}"`).join(', ')}) VALUES ${placeholders} RETURNING ${returningCols}`;
      }

      const result = await pool.query(sql, allValues);
      const returnData = Array.isArray(this.data) ? result.rows : (result.rows[0] || null);
      return { data: returnData as T | T[] | null, error: null };
    } catch (err: any) {
      return { data: null, error: { code: err.code || 'UNKNOWN', message: err.message } };
    }
  }

  // Await support
  async then(): Promise<{ data: T | T[] | null; error: SupabaseError | null }> {
    return this._doInsert();
  }
}

// UPDATE builder: client.from('table').update(data).eq().select()
class UpdateBuilder<T extends QueryResultRow> {
  private table: string;
  private data: any;
  private conditions: Condition[] = [];
  private selectColumns: string | null = null;

  constructor(table: string, data: any) {
    this.table = table;
    this.data = data;
  }

  select(columns: string = '*') {
    this.selectColumns = columns;
    return this;
  }

  eq(column: string, value: any) {
    if (value === null || value === undefined) {
      this.conditions.push({ column, operator: 'IS', value: null });
    } else {
      this.conditions.push({ column, operator: '=', value });
    }
    return this;
  }

  neq(column: string, value: any) {
    this.conditions.push({ column, operator: '!=', value });
    return this;
  }

  is(column: string, value: any) {
    this.conditions.push({ column, operator: value === null ? 'IS' : '=', value });
    return this;
  }

  like(column: string, pattern: string) {
    this.conditions.push({ column, operator: 'LIKE', value: pattern });
    return this;
  }

  ilike(column: string, pattern: string) {
    this.conditions.push({ column, operator: 'ILIKE', value: pattern });
    return this;
  }

  in(column: string, values: any[]) {
    if (values.length > 0) this.conditions.push({ column, operator: 'IN', value: values });
    return this;
  }

  or(filter: string) {
    // For update, OR is parsed but we'll combine with AND for simplicity
    const orConds = parseOrFilter(filter);
    if (orConds.length > 0) this.conditions.push(...orConds);
    return this;
  }

  not(column: string, operator: string, value: any) {
    if (operator === 'is' && value === null) {
      this.conditions.push({ column, operator: 'IS NOT', value: null });
    } else {
      this.conditions.push({ column, operator: '!=', value });
    }
    return this;
  }

  gte(column: string, value: any) { this.conditions.push({ column, operator: '>=', value }); return this; }
  lte(column: string, value: any) { this.conditions.push({ column, operator: '<=', value }); return this; }
  gt(column: string, value: any) { this.conditions.push({ column, operator: '>', value }); return this; }
  lt(column: string, value: any) { this.conditions.push({ column, operator: '<', value }); return this; }

  private async _execute(): Promise<{ data: T | null; error: SupabaseError | null }> {
    try {
      const columns = Object.keys(this.data).filter(k => this.data[k] !== undefined);
      if (columns.length === 0) return { data: null, error: { code: 'EMPTY', message: 'No columns to update' } };

      const setClauses = columns.map((col, i) => `"${col}" = $${i + 1}`);
      const { clause, params: whereParams } = buildWhereClause(this.conditions);
      const allValues = [...columns.map(col => this.data[col]), ...whereParams];
      const returningCols = this.selectColumns && this.selectColumns !== '*' ? this.selectColumns : '*';
      const sql = `UPDATE ${this.table} SET ${setClauses.join(', ')} ${clause} RETURNING ${returningCols}`;
      const result = await pool.query(sql, allValues);
      return { data: result.rows[0] || null, error: null };
    } catch (err: any) {
      return { data: null, error: { code: err.code || 'UNKNOWN', message: err.message } };
    }
  }

  async then(): Promise<{ data: T | null; error: SupabaseError | null }> {
    return this._execute();
  }
}

// DELETE builder: client.from('table').delete().eq().select()
class DeleteBuilder<T extends QueryResultRow> {
  private table: string;
  private conditions: Condition[] = [];
  private selectColumns: string | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns: string = '*') {
    this.selectColumns = columns;
    return this;
  }

  eq(column: string, value: any) {
    if (value === null || value === undefined) {
      this.conditions.push({ column, operator: 'IS', value: null });
    } else {
      this.conditions.push({ column, operator: '=', value });
    }
    return this;
  }

  is(column: string, value: any) {
    this.conditions.push({ column, operator: value === null ? 'IS' : '=', value });
    return this;
  }

  in(column: string, values: any[]) {
    if (values.length > 0) this.conditions.push({ column, operator: 'IN', value: values });
    return this;
  }

  not(column: string, operator: string, value: any) {
    if (operator === 'is' && value === null) {
      this.conditions.push({ column, operator: 'IS NOT', value: null });
    } else {
      this.conditions.push({ column, operator: '!=', value });
    }
    return this;
  }

  like(column: string, pattern: string) {
    this.conditions.push({ column, operator: 'LIKE', value: pattern });
    return this;
  }

  ilike(column: string, pattern: string) {
    this.conditions.push({ column, operator: 'ILIKE', value: pattern });
    return this;
  }

  or(filter: string) {
    const orConds = parseOrFilter(filter);
    if (orConds.length > 0) this.conditions.push(...orConds);
    return this;
  }

  gte(column: string, value: any) { this.conditions.push({ column, operator: '>=', value }); return this; }
  lte(column: string, value: any) { this.conditions.push({ column, operator: '<=', value }); return this; }
  gt(column: string, value: any) { this.conditions.push({ column, operator: '>', value }); return this; }
  lt(column: string, value: any) { this.conditions.push({ column, operator: '<', value }); return this; }

  private async _execute(): Promise<{ data: T[] | null; error: SupabaseError | null }> {
    try {
      const { clause, params } = buildWhereClause(this.conditions);
      const returningCols = this.selectColumns && this.selectColumns !== '*' ? this.selectColumns : '*';
      const sql = `DELETE FROM ${this.table} ${clause} RETURNING ${returningCols}`;
      const result = await pool.query(sql, params);
      return { data: result.rows as T[] | null, error: null };
    } catch (err: any) {
      return { data: null, error: { code: err.code || 'UNKNOWN', message: err.message } };
    }
  }

  async then(): Promise<{ data: T[] | null; error: SupabaseError | null }> {
    return this._execute();
  }
}

// ============================================================
// From Caller: client.from('table')
// ============================================================

class SupabaseFromCaller {
  private table: string;

  constructor(table: string) {
    this.table = table;
  }

  select(columns: string = '*', options?: { count?: 'exact' | 'planned' | 'estimated' }): SelectBuilder<any> {
    return new SelectBuilder<any>(this.table).select(columns, options);
  }

  insert(data: any | any[]): InsertBuilder<any> {
    return new InsertBuilder<any>(this.table, data);
  }

  upsert(data: any | any[], options?: { onConflict?: string; returning?: string }): InsertBuilder<any> {
    const builder = new InsertBuilder<any>(this.table, data, true);
    if (options?.onConflict) builder.onConflict(options.onConflict);
    return builder;
  }

  update(data: any): UpdateBuilder<any> {
    return new UpdateBuilder<any>(this.table, data);
  }

  delete(): DeleteBuilder<any> {
    return new DeleteBuilder<any>(this.table);
  }
}

// ============================================================
// S3 Storage Compatible Layer
// ============================================================

export class S3Storage {
  private bucketName: string;

  constructor(config?: { endpointUrl?: string; accessKey?: string; secretKey?: string; bucketName?: string; region?: string }) {
    this.bucketName = config?.bucketName || 'local';
  }

  async uploadFile({ fileContent, fileName, contentType: _contentType }: { fileContent: Buffer; fileName: string; contentType?: string }): Promise<string> {
    const safeName = fileName.replace(/[\/\\]/g, '_');
    const filePath = path.join(UPLOAD_DIR, safeName);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, fileContent);
    return fileName;
  }

  async generatePresignedUrl({ key, expireTime: _expireTime }: { key: string; expireTime?: number }): Promise<string> {
    const safeKey = key.replace(/[\/\\]/g, '_');
    return `/api/storage/local/${encodeURIComponent(safeKey)}`;
  }

  async downloadFile(key: string): Promise<Buffer> {
    const safeName = key.replace(/[\/\\]/g, '_');
    const filePath = path.join(UPLOAD_DIR, safeName);
    return fs.readFileSync(filePath);
  }

  async deleteFile(key: string): Promise<void> {
    const safeName = key.replace(/[\/\\]/g, '_');
    const filePath = path.join(UPLOAD_DIR, safeName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

export function getLocalFilePath(key: string): string {
  const safeName = key.replace(/[\/\\]/g, '_');
  return path.join(UPLOAD_DIR, safeName);
}

// ============================================================
// Client Factories
// ============================================================

function createLocalClient() {
  return {
    from(table: string) {
      return new SupabaseFromCaller(table);
    },
    rpc: async () => ({ data: null, error: null }),
  };
}

function loadEnv(): void {
  try {
    if (!isCloudEnv()) {
      require('dotenv').config();
    }
  } catch { /* ignore */ }
}

function getSupabaseClient(_token?: string) {
  loadEnv();
  return createLocalClient();
}

function getSupabaseServiceClient() {
  loadEnv();
  return createLocalClient();
}

function getSupabaseCredentials(): { url: string; anonKey: string } | null {
  loadEnv();
  if (isCloudEnv()) {
    return { url: process.env.COZE_SUPABASE_URL!, anonKey: process.env.COZE_SUPABASE_ANON_KEY! };
  }
  return null;
}

// ============================================================
// Exports
// ============================================================

export { pool };

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

export async function execute(sql: string, params?: any[]): Promise<number> {
  const result = await pool.query(sql, params);
  return result.rowCount || 0;
}

export { loadEnv, getSupabaseCredentials, getSupabaseClient, getSupabaseServiceClient };
