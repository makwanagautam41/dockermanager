import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { resolveSafePath } from '../common/resolve-path';

export interface EnvFileEntry {
  name: string;
  path: string;
  content: string;
}

interface CacheEntry {
  tree: any;
  envFiles: EnvFileEntry[];
  timestamp: number;
  mtimeMs: number;
}

@Injectable()
export class FilesystemService {
  // In-memory cache for high-speed tree responses
  private treeCache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 10000; // 10 seconds TTL

  public clearCache(_subPathPrefix?: string) {
    this.treeCache.clear();
  }

  private rootPath(): string {
    const root = process.env.DEFAULT_WORKSPACE_ROOT?.trim();
    return root ? path.resolve(root) : path.resolve('docker-yaml-files');
  }

  private stripRootBasename(rel: string): string {
    const baseName = path.basename(this.rootPath());
    if (
      rel === baseName ||
      rel.startsWith(`${baseName}/`) ||
      rel.startsWith(`${baseName}\\`)
    ) {
      return rel.slice(baseName.length).replace(/^[/\\]+/, '') || '.';
    }
    return rel;
  }

  private ensureInsideRoot(target: string): string {
    const root = this.rootPath();
    const resolved = path.resolve(target);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new BadRequestException(
        `Access denied: path is outside the workspace root (${root})`,
      );
    }
    return resolved;
  }

  resolveBase(basePath?: string): string {
    const root = this.rootPath();
    if (!basePath || basePath === '.') return root;
    const rel = this.stripRootBasename(basePath.trim());
    if (path.isAbsolute(rel)) return this.ensureInsideRoot(rel);
    return this.ensureInsideRoot(path.resolve(root, rel));
  }

  private async ensureRootAsync(target: string) {
    try {
      await fs.promises.access(target);
    } catch {
      await fs.promises.mkdir(target, { recursive: true });
    }
  }

  async browse(basePath: string, subPath?: string) {
    const resolvedBase = this.resolveBase(basePath);
    await this.ensureRootAsync(resolvedBase);
    const target = subPath
      ? resolveSafePath(resolvedBase, subPath)
      : resolvedBase;
    await this.ensureExistsAsync(target);

    const entries = await fs.promises.readdir(target, { withFileTypes: true });

    // Process all stats in parallel
    const result = await Promise.all(
      entries.map(async (e) => {
        const full = path.join(target, e.name);
        try {
          const stat = await fs.promises.stat(full);
          return {
            name: e.name,
            type: e.isDirectory() ? 'directory' : 'file',
            size: e.isFile() ? stat.size : 0,
            modifiedAt: stat.mtime,
          };
        } catch {
          return null;
        }
      }),
    );

    const filtered = result.filter(Boolean) as any[];

    // Check for .env file in parallel
    const envPath = path.join(target, '.env');
    try {
      const envStat = await fs.promises.stat(envPath);
      filtered.push({
        name: '.env',
        type: 'file',
        size: envStat.size,
        modifiedAt: envStat.mtime,
        isEnv: true,
      });
    } catch {}

    return filtered;
  }

  async getTree(basePath: string, subPath?: string, force = false) {
    const resolvedBase = this.resolveBase(basePath);
    const target = subPath
      ? resolveSafePath(resolvedBase, subPath)
      : resolvedBase;

    await this.ensureRootAsync(target);

    // Fast cache check
    if (!force) {
      const now = Date.now();
      const cached = this.treeCache.get(target);
      if (cached && now - cached.timestamp < this.CACHE_TTL_MS) {
        try {
          const rootStat = await fs.promises.stat(target);
          if (rootStat.mtimeMs <= cached.mtimeMs) {
            return { tree: cached.tree, envFiles: cached.envFiles };
          }
        } catch {}
      }
    }

    const envFiles: EnvFileEntry[] = [];
    const rootEnvPath = path.join(this.rootPath(), '.env');

    // Asynchronous parallel recursive tree builder
    const buildTreeAsync = async (currentPath: string): Promise<any> => {
      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(currentPath);
      } catch {
        return null;
      }

      const name = path.basename(currentPath);
      const isDir = stat.isDirectory();

      const node: any = {
        id: Buffer.from(currentPath).toString('base64'),
        path: currentPath,
        name: name,
        isDir: isDir,
        content: '',
        env: undefined,
      };

      if (isDir) {
        let entries: fs.Dirent[] = [];
        try {
          entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
        } catch {
          entries = [];
        }

        const filteredEntries = entries.filter(
          (e) => e.name !== '.git' && e.name !== 'node_modules' && e.name !== '.DS_Store',
        );

        // Process children concurrently in parallel
        const [children, envData] = await Promise.all([
          Promise.all(
            filteredEntries.map((e) => buildTreeAsync(path.join(currentPath, e.name))),
          ),
          (async () => {
            const envPath = path.join(currentPath, '.env');
            try {
              const content = await fs.promises.readFile(envPath, 'utf-8');
              const envVars = content
                .split('\n')
                .filter((l: string) => l.trim() && !l.startsWith('#'))
                .map((l: string) => {
                  const eqIdx = l.indexOf('=');
                  if (eqIdx === -1) return { key: l.trim(), value: '' };
                  return {
                    key: l.slice(0, eqIdx).trim(),
                    value: l.slice(eqIdx + 1).trim(),
                    secret: /pass|secret|token|key|password/i.test(l.slice(0, eqIdx)),
                  };
                });
              return { envVars, content, envPath };
            } catch {
              return null;
            }
          })(),
        ]);

        node.children = children.filter(Boolean);

        if (envData) {
          node.env = envData.envVars;
          if (currentPath === rootEnvPath) {
            node.envFile = {
              name: '.env',
              path: rootEnvPath,
              content: envData.content,
            };
            envFiles.push(node.envFile);
          } else {
            envFiles.push({
              name: '.env',
              path: envData.envPath,
              content: envData.content,
            });
          }
          for (const child of node.children) {
            if (child && !child.isDir && (!child.env || child.env.length === 0)) {
              child.env = envData.envVars;
            }
          }
        }
      } else {
        // Only read text files if size is under 5MB to avoid blocking memory
        if (stat.size <= 5 * 1024 * 1024) {
          try {
            node.content = await fs.promises.readFile(currentPath, 'utf-8');
          } catch {
            node.content = 'Binary or unsupported file';
          }
        } else {
          node.content = 'File too large to display directly in preview';
        }
      }

      return node;
    };

    const tree = await buildTreeAsync(target);

    // Save into cache
    try {
      const rootStat = await fs.promises.stat(target);
      this.treeCache.set(target, {
        tree,
        envFiles,
        timestamp: Date.now(),
        mtimeMs: rootStat.mtimeMs,
      });
    } catch {}

    return { tree, envFiles };
  }

  async readFile(filePath: string) {
    const resolved = this.resolveFilePath(filePath);
    await this.ensureExistsAsync(resolved);
    try {
      const content = await fs.promises.readFile(resolved, 'utf-8');
      return { path: resolved, content };
    } catch (err: any) {
      if (err.code === 'EACCES') {
        throw new BadRequestException(
          `Permission denied (EACCES): Cannot read "${path.basename(resolved)}". Run: sudo chmod +r "${resolved}"`,
        );
      }
      throw err;
    }
  }

  async writeFile(filePath: string, content: string) {
    const resolved = this.resolveFilePath(filePath);
    const ext = path.extname(resolved).toLowerCase();
    if (ext === '.yml' || ext === '.yaml') {
      try {
        yaml.load(content);
      } catch (e: any) {
        throw new BadRequestException(`YAML validation error: ${e.message}`);
      }
    }
    const dir = path.dirname(resolved);
    try {
      await fs.promises.mkdir(dir, { recursive: true });
    } catch (err: any) {
      if (err.code === 'EACCES') {
        throw new BadRequestException(
          `Permission denied (EACCES): Cannot create directory "${dir}". Run: sudo chown -R $USER:$USER "${dir}"`,
        );
      }
      throw err;
    }

    try {
      await fs.promises.writeFile(resolved, content, 'utf-8');
    } catch (err: any) {
      if (err.code === 'EACCES') {
        // Fallback for files owned by Docker/nobody/root:
        let written = false;

        // 1. Try atomic replace via temporary file + rename (works when parent dir is writable)
        const tmpPath = path.join(dir, `.tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
        try {
          await fs.promises.writeFile(tmpPath, content, 'utf-8');
          await fs.promises.rename(tmpPath, resolved);
          written = true;
        } catch {
          try {
            await fs.promises.unlink(tmpPath);
          } catch {}
        }

        // 2. Try unlinking existing file first (POSIX allows unlink if dir is writable), then write
        if (!written) {
          try {
            await fs.promises.unlink(resolved);
            await fs.promises.writeFile(resolved, content, 'utf-8');
            written = true;
          } catch {}
        }

        // 3. Try chmod 0666 on file
        if (!written) {
          try {
            await fs.promises.chmod(resolved, 0o666);
            await fs.promises.writeFile(resolved, content, 'utf-8');
            written = true;
          } catch {}
        }

        if (!written) {
          throw new BadRequestException(
            `Permission denied (EACCES): Cannot write to "${path.basename(resolved)}". The file or directory is owned by another process (such as Docker root/nobody). To grant permission, run in your terminal: sudo chown -R $USER:$USER "${dir}"`,
          );
        }
      } else {
        throw err;
      }
    }

    // Invalidate cache
    this.clearCache(dir);

    return { path: resolved, content };
  }

  private resolveFilePath(filePath: string): string {
    const root = this.rootPath();
    const rel = this.stripRootBasename(filePath.trim());
    if (path.isAbsolute(rel)) return this.ensureInsideRoot(rel);
    return this.ensureInsideRoot(path.resolve(root, rel));
  }

  async createFolder(parentPath: string, name: string) {
    const target = resolveSafePath(this.resolveBase(parentPath), name);
    try {
      await fs.promises.access(target);
      throw new BadRequestException('Folder or file already exists');
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
    }
    try {
      await fs.promises.mkdir(target, { recursive: true });
    } catch (err: any) {
      if (err.code === 'EACCES') {
        throw new BadRequestException(
          `Permission denied (EACCES): Cannot create folder in "${parentPath}". Run: sudo chown -R $USER:$USER "${this.resolveBase(parentPath)}"`,
        );
      }
      throw err;
    }
    this.clearCache(path.dirname(target));
    return { path: target, name };
  }

  async rename(oldPath: string, newName: string) {
    const resolved = this.resolveFilePath(oldPath);
    await this.ensureExistsAsync(resolved);
    const dir = path.dirname(resolved);
    const newPath = path.join(dir, newName);
    try {
      await fs.promises.access(newPath);
      throw new BadRequestException('Target name already exists');
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
    }
    try {
      await fs.promises.rename(resolved, newPath);
    } catch (err: any) {
      if (err.code === 'EACCES') {
        throw new BadRequestException(
          `Permission denied (EACCES): Cannot rename "${oldPath}". Run: sudo chown -R $USER:$USER "${dir}"`,
        );
      }
      throw err;
    }
    this.clearCache(dir);
    return { oldPath: resolved, newPath };
  }

  async delete(targetPath: string) {
    const resolved = this.resolveFilePath(targetPath);
    await this.ensureExistsAsync(resolved);
    try {
      const stat = await fs.promises.stat(resolved);
      if (stat.isDirectory()) {
        await fs.promises.rm(resolved, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(resolved);
      }
    } catch (err: any) {
      if (err.code === 'EACCES') {
        throw new BadRequestException(
          `Permission denied (EACCES): Cannot delete "${path.basename(resolved)}". Run: sudo chown -R $USER:$USER "${resolved}"`,
        );
      }
      throw err;
    }
    this.clearCache(path.dirname(resolved));
    return { deleted: resolved };
  }

  async duplicate(filePath: string) {
    const resolved = this.resolveFilePath(filePath);
    await this.ensureExistsAsync(resolved);
    const dir = path.dirname(resolved);
    const ext = path.extname(resolved);
    const base = path.basename(resolved, ext);
    let copyPath = path.join(dir, `${base}-copy${ext}`);
    let idx = 1;
    while (true) {
      try {
        await fs.promises.access(copyPath);
        copyPath = path.join(dir, `${base}-copy-${idx}${ext}`);
        idx++;
      } catch {
        break;
      }
    }
    await fs.promises.copyFile(resolved, copyPath);
    this.clearCache(dir);
    return { original: resolved, copy: copyPath };
  }

  private async ensureExistsAsync(p: string) {
    try {
      await fs.promises.access(p);
    } catch {
      throw new BadRequestException(`Path does not exist: ${p}`);
    }
  }
}
