import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncProcessor } from './sync.processor';
import { CronService } from './cron.service';
import { NormalizeService } from './normalize.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuickbooksModule } from '../quickbooks/quickbooks.module';

@Module({
  imports: [
    // ── BullMQ Queue ──
    BullModule.registerQueue({
      name: 'sync-queue',
    }),
    // ── Cron Jobs ──
    ScheduleModule.forRoot(),
    QuickbooksModule, 
  ],
  controllers: [SyncController],
  providers: [
    SyncService,
    SyncProcessor,
    CronService,
    NormalizeService,
    PrismaService,
  ],
  exports: [SyncService, NormalizeService, CronService],
})
export class SyncModule {}