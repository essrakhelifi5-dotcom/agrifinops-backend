import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // BF1 : Consulter la liste des utilisateurs
  async getAllUsers() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            invoices: true,
            expenses: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map(user => ({
      ...user,
      invoiceCount: user._count.invoices,
      expenseCount: user._count.expenses,
    }));
  }

  // BF2 : Créer un utilisateur
  async createUser(name: string, email: string, password: string, role: string) {
    // Protection : Un seul Admin autorisé
    if (role === 'Admin') {
      const existingAdmin = await this.prisma.user.findFirst({
        where: { role: 'Admin' },
      });

      if (existingAdmin) {
        throw new ForbiddenException('❌ Un administrateur existe déjà. Impossible de créer un second Admin.');
      }
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      throw new ConflictException('Cet email est déjà utilisé');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return user;
  }

  // BF3 : Modifier un utilisateur
  async updateUser(userId: string, data: { name?: string; email?: string; role?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Protection : Ne peut pas promouvoir quelqu'un en Admin si un Admin existe déjà
    if (data.role === 'Admin' && user.role !== 'Admin') {
      const existingAdmin = await this.prisma.user.findFirst({
        where: { role: 'Admin' },
      });

      if (existingAdmin) {
        throw new ForbiddenException('❌ Un administrateur existe déjà.');
      }
    }

    if (data.email && data.email !== user.email) {
      const existingEmail = await this.prisma.user.findUnique({ where: { email: data.email } });
      if (existingEmail) {
        throw new ConflictException('Cet email est déjà utilisé');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return updatedUser;
  }

  // BF4 : Supprimer un utilisateur
  async deleteUser(userId: string) {
  const user = await this.prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundException('Utilisateur non trouvé');
  if (user.role === 'Admin') throw new ForbiddenException('❌ Impossible de supprimer...');

  // ✅ NOUVEAU : supprime tout ce qui est lié à l'user AVANT
  const invoices = await this.prisma.invoice.findMany({ where: { userId }, select: { id: true } });
  const invoiceIds = invoices.map(inv => inv.id);
  if (invoiceIds.length > 0) {
    await this.prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  }

  const expenses = await this.prisma.expense.findMany({ where: { userId }, select: { id: true } });
  const expenseIds = expenses.map(exp => exp.id);
  if (expenseIds.length > 0) {
    await this.prisma.transactionLine.deleteMany({ where: { expenseId: { in: expenseIds } } });
  }

  await this.prisma.expense.deleteMany({ where: { userId } });
  await this.prisma.invoice.deleteMany({ where: { userId } });
  await this.prisma.oAuthToken.deleteMany({ where: { userId } }); // ← CAUSE DE L'ERREUR
  
  // Maintenant on peut supprimer l'user sans erreur
  await this.prisma.user.delete({ where: { id: userId } });
  return { message: '✅ Utilisateur supprimé avec succès', userId };
}

  // ✅ BF5 : Activer/Désactiver un compte
  async toggleUserStatus(userId: string, isActive: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Protection : Impossible de désactiver l'Admin
    if (user.role === 'Admin' && !isActive) {
      throw new ForbiddenException('❌ Impossible de désactiver le compte Administrateur.');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    return updatedUser;
  }

  // BF6 : Consulter les statistiques
  async getSystemStats() {
    const totalUsers = await this.prisma.user.count();
    const activeUsers = await this.prisma.user.count({ where: { isActive: true } });
    const inactiveUsers = totalUsers - activeUsers;

    const usersByRole = await this.prisma.user.groupBy({
      by: ['role'],
      _count: true,
    });

    const activeQBConnections = await this.prisma.oAuthToken.count({
      where: {
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    const totalInvoices = await this.prisma.invoice.count();
    const totalExpenses = await this.prisma.expense.count();

    return {
      totalUsers,
      activeUsers,
      inactiveUsers,
      usersByRole: usersByRole.map(r => ({ role: r.role, count: r._count })),
      activeQBConnections,
      totalInvoices,
      totalExpenses,
    };
  }
}