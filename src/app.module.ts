import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { QuickbooksModule } from './quickbooks/quickbooks.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    QuickbooksModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
