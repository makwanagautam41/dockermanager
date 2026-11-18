import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';

const CACHE_TTL = 5000;
let overviewCache: { data: any; ts: number } | null = null;

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getOverview() {
    const now = Date.now();
    if (overviewCache && now - overviewCache.ts < CACHE_TTL) {
      return overviewCache.data;
    }

    const [containers, recentActivity] = await Promise.all([
      this.prisma.container.findMany(),
      this.prisma.activity.findMany({
        orderBy: { ts: 'desc' },
        take: 20,
      }),
    ]);

    let runningContainers = 0;
    for (const c of containers) {
      if (c.status === 'running') runningContainers++;
    }

    const diskUsage = await this.getDiskUsage();

    const data = {
      totalContainers: containers.length,
      runningContainers,
      diskUsage,
      recentActivity,
    };

    overviewCache = { data, ts: now };
    return data;
  }

  private async getDiskUsage() {
    const defaultRoot = process.env.DEFAULT_WORKSPACE_ROOT?.trim();
    if (!defaultRoot) return 0;
    return this.getDirSize(defaultRoot);
  }

  private getDirSize(dirPath: string): Promise<number> {
    return new Promise((resolve) => {
      try {
        if (!fs.existsSync(dirPath)) return resolve(0);
      } catch {
        return resolve(0);
      }
      execFile('du', ['-sb', dirPath], { timeout: 10000 }, (err, stdout) => {
        if (err) return resolve(0);
        const size = parseInt(stdout.split('\t')[0], 10);
        resolve(isNaN(size) ? 0 : size);
      });
    });
  }
}
