import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ComposeService } from './compose.service';

@ApiTags('Compose')
@ApiBearerAuth()
@Controller('stacks')
export class ComposeController {
  constructor(private service: ComposeService) {}

  @Post('from-yaml')
  @ApiOperation({ summary: 'Spin up a stack from raw YAML content' })
  upFromYaml(
    @Body()
    data: {
      yamlPath: string;
      yamlContent: string;
      workspaceId?: string;
    },
  ) {
    return this.service.upFromYaml(data);
  }
}

@ApiTags('Workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspaceController {
  @Get()
  list() {
    return [
      {
        id: 'local-host',
        name: 'Local host',
        description: 'Global Docker host view',
        color: '#0f766e',
        icon: 'Server',
        rootFolderPath: process.env.DEFAULT_WORKSPACE_ROOT?.trim() || 'docker-yaml-files',
        createdAt: new Date(0).toISOString(),
      },
    ];
  }

  @Get(':id/stacks')
  listStacks(@Param('id') id: string) {
    return [];
  }
}
