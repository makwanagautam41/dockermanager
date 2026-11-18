import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DockerService } from './docker.service';

@ApiTags('Docker')
@Controller('docker')
export class DockerController {
  constructor(private service: DockerService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get Docker engine status' })
  getStatus() {
    return this.service.getStatus();
  }

  @Get('ping')
  @ApiOperation({ summary: 'Ping Docker engine' })
  ping() {
    return this.service.ping();
  }

  @Get('networks')
  @ApiOperation({ summary: 'List Docker networks' })
  listNetworks() {
    return this.service.listNetworks();
  }

  @Get('networks/:id')
  @ApiOperation({ summary: 'Inspect a Docker network' })
  getNetwork(@Param('id') id: string) {
    return this.service.getNetwork(id);
  }

  @Post('networks/:id/connect')
  @ApiOperation({ summary: 'Connect a container to a network' })
  connectContainer(@Param('id') id: string, @Body() body: { containerId: string }) {
    return this.service.connectContainerToNetwork(id, body.containerId);
  }

  @Post('networks/:id/disconnect')
  @ApiOperation({ summary: 'Disconnect a container from a network' })
  disconnectContainer(@Param('id') id: string, @Body() body: { containerId: string }) {
    return this.service.disconnectContainerFromNetwork(id, body.containerId);
  }
}
