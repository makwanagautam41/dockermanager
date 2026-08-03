import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChildProcess, spawn } from 'child_process';
import { ContainerService } from '../container/container.service';

interface StreamState {
  process: ChildProcess;
  clientId: string;
}

function getConfiguredOrigins() {
  const configured = process.env.CORS_ORIGIN || process.env.FRONTEND_ORIGIN;
  if (!configured) return null;
  return configured
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function isPrivateOrLocalHostname(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

@WebSocketGateway({
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, ok?: boolean) => void) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      const configuredOrigins = getConfiguredOrigins();
      if (configuredOrigins) {
        callback(null, configuredOrigins.includes(origin));
        return;
      }
      try {
        const url = new URL(origin);
        callback(null, isPrivateOrLocalHostname(url.hostname));
      } catch {
        callback(null, false);
      }
    },
    credentials: false,
  },
  namespace: '/',
})
export class DockerGateway implements OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private activeStreams = new Map<string, StreamState>();

  constructor(private containerService: ContainerService) {}

  handleDisconnect(client: Socket) {
    for (const [key, state] of this.activeStreams) {
      if (state.clientId === client.id) {
        state.process?.kill();
        this.activeStreams.delete(key);
      }
    }
  }

  @SubscribeMessage('container:logs')
  async handleContainerLogs(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { containerId: string; tail?: number },
  ) {
    try {
      const child = spawn('docker', [
        'logs',
        '-f',
        '--tail',
        String(data.tail ?? 200),
        '--timestamps',
        data.containerId,
      ]);
      const key = `container-logs:${data.containerId}:${client.id}`;
      this.activeStreams.set(key, { process: child, clientId: client.id });

      child.stdout?.on('data', (d: Buffer) => {
        client.emit('container:logs', {
          containerId: data.containerId,
          line: d.toString(),
        });
      });
      child.stderr?.on('data', (d: Buffer) => {
        client.emit('container:logs', {
          containerId: data.containerId,
          line: d.toString(),
        });
      });
      child.on('close', () => {
        client.emit('container:logs:end', { containerId: data.containerId });
        this.activeStreams.delete(key);
      });
    } catch (e: any) {
      client.emit('error', { message: e.message });
    }
  }

  @SubscribeMessage('container:logs:stop')
  handleStopContainerLogs(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { containerId: string },
  ) {
    const key = `container-logs:${data.containerId}:${client.id}`;
    const state = this.activeStreams.get(key);
    if (state) {
      state.process?.kill();
      this.activeStreams.delete(key);
    }
  }

  @SubscribeMessage('container:stats')
  async handleContainerStats(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { containerId: string },
  ) {
    const interval = setInterval(async () => {
      try {
        const stats = await this.containerService.stats(data.containerId);
        client.emit('container:stats', {
          containerId: data.containerId,
          stats,
        });
      } catch {
        client.emit('container:stats:end', { containerId: data.containerId });
        clearInterval(interval);
      }
    }, 3000);

    client.on('disconnect', () => clearInterval(interval));
    client.on('container:stats:stop', () => clearInterval(interval));
  }
}
