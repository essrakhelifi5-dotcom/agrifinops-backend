import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { MailerModule } from '@nestjs-modules/mailer';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

import { AuthModule } from './auth/auth.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { QuickbooksModule } from './quickbooks/quickbooks.module';
import { SyncModule } from './sync/sync.module';
import { AdminModule } from './admin/admin.module';
import { PasswordResetModule } from './password-reset/password-reset.module';
import { ChatbotModule } from './chatbot/chatbot.module';

@Module({
  imports: [
    // Charger .env globalement
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // Redis / Bull Queue
    BullModule.forRoot({
      redis: {
        host: 'localhost',
        port: 6379,
      },
    }),

    // Scheduler
    ScheduleModule.forRoot(),

    // Mailer
    MailerModule.forRoot({
      transport: {
        host: process.env.MAIL_HOST || 'smtp.gmail.com',
        port: Number(process.env.MAIL_PORT) || 587,
        secure: false,
        auth: {
          user: process.env.MAIL_USER,       // ✅ MAIL_USER
          pass: process.env.MAIL_PASSWORD,   // ✅ MAIL_PASSWORD
        },
      },
      defaults: {
        from: `"Agri-FinOps" <${process.env.EMAIL_USER}>`,
      },
    }),

    // Modules de l'application
    AuthModule,
    AnalyticsModule,
    QuickbooksModule,
    SyncModule,
    AdminModule,
    PasswordResetModule,
    ChatbotModule,
  ],

  controllers: [AppController],

  providers: [AppService, PrismaService],
})
export class AppModule {}