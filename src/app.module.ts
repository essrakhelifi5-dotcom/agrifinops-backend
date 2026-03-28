import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { QuickbooksModule } from './quickbooks/quickbooks.module';
import { AuthModule } from './auth/auth.module';
import { SyncModule } from './sync/sync.module';
import { AnalyticsModule } from './analytics/analytics.module'; 

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    QuickbooksModule,
    SyncModule,
    AnalyticsModule, 
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}