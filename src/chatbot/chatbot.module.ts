import { Module } from '@nestjs/common';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { PrismaService } from '../prisma/prisma.service'; // ✅ IMPORT PRISMA

@Module({
  controllers: [ChatbotController],
  providers: [
    ChatbotService,
    PrismaService, // ✅ AJOUT PRISMA DANS PROVIDERS
  ],
})
export class ChatbotModule {}