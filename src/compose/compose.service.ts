import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { spawn } from 'child_process';
import { getDockerClient } from '../common/docker-client';

const docker = getDockerClient();

function resolveWorkspacePath(p: string): string {
  const root = process.env.DEFAULT_WORKSPACE_ROOT?.trim();
  const rootPath = root ? path.resolve(root) : path.resolve('docker-yaml-files');
  if (!p || p === '.') return rootPath;
  let rel = p.trim();
  const baseName = path.basename(rootPath);
  if (
    rel === baseName ||
    rel.startsWith(`${baseName}/`) ||
    rel.startsWith(`${baseName}\\`)
  ) {
    rel = rel.slice(baseName.length).replace(/^[/\\]+/, '') || '.';
  }
  const resolved = path.isAbsolute(rel) ? path.resolve(rel) : path.resolve(rootPath, rel);
  if (resolved !== rootPath && !resolved.startsWith(rootPath + path.sep)) {
    throw new BadRequestException(
      `Access denied: path is outside the workspace root (${rootPath})`,
    );
  }
  return resolved;
}

@Injectable()
export class ComposeService {
  async upFromYaml(data: {
    yamlPath: string;
    yamlContent: string;
    workspaceId?: string;
  }) {
    if (!data.yamlPath || !data.yamlContent) {
      throw new BadRequestException('yamlPath and yamlContent are required');
    }
    try {
      yaml.load(data.yamlContent);
    } catch (e: any) {
      throw new BadRequestException(`Invalid YAML: ${e.message}`);
    }

    const yamlPath = resolveWorkspacePath(data.yamlPath);
    const dir = path.dirname(yamlPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(yamlPath, data.yamlContent, 'utf-8');

    const result = await this.execCompose(dir, yamlPath, 'up', ['-d']);

    let containerId = '';
    try {
      const projectName = path.basename(dir).toLowerCase();
      const containers = await docker.listContainers({ all: true });
      const match = containers.find((c) => {
        const proj = c.Labels?.['com.docker.compose.project'] ?? '';
        return proj === projectName;
      });
      if (match) containerId = match.Id;
    } catch {}

    return {
      message: 'Stack spun up from YAML',
      containerId,
      ...result,
    };
  }

  private execCompose(
    cwd: string,
    composeFile: string,
    cmd: string,
    args: string[] = [],
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        'docker',
        ['compose', '-f', composeFile, cmd, ...args],
        { cwd },
      );
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d: Buffer) => {
        stdout += d.toString();
      });
      child.stderr?.on('data', (d: Buffer) => {
        stderr += d.toString();
      });
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          const msg =
            stderr.trim() || stdout.trim() || `Command exited with code ${code}`;
          reject(new Error(msg));
        }
      });
      child.on('error', (e) => reject(e));
    });
  }
}
