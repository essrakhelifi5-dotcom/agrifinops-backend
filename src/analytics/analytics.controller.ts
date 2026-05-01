import { Controller, Get, UseGuards, Req, Res, Post } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request, Response } from 'express';
import { PythonService } from './python.service'; 

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService,
              private readonly pythonService: PythonService,
  ) {}

  // ─────────────────────────────────────────────
  // GET /analytics/burn-vs-earn
  // Revenus vs Dépenses par mois
  // ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Get('burn-vs-earn')
  async getBurnVsEarn(@Req() req: Request) {
    const userId = (req as any).user.userId;
    return this.analyticsService.getBurnVsEarn(userId);
  }

  // ─────────────────────────────────────────────
  // GET /analytics/ar-aging
  // Factures impayées par tranche de retard
  // ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Get('ar-aging')
  async getArAging(@Req() req: Request) {
    const userId = (req as any).user.userId;
    return this.analyticsService.getArAging(userId);
  }

  // ─────────────────────────────────────────────
  // GET /analytics/category-margins
  // Dépenses par catégorie avec pourcentages
  // ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Get('category-margins')
  async getCategoryMargins(@Req() req: Request) {
    const userId = (req as any).user.userId;
    return this.analyticsService.getCategoryMargins(userId);
  }

  // ─────────────────────────────────────────────
  // GET /analytics/kpis
  // Indicateurs clés : Burn Rate, Quick Ratio, AR, Runway
  // ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Get('kpis')
  async getKpis(@Req() req: Request) {
    const userId = (req as any).user.userId;
    return this.analyticsService.getKpis(userId);
  }
  

  // ─────────────────────────────────────────────
  // GET /analytics/export-report
  // Export PDF Report
  // ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Get('export-report')
  async exportReport(@Req() req: Request, @Res() res: Response) {
    const userId = (req as any).user.userId;
    await this.analyticsService.generatePDFReport(userId, res);
  }
  // ─────────────────────────────────────────────
  // POST /analytics/categorize-ia
  // Catégorisation IA via Python FastAPI
  // ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('categorize-ia')
  async categorizeIA(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.pythonService.categorizeExpenses(userId);
  }

  // ─────────────────────────────────────────────
  // GET /analytics/financial-ratios
  // Calculs financiers avancés via Python
  // ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Get('financial-ratios')
  async getFinancialRatios(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.pythonService.getFinancialRatios(userId);
  }

  // ─────────────────────────────────────────────
  // GET /analytics/predict-cashflow
  // Prédiction Cash Flow via Python (régression linéaire)
  // ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Get('predict-cashflow')
  async predictCashFlow(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.pythonService.predictCashFlow(userId);
  }
}
