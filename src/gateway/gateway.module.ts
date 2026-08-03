import { Module } from '@nestjs/common';
import { DockerGateway } from './docker.gateway';
import { ContainerModule } from '../container/container.module';

@Module({
  imports: [ContainerModule],
  providers: [DockerGateway],
})
export class GatewayModule {}
