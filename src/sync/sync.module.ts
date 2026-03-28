import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { NormalizeService } from './normalize.service';
@Module({
  controllers: [SyncController],
  providers: [SyncService, PrismaService , NormalizeService],
  exports: [SyncService , NormalizeService], 
})
export class SyncModule {}