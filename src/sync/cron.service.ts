import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';

// ─────────────────────────────────────────────
// CronService — déclenche la sync automatique
// Toutes les 24h, ajoute un job pour chaque user
// ─────────────────────────────────────────────
@Injectable()
export class CronService {
  constructor(
    @InjectQueue('sync-queue') private syncQueue: Queue,
    private prisma: PrismaService,
  ) {}

  // ─────────────────────────────────────────────
  // Cron job — tous les jours à minuit
  // ─────────────────────────────────────────────
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailySync() {
    console.log('⏰ Cron — Démarrage sync quotidienne...');

    // Récupère tous les utilisateurs connectés à QuickBooks
    const tokens = await this.prisma.oAuthToken.findMany({
      include: { user: true },
    });

    console.log(` ${tokens.length} utilisateurs à synchroniser`);

    for (const token of tokens) {
      // Ajoute un job dans la queue pour chaque utilisateur
      await this.syncQueue.add(
        'sync-all',
        { userId: token.userId },
        {
          attempts: 3,            // 3 tentatives si échec
          backoff: 5000,          // 5 secondes entre chaque tentative
          removeOnComplete: true, // Supprime le job après succès
        },
      );
      console.log(`✅ Job ajouté pour ${token.user.email}`);
    }
  }

  // ─────────────────────────────────────────────
  // Méthode manuelle — déclenche la sync immédiatement
  // Appelée depuis le controller via POST /sync/trigger
  // ─────────────────────────────────────────────
  async triggerSyncNow(userId: string) {
    const job = await this.syncQueue.add(
      'sync-all',
      { userId },
      {
        attempts: 3,
        backoff: 5000,
        removeOnComplete: true,
      },
    );

    return {
      message: '✅ Sync job ajouté à la queue',
      jobId: job.id,
    };
  }
}