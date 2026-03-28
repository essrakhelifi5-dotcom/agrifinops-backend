import { Controller, Post, UseGuards, Req } from '@nestjs/common';
import { SyncService } from './sync.service';
import { NormalizeService } from './normalize.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';

@Controller('sync')
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly normalizeService: NormalizeService,
  ) {}

  // ─────────────────────────────────────────────
  // POST /sync/all
  // Lance la synchronisation complète
  // ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('all')
  async syncAll(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.syncService.syncAll(userId);
  }

  // ─────────────────────────────────────────────
  // POST /sync/invoices
  // ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('invoices')
  async syncInvoices(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.syncService.syncInvoices(userId);
  }

  // ─────────────────────────────────────────────
  // POST /sync/expenses
  // ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('expenses')
  async syncExpenses(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.syncService.syncExpenses(userId);
  }

  // ─────────────────────────────────────────────
  // POST /sync/payments
  // ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('payments')
  async syncPayments(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.syncService.syncPayments(userId);
  }

  // ─────────────────────────────────────────────
  // POST /sync/normalize
  // Nettoie et normalise toutes les données en DB
  // ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('normalize')
  async normalize(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.normalizeService.normalizeAll(userId);
  }
}