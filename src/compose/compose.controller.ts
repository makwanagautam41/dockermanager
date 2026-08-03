import { Controller, Post, Body } from '@nestjs/common';
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
