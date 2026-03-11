import { Module } from '@nestjs/common';
import { QuickbooksController } from './quickbooks.controller';
import { QuickbooksService } from './quickbooks.service';
import { PrismaService } from '../prisma/prisma.service'; // ← Ajoute

@Module({
  controllers: [QuickbooksController],
  providers: [QuickbooksService, PrismaService], // ← Ajoute PrismaService
})
export class QuickbooksModule {}