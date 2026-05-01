import { Module } from '@nestjs/common';
import { PasswordResetController } from './password-reset.controller';
import { PasswordResetService } from './password-reset.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [PasswordResetController],
  providers: [PasswordResetService, PrismaService],
})
export class PasswordResetModule {}