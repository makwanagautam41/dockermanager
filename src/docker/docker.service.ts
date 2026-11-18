import { Injectable } from '@nestjs/common';
import Dockerode from 'dockerode';
import { getDockerClient } from '../common/docker-client';

const docker = getDockerClient();

@Injectable()
export class DockerService {
  async getStatus() {
    try {
      const info = await docker.info();
      return {
        running: true,
        version: info.ServerVersion,
        apiVersion: info.ApiVersion,
        kernel: info.KernelVersion,
        containers: info.Containers,
        runningContainers: info.ContainersRunning,
        pausedContainers: info.ContainersPaused,
        stoppedContainers: info.ContainersStopped,
        images: info.Images,
        os: info.OperatingSystem,
        architecture: info.Architecture,
        cpus: info.NCPU,
        totalMemory: info.MemTotal,
        storageDriver: info.Driver,
        dockerRootDir: info.DockerRootDir,
        hostname: info.Name,
        ostype: info.OSType,
      };
    } catch {
      return {
        running: false,
        version: null,
        apiVersion: null,
        kernel: null,
        containers: 0,
        runningContainers: 0,
        pausedContainers: 0,
        stoppedContainers: 0,
        images: 0,
        os: null,
        architecture: null,
        cpus: 0,
        totalMemory: 0,
        storageDriver: null,
        dockerRootDir: null,
        hostname: null,
        ostype: null,
      };
    }
  }

  async ping() {
    try {
      await docker.ping();
      return { alive: true };
    } catch {
      return { alive: false };
    }
  }

  async listNetworks() {
    try {
      const networks = await docker.listNetworks();
      return networks.map((n) => ({
        id: n.Id,
        name: n.Name,
        driver: n.Driver,
        scope: n.Scope,
        internal: n.Internal ?? false,
        enable_ipv6: n.EnableIPv6 ?? false,
        ipam: n.IPAM,
        containers: n.Containers ?? {},
        created: n.Created,
        labels: n.Labels ?? {},
        options: n.Options ?? {},
      }));
    } catch {
      return [];
    }
  }

  async getNetwork(id: string) {
    try {
      const network = docker.getNetwork(id);
      const inspect = await network.inspect();
      return {
        id: inspect.Id,
        name: inspect.Name,
        driver: inspect.Driver,
        scope: inspect.Scope,
        internal: inspect.Internal ?? false,
        enable_ipv6: inspect.EnableIPv6 ?? false,
        ipam: inspect.IPAM,
        containers: inspect.Containers ?? {},
        created: inspect.Created,
        labels: inspect.Labels ?? {},
        options: inspect.Options ?? {},
      };
    } catch {
      return null;
    }
  }

  async connectContainerToNetwork(id: string, containerId: string) {
    try {
      const network = docker.getNetwork(id);
      await network.connect({ Container: containerId });
      return { success: true };
    } catch (e: any) {
      throw new Error(e.message || "Failed to connect container to network");
    }
  }

  async disconnectContainerFromNetwork(id: string, containerId: string) {
    try {
      const network = docker.getNetwork(id);
      await network.disconnect({ Container: containerId, Force: true });
      return { success: true };
    } catch (e: any) {
      throw new Error(e.message || "Failed to disconnect container from network");
    }
  }
}
