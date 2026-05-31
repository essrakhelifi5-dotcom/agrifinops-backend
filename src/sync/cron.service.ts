import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
//Une queue est une file d’attente de jobs
import type { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';

// ─────────────────────────────────────────────
// CronService — déclenche la sync automatique
// Toutes les 24h, ajoute un job pour chaque user
// ─────────────────────────────────────────────
@Injectable()
export class CronService {
  constructor(
    // on récupère la queue appelée sync-queue.
    //Cette queue est déclarée dans sync.module.ts
    @InjectQueue('sync-queue') private syncQueue: Queue,
    private prisma: PrismaService,
  ) {}

  // ─────────────────────────────────────────────
  // Cron job — tous les jours à minuit
  // ─────────────────────────────────────────────
  //Cette ligne rend la méthode automatique
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  //Méthode appelée automatiquement à minuit
  async handleDailySync() {
    console.log('⏰ Cron — Démarrage sync quotidienne...');
    // Récupère tous les utilisateurs connectés à QuickBooks
    const tokens = await this.prisma.oAuthToken.findMany({
      include: { user: true },
    });
   //Affiche combien d’utilisateurs vont être synchronisés.
   console.log(` ${tokens.length} utilisateurs à synchroniser`);

    //On boucle sur chaque utilisateur connecté à QuickBooks
   for (const token of tokens) {
    //On ajoute un job dans la queue
      await this.syncQueue.add(
        'sync-all',
        { userId: token.userId },
        {
          attempts: 3,            // 3 tentatives si échec
          backoff: 5000,          // 5 secondes entre chaque tentative
          removeOnComplete: true, // Supprime le job après succès
        },
      );
      console.log(` Job ajouté pour ${token.user.email}`);
    }
  }

  // ─────────────────────────────────────────────
  // Méthode manuelle — déclenche la sync immédiatement
  // Appelée depuis le controller via POST /sync/trigger
  // ─────────────────────────────────────────────
  //Cette méthode déclenche une sync immédiatement pour un utilisateur précis
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
      message: ' Sync job ajouté à la queue',
      jobId: job.id,
    };
  }
}