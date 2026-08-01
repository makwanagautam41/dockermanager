import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PrismaService } from '../prisma/prisma.service';

const DOCKERMANAGER_BACKUP_DIR =
  process.env.DOCKERMANAGER_BACKUP_DIR ||
  path.join(os.homedir(), '.dockermanager', 'backups');

@Injectable()
export class BackupService {
  constructor(private prisma: PrismaService) {}

  private ensureBackupDir(): string {
    const dir = path.join(DOCKERMANAGER_BACKUP_DIR, 'default');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private getRootFolderPath(): string {
    return path.join(process.cwd(), 'yaml-data');
  }

  async backupWorkspaceFiles() {
    const rootFolderPath = this.getRootFolderPath();
    if (!fs.existsSync(rootFolderPath)) {
      fs.mkdirSync(rootFolderPath, { recursive: true });
    }

    const backupDir = this.ensureBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotDir = path.join(backupDir, `snapshot-${timestamp}`);
    fs.mkdirSync(snapshotDir, { recursive: true });

    const copyRecursive = (src: string, dest: string) => {
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          fs.mkdirSync(destPath, { recursive: true });
          copyRecursive(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    };

    copyRecursive(rootFolderPath, snapshotDir);

    await this.prisma.activity.create({
      data: {
        id: crypto.randomUUID(),
        kind: 'backup',
        message: `backup created: ${snapshotDir}`,
        ts: new Date(),
      },
    });

    return {
      message: 'Backup created',
      path: snapshotDir,
      timestamp,
      files: this.countFiles(snapshotDir),
    };
  }

  async listBackups() {
    const backupDir = path.join(DOCKERMANAGER_BACKUP_DIR, 'default');
    if (!fs.existsSync(backupDir)) return [];

    const entries = fs.readdirSync(backupDir, { withFileTypes: true });
    const snapshots = entries
      .filter((e) => e.isDirectory() && e.name.startsWith('snapshot-'))
      .map((e) => {
        const snapshotPath = path.join(backupDir, e.name);
        const stat = fs.statSync(snapshotPath);
        return {
          name: e.name,
          path: snapshotPath,
          createdAt: stat.birthtime,
          fileCount: this.countFiles(snapshotPath),
          size: this.getDirSize(snapshotPath),
        };
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    return snapshots;
  }

  async restoreBackup(snapshotName: string) {
    const snapshotPath = path.join(DOCKERMANAGER_BACKUP_DIR, 'default', snapshotName);
    if (!fs.existsSync(snapshotPath)) {
      throw new BadRequestException('Snapshot not found');
    }

    const rootFolderPath = this.getRootFolderPath();
    if (!fs.existsSync(rootFolderPath)) {
      fs.mkdirSync(rootFolderPath, { recursive: true });
    }

    const copyRecursive = (src: string, dest: string) => {
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          fs.mkdirSync(destPath, { recursive: true });
          copyRecursive(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    };

    copyRecursive(snapshotPath, rootFolderPath);

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
    const snapshotPath = path.join(DOCKERMANAGER_BACKUP_DIR, 'default', snapshotName);
    if (!fs.existsSync(snapshotPath)) {
      throw new BadRequestException('Snapshot not found');
    }

    fs.rmSync(snapshotPath, { recursive: true, force: true });
    return { message: 'Backup deleted' };
  }

  private countFiles(dirPath: string): number {
    let count = 0;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          count += this.countFiles(fullPath);
        } else {
          count++;
        }
      }
    } catch {}
    return count;
  }

  private getDirSize(dirPath: string): number {
    let size = 0;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          size += this.getDirSize(fullPath);
        } else {
          size += fs.statSync(fullPath).size;
        }
      }
    } catch {}
    return size;
  }
}
