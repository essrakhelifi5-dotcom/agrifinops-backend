import { Processor, Process } from '@nestjs/bull';
import  type { Job } from 'bull';
import { SyncService } from './sync.service';
import { PrismaService } from '../prisma/prisma.service';

// ─────────────────────────────────────────────
// Processor BullMQ — traite les jobs de sync
// Appelé automatiquement quand un job est ajouté à la queue
// ─────────────────────────────────────────────
@Processor('sync-queue')
export class SyncProcessor {
  constructor(
    private syncService: SyncService,
    private prisma: PrismaService,
  ) {}

  // ─────────────────────────────────────────────
  // Job : sync-all
  // Lance la sync complète pour un utilisateur
  // ─────────────────────────────────────────────
  @Process('sync-all')
  async handleSyncAll(job: Job<{ userId: string }>)  {
    console.log('🔄 BullMQ — Démarrage sync pour userId:', job.data.userId);

    try {
      const result = await this.syncService.syncAll(job.data.userId);
      console.log('✅ BullMQ — Sync terminée:', result);
      return result;
    } catch (error :any) {
      console.error('❌ BullMQ — Erreur sync:', error.message);
      throw error;
    }
  }
}