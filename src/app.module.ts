import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { FilesystemModule } from './filesystem/filesystem.module';
import { ContainerModule } from './container/container.module';
import { ImageModule } from './image/image.module';
import { OllamaModule } from './ollama/ollama.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SettingsModule } from './settings/settings.module';
import { DockerModule } from './docker/docker.module';
import { BackupModule } from './backup/backup.module';
import { VolumeModule } from './volume/volume.module';
import { RegistryModule } from './registry/registry.module';
import { DatabaseModule } from './database/database.module';
import { AiSessionModule } from './ai-session/ai-session.module';
import { SearchModule } from './search/search.module';
import { ComposeModule } from './compose/compose.module';
import { GatewayModule } from './gateway/gateway.module';
import { HealthController } from './health.controller';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { CommonModule } from './common/common.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    FilesystemModule,
    ContainerModule,
    ImageModule,
    OllamaModule,
    DashboardModule,
    SettingsModule,
    DockerModule,
    BackupModule,
    VolumeModule,
    RegistryModule,
    DatabaseModule,
    AiSessionModule,
    SearchModule,
    ComposeModule,
    GatewayModule,
    CommonModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
