import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PrismaService } from '../prisma/prisma.service';

const DOCKERMANAGER_BACKUP_DIR =
  process.env.DOCKERMANAGER_BACKUP_DIR ||
  path.join(os.homedir(), '.dockermanager', 'backups');

export interface BackupSnapshot {
  name: string;
  path: string;
  createdAt: Date;
  fileCount: number;
  size: number;
}

interface BackupCache {
  data: BackupSnapshot[];
  mtime: number;
  timestamp: number;
}

@Injectable()
export class BackupService {
  private cache: BackupCache | null = null;
  private readonly CACHE_TTL_MS = 30000; // 30s in-memory cache

  constructor(private prisma: PrismaService) {}

  private async ensureBackupDirAsync(): Promise<string> {
    const dir = path.join(DOCKERMANAGER_BACKUP_DIR, 'default');
    await fs.promises.mkdir(dir, { recursive: true });
    return dir;
  }

  private getRootFolderPath(): string {
    return path.resolve(
      process.env.DEFAULT_WORKSPACE_ROOT?.trim() || 'docker-yaml-files',
    );
  }

  private invalidateCache() {
    this.cache = null;
  }

  async backupWorkspaceFiles() {
    const rootFolderPath = this.getRootFolderPath();
    if (!fs.existsSync(rootFolderPath)) {
      await fs.promises.mkdir(rootFolderPath, { recursive: true });
    }

    const backupDir = await this.ensureBackupDirAsync();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotDir = path.join(backupDir, `snapshot-${timestamp}`);
    await fs.promises.mkdir(snapshotDir, { recursive: true });

    // Fast non-blocking async copy using Node fs.promises.cp
    await fs.promises.cp(rootFolderPath, snapshotDir, {
      recursive: true,
      filter: (source) => {
        const basename = path.basename(source);
        return basename !== '.git' && basename !== 'node_modules';
      },
    });

    this.invalidateCache();

    await this.prisma.activity.create({
      data: {
        id: crypto.randomUUID(),
        kind: 'backup',
        message: `backup created: ${snapshotDir}`,
        ts: new Date(),
      },
    });

    const stats = await this.calculateDirStatsAsync(snapshotDir);

    return {
      message: 'Backup created',
      path: snapshotDir,
      timestamp,
      files: stats.count,
    };
  }

  async listBackups(): Promise<BackupSnapshot[]> {
    const backupDir = path.join(DOCKERMANAGER_BACKUP_DIR, 'default');

    let dirStat: fs.Stats;
    try {
      dirStat = await fs.promises.stat(backupDir);
    } catch {
      return [];
    }

    // Serve from in-memory cache if directory hasn't changed and within TTL
    const now = Date.now();
    if (
      this.cache &&
      this.cache.mtime === dirStat.mtimeMs &&
      now - this.cache.timestamp < this.CACHE_TTL_MS
    ) {
      return this.cache.data;
    }

    try {
      const entries = await fs.promises.readdir(backupDir, {
        withFileTypes: true,
      });
      const snapshotDirs = entries.filter(
        (e) => e.isDirectory() && e.name.startsWith('snapshot-'),
      );

      // Concurrent parallel inspection of all snapshots
      const snapshots: BackupSnapshot[] = await Promise.all(
        snapshotDirs.map(async (e) => {
          const snapshotPath = path.join(backupDir, e.name);
          const [stat, stats] = await Promise.all([
            fs.promises.stat(snapshotPath),
            this.calculateDirStatsAsync(snapshotPath),
          ]);
          return {
            name: e.name,
            path: snapshotPath,
            createdAt: stat.birthtime,
            fileCount: stats.count,
            size: stats.size,
          };
        }),
      );

      snapshots.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      this.cache = {
        data: snapshots,
        mtime: dirStat.mtimeMs,
        timestamp: now,
      };

      return snapshots;
    } catch {
      return [];
    }
  }

  async restoreBackup(snapshotName: string) {
    const snapshotPath = path.join(
      DOCKERMANAGER_BACKUP_DIR,
      'default',
      snapshotName,
    );
    try {
      await fs.promises.access(snapshotPath);
    } catch {
      throw new BadRequestException('Snapshot not found');
    }

    const rootFolderPath = this.getRootFolderPath();
    await fs.promises.mkdir(rootFolderPath, { recursive: true });

    // Fast non-blocking async copy using Node fs.promises.cp
    await fs.promises.cp(snapshotPath, rootFolderPath, { recursive: true });

    this.invalidateCache();

    await this.prisma.activity.create({
      data: {
        id: crypto.randomUUID(),
        kind: 'restore',
        message: `backup restored: ${snapshotName}`,
        ts: new Date(),
      },
    });

    return { message: 'Backup restored', path: rootFolderPath };
  }

  async deleteBackup(snapshotName: string) {
    const snapshotPath = path.join(
      DOCKERMANAGER_BACKUP_DIR,
      'default',
      snapshotName,
    );
    try {
      await fs.promises.access(snapshotPath);
    } catch {
      throw new BadRequestException('Snapshot not found');
    }

    await fs.promises.rm(snapshotPath, { recursive: true, force: true });
    this.invalidateCache();
    return { message: 'Backup deleted' };
  }

  /**
   * Single-pass asynchronous parallel traversal calculating both count and size concurrently
   */
  private async calculateDirStatsAsync(
    dirPath: string,
  ): Promise<{ count: number; size: number }> {
    let count = 0;
    let size = 0;
    try {
      const entries = await fs.promises.readdir(dirPath, {
        withFileTypes: true,
      });
      const results = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            return this.calculateDirStatsAsync(fullPath);
          } else {
            try {
              const fileStat = await fs.promises.stat(fullPath);
              return { count: 1, size: fileStat.size };
            } catch {
              return { count: 1, size: 0 };
            }
          }
        }),
      );
      for (const r of results) {
        count += r.count;
        size += r.size;
      }
    } catch {}
    return { count, size };
  }
}
