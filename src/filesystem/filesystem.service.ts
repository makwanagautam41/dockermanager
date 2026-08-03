import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { resolveSafePath } from '../common/resolve-path';

@Injectable()
export class FilesystemService {
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

  private ensureRoot(target: string) {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }
  }

  browse(basePath: string, subPath?: string) {
    const resolvedBase = this.resolveBase(basePath);
    this.ensureRoot(resolvedBase);
    const target = subPath
      ? resolveSafePath(resolvedBase, subPath)
      : resolvedBase;
    this.ensureExists(target);
    const entries = fs.readdirSync(target, { withFileTypes: true });
    return entries.map((e) => {
      const full = path.join(target, e.name);
      const stat = fs.statSync(full);
      return {
        name: e.name,
        type: e.isDirectory() ? 'directory' : 'file',
        size: e.isFile() ? stat.size : 0,
        modifiedAt: stat.mtime,
      };
    });
  }

  getTree(basePath: string, subPath?: string) {
    const resolvedBase = this.resolveBase(basePath);
    const target = subPath
      ? resolveSafePath(resolvedBase, subPath)
      : resolvedBase;
    if (!fs.existsSync(target)) {
      this.ensureRoot(target);
    }

    const buildTree = (currentPath: string): any => {
      const stat = fs.statSync(currentPath);
      const name = path.basename(currentPath);
      const isDir = stat.isDirectory();

      const node: any = {
        id: Buffer.from(currentPath).toString('base64'),
        path: currentPath,
        name: name,
        isDir: isDir,
        content: '',
      };

      if (isDir) {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        node.children = entries
          .filter((e) => e.name !== '.git' && e.name !== 'node_modules')
          .map((e) => buildTree(path.join(currentPath, e.name)));
      } else {
        try {
          node.content = fs.readFileSync(currentPath, 'utf-8');
        } catch {
          node.content = 'Binary or unsupported file';
        }
      }
      return node;
    };

    return buildTree(target);
  }

  readFile(filePath: string) {
    const resolved = this.resolveFilePath(filePath);
    this.ensureExists(resolved);
    const content = fs.readFileSync(resolved, 'utf-8');
    return { path: resolved, content };
  }

  writeFile(filePath: string, content: string) {
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
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolved, content, 'utf-8');
    return { path: resolved, content };
  }

  private resolveFilePath(filePath: string): string {
    const root = this.rootPath();
    const rel = this.stripRootBasename(filePath.trim());
    if (path.isAbsolute(rel)) return this.ensureInsideRoot(rel);
    return this.ensureInsideRoot(path.resolve(root, rel));
  }

  createFolder(parentPath: string, name: string) {
    const target = resolveSafePath(this.resolveBase(parentPath), name);
    if (fs.existsSync(target)) {
      throw new BadRequestException('Folder or file already exists');
    }
    fs.mkdirSync(target, { recursive: true });
    return { path: target, name };
  }

  rename(oldPath: string, newName: string) {
    const resolved = this.resolveFilePath(oldPath);
    this.ensureExists(resolved);
    const dir = path.dirname(resolved);
    const newPath = path.join(dir, newName);
    if (fs.existsSync(newPath)) {
      throw new BadRequestException('Target name already exists');
    }
    fs.renameSync(resolved, newPath);
    return { oldPath: resolved, newPath };
  }

  delete(targetPath: string) {
    const resolved = this.resolveFilePath(targetPath);
    this.ensureExists(resolved);
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      fs.rmSync(resolved, { recursive: true, force: true });
    } else {
      fs.unlinkSync(resolved);
    }
    return { deleted: resolved };
  }

  duplicate(filePath: string) {
    const resolved = this.resolveFilePath(filePath);
    this.ensureExists(resolved);
    const dir = path.dirname(resolved);
    const ext = path.extname(resolved);
    const base = path.basename(resolved, ext);
    let copyPath = path.join(dir, `${base}-copy${ext}`);
    let idx = 1;
    while (fs.existsSync(copyPath)) {
      copyPath = path.join(dir, `${base}-copy-${idx}${ext}`);
      idx++;
    }
    fs.copyFileSync(resolved, copyPath);
    return { original: resolved, copy: copyPath };
  }

  private ensureExists(p: string) {
    if (!fs.existsSync(p)) {
      throw new BadRequestException(`Path does not exist: ${p}`);
    }
  }
}
