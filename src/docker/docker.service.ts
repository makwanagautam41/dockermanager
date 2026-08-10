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
}
