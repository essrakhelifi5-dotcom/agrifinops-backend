import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { QuickbooksController } from './quickbooks.controller';
import { QuickbooksService } from './quickbooks.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
  ],
  controllers: [QuickbooksController],
  providers: [QuickbooksService, PrismaService],
})
export class QuickbooksModule {}