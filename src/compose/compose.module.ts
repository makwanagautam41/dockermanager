import { Module } from '@nestjs/common';
import { ComposeController, WorkspaceController } from './compose.controller';
import { ComposeService } from './compose.service';

@Module({
  controllers: [ComposeController, WorkspaceController],
  providers: [ComposeService],
  exports: [ComposeService],
})
export class ComposeModule {}
