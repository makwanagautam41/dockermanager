import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function stripBigInts<T>(value: T): T {
  if (typeof value === 'bigint') return Number(value) as T;
  if (Array.isArray(value)) return value.map(stripBigInts) as T;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) result[k] = stripBigInts(obj[k]);
    return result as T;
  }
  return value;
}

@Injectable()
export class DatabaseService {
  constructor(private prisma: PrismaService) {}

  private quoteIdentifier(name: string) {
    return `"${name.replace(/"/g, '""')}"`;
  }

  async listTables(): Promise<string[]> {
    const result: { name: string }[] = await this.prisma.$queryRawUnsafe(
      `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
    );
    return result.map((r) => r.name);
  }

  async getTableSchema(table: string) {
    this.ensureTableName(table);
    const quotedTable = this.quoteIdentifier(table);
    const columns: {
      name: string;
      type: string;
      is_nullable: string;
      column_default: string | null;
      ordinal_position: number;
    }[] = await this.prisma.$queryRawUnsafe(
      `SELECT column_name AS name, data_type AS type, is_nullable, column_default, ordinal_position FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      table,
    );
    const primaryKeys: { name: string }[] = await this.prisma.$queryRawUnsafe(
      `SELECT kcu.column_name AS name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY' ORDER BY kcu.ordinal_position`,
      table,
    );
    const countResult: { count: bigint }[] = await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::bigint AS count FROM ${quotedTable}`,
    );
    const primaryKeySet = new Set(primaryKeys.map((c) => c.name));
    return stripBigInts({
      table,
      columns: columns.map((c) => ({
        name: c.name,
        type: c.type,
        notNull: c.is_nullable === 'NO',
        default: c.column_default,
        primaryKey: primaryKeySet.has(c.name),
      })),
      rowCount: Number(countResult[0]?.count ?? 0n),
    });
  }

  async getRows(table: string, limit = 50, offset = 0) {
    this.ensureTableName(table);
    const quotedTable = this.quoteIdentifier(table);
    const rows: Record<string, any>[] = await this.prisma.$queryRawUnsafe(
      `SELECT * FROM ${quotedTable} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    );
    return stripBigInts(rows);
  }

  async getRow(table: string, id: string, pkColumn: string) {
    this.ensureTableName(table);
    this.ensureSafeString(pkColumn);
    const quotedTable = this.quoteIdentifier(table);
    const quotedPk = this.quoteIdentifier(pkColumn);
    const rows: Record<string, any>[] = await this.prisma.$queryRawUnsafe(
      `SELECT * FROM ${quotedTable} WHERE ${quotedPk} = $1 LIMIT 1`,
      id,
    );
    return rows[0] ? stripBigInts(rows[0]) : null;
  }

  async createRow(table: string, data: Record<string, any>) {
    this.ensureTableName(table);
    const quotedTable = this.quoteIdentifier(table);
    const columns = Object.keys(data);
    const values = Object.values(data);
    try {
      if (columns.length === 0) {
        const rows: Record<string, any>[] = await this.prisma.$queryRawUnsafe(
          `INSERT INTO ${quotedTable} DEFAULT VALUES RETURNING *`,
        );
        return stripBigInts({ inserted: true, row: rows[0] ?? null });
      }
      const placeholders = columns
        .map((_, index) => `$${index + 1}`)
        .join(', ');
      const quoted = columns.map((c) => this.quoteIdentifier(c)).join(', ');
      const rows: Record<string, any>[] = await this.prisma.$queryRawUnsafe(
        `INSERT INTO ${quotedTable} (${quoted}) VALUES (${placeholders}) RETURNING *`,
        ...values,
      );
      return stripBigInts({ inserted: true, row: rows[0] ?? null });
    } catch (e: any) {
      throw new InternalServerErrorException(e.message);
    }
  }

  async updateRow(
    table: string,
    id: string,
    pkColumn: string,
    data: Record<string, any>,
  ) {
    this.ensureTableName(table);
    this.ensureSafeString(pkColumn);
    const quotedTable = this.quoteIdentifier(table);
    const quotedPk = this.quoteIdentifier(pkColumn);
    const setClauses = Object.keys(data)
      .map((c, index) => `${this.quoteIdentifier(c)} = $${index + 1}`)
      .join(', ');
    const values = Object.values(data);
    try {
      await this.prisma.$executeRawUnsafe(
        `UPDATE ${quotedTable} SET ${setClauses} WHERE ${quotedPk} = $${values.length + 1}`,
        ...values,
        id,
      );
      return { updated: true };
    } catch (e: any) {
      throw new InternalServerErrorException(e.message);
    }
  }

  async deleteRow(table: string, id: string, pkColumn: string) {
    this.ensureTableName(table);
    this.ensureSafeString(pkColumn);
    const quotedTable = this.quoteIdentifier(table);
    const quotedPk = this.quoteIdentifier(pkColumn);
    try {
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM ${quotedTable} WHERE ${quotedPk} = $1`,
        id,
      );
      return { deleted: true };
    } catch (e: any) {
      throw new InternalServerErrorException(e.message);
    }
  }

  async executeQuery(sql: string) {
    const trimmed = sql.trim().toUpperCase();
    const isRead =
      trimmed.startsWith('SELECT') ||
      trimmed.startsWith('WITH') ||
      trimmed.startsWith('EXPLAIN') ||
      trimmed.startsWith('SHOW');
    try {
      if (isRead) {
        const rows = await this.prisma.$queryRawUnsafe(sql);
        return stripBigInts({ type: 'select', rows });
      }
      const result = await this.prisma.$executeRawUnsafe(sql);
      return { type: 'execute', affected: result };
    } catch (e: any) {
      throw new InternalServerErrorException(e.message);
    }
  }

  private ensureTableName(name: string) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new BadRequestException('Invalid table name');
    }
  }

  private ensureSafeString(value: string) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
      throw new BadRequestException('Invalid column name');
    }
  }
}
