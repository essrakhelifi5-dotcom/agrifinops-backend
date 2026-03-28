import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // ─────────────────────────────────────────────
  // GET /analytics/burn-vs-earn
  // Revenus vs Dépenses par mois
  // ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Get('burn-vs-earn')
  async getBurnVsEarn(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.analyticsService.getBurnVsEarn(userId);
  }

  // ─────────────────────────────────────────────
  // GET /analytics/ar-aging
  // Factures impayées par tranche de retard
  // ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Get('ar-aging')
  async getArAging(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.analyticsService.getArAging(userId);
  }

  // ─────────────────────────────────────────────
  // GET /analytics/category-margins
  // Dépenses par catégorie avec pourcentages
  // ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Get('category-margins')
  async getCategoryMargins(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.analyticsService.getCategoryMargins(userId);
  }

  // ─────────────────────────────────────────────
  // GET /analytics/kpis
  // Indicateurs clés : Burn Rate, Quick Ratio, AR, Runway
  // ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Get('kpis')
  async getKpis(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.analyticsService.getKpis(userId);
  }
}