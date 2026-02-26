import { Controller, Get, Query, Res } from '@nestjs/common';
import  type { Response } from 'express';
import { QuickbooksService } from './quickbooks.service';

@Controller('quickbooks')
export class QuickbooksController {
  constructor(private readonly qbService: QuickbooksService) {}

  @Get('auth')
  connect(@Res() res: Response) {
    const url = this.qbService.getAuthorizationUrl();
    return res.redirect(url);
  }

  @Get('callback')
  async callback(@Query() query: any) {
    const { code, realmId } = query;
    return this.qbService.exchangeCode(code, realmId);
  }
}