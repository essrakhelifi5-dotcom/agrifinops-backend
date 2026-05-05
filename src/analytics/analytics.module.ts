import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { PythonService } from './python.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, PythonService, PrismaService],
  exports: [AnalyticsService, PythonService],
})
export class AnalyticsModule {}