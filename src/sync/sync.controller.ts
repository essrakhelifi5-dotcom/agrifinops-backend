
//Req : récupère la requête HTTP.
import { Controller, Post, UseGuards, Req } from '@nestjs/common';
import { SyncService } from './sync.service';
import { NormalizeService } from './normalize.service';
import { CronService } from './cron.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';

@Controller('sync')
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly normalizeService: NormalizeService,
    private readonly cronService: CronService,
  ) {}

  // ─────────────────────────────────────────────
  // POST /sync/all
  // Lance la synchronisation complète
  // ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  //Cette méthode est protégée par JwtAuthGuard, donc l’utilisateur doit être authentifié pour y accéder.
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
  // ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  //Cette route lance la normalisation des données, c’est-à-dire qu’elle corrige les données manquantes ou incohérentes dans les factures et les dépenses.
  @Post('normalize')
  async normalize(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.normalizeService.normalizeAll(userId);
  }

  // ─────────────────────────────────────────────
  // POST /sync/trigger
  // Déclenche la sync via BullMQ manuellement
  // ─────────────────────────────────────────────
  //BullMQ est une bibliothèque de queue/job.
  //Elle sert à mettre des tâches dans une file d’attente.
   //Puis BullMQ exécute cette tâche en arrière-plan.
  @UseGuards(JwtAuthGuard)
  //déclenche une synchronisation via CronService, qui ajoute un job dans la queue BullMQ pour être traité en arrière-plan.
  @Post('trigger')
  async triggerSync(@Req() req: Request) {
    const userId = (req as any).user.id;
    //CronService utilise BullMQ pour lancer des tâches de synchronisation
    return this.cronService.triggerSyncNow(userId);
  }
}
