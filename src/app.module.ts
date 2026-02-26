import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { QuickbooksModule } from './quickbooks/quickbooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    QuickbooksModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
