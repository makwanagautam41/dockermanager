import { Controller, Get, Post, Delete, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BackupService } from './backup.service';

@ApiTags('Backup')
@Controller()
export class BackupController {
  constructor(private service: BackupService) {}

  @Post('backup')
  @ApiOperation({ summary: 'Backup all files' })
  backup() {
    return this.service.backupWorkspaceFiles();
  }

  @Get('backups')
  @ApiOperation({ summary: 'List all backups' })
  listBackups() {
    return this.service.listBackups();
  }

  @Post('backups/:snapshotName/restore')
  @ApiOperation({ summary: 'Restore from a backup snapshot' })
  restore(
    @Param('snapshotName') snapshotName: string,
  ) {
    return this.service.restoreBackup(snapshotName);
  }

  @Delete('backups/:snapshotName')
  @ApiOperation({ summary: 'Delete a backup snapshot' })
  deleteBackup(
    @Param('snapshotName') snapshotName: string,
  ) {
    return this.service.deleteBackup(snapshotName);
  }
}
