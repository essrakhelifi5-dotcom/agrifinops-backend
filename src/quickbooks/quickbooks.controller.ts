import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { QuickbooksService } from './quickbooks.service';
import { UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';
@Controller('quickbooks')
export class QuickbooksController {
  constructor(private readonly qbService: QuickbooksService) {}

  @Get('auth')
  connect(@Res() res: Response) {
    const url = this.qbService.getAuthorizationUrl();
    return res.redirect(url);
  }
@UseGuards(JwtAuthGuard)
@Get('callback')
async callback(@Query() query: any, @Req() req: Request) {

  const { code, realmId, state } = query;

   const userId = (req as any).user.id;;

  return this.qbService.exchangeCode(code, realmId, state, userId);
}

  @UseGuards(JwtAuthGuard)
@Get('company-info')
async getCompanyInfo(@Req() req: Request) {

  const userId = (req as any).user.id;

  return this.qbService.getCompanyInfo(userId);
}
}