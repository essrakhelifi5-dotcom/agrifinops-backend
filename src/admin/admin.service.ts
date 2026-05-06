import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BF1 : Liste utilisateurs avec company
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async getAllUsers() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        company: true,  // ✅ AJOUT COMPANY
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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BF2 : Créer utilisateur avec company
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async createUser(
    name: string,
    email: string,
    password: string,
    role: string,
    company: string,  // ✅ AJOUT COMPANY
  ) {
    // Vérifier email unique
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ForbiddenException('Email déjà utilisé');
    }

    // Vérifier si un Admin existe déjà
    if (role === 'Admin') {
      const adminExists = await this.prisma.user.findFirst({
        where: { role: 'Admin' },
      });

      if (adminExists) {
        throw new ForbiddenException('❌ Un administrateur existe déjà.');
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Créer user avec company
    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        company,  // ✅ AJOUT COMPANY
        isActive: true,
      },
    });

    const { password: _, ...result } = user;
    return result;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BF3 : Modifier utilisateur avec company
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async updateUser(
    userId: string,
    name?: string,
    email?: string,
    role?: string,
    company?: string,  // ✅ AJOUT COMPANY
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Empêcher promotion en Admin si Admin existe
    if (role === 'Admin' && user.role !== 'Admin') {
      const adminExists = await this.prisma.user.findFirst({
        where: { role: 'Admin', id: { not: userId } },
      });

      if (adminExists) {
        throw new ForbiddenException('❌ Un administrateur existe déjà.');
      }
    }

    // Update avec company
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(role && { role }),
        ...(company && { company }),  // ✅ AJOUT COMPANY
      },
    });

    const { password: _, ...result } = updatedUser;
    return result;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BF4 : Supprimer utilisateur
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (user.role === 'Admin') {
      throw new ForbiddenException('❌ Impossible de supprimer l\'Admin.');
    }

    await this.prisma.user.delete({ where: { id: userId } });

    return { message: 'Utilisateur supprimé' };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BF5 : Toggle status
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async toggleUserStatus(userId: string, isActive: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (user.role === 'Admin' && !isActive) {
      throw new ForbiddenException('❌ Impossible de désactiver l\'Admin.');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
    });

    return updatedUser;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BF6 : Statistiques avec filtrage par company
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async getSystemStats(company?: string) {
    // Filtre par company si fourni
    const whereClause = company ? { company } : {};

    const totalUsers = await this.prisma.user.count({ where: whereClause });
    
    const activeUsers = await this.prisma.user.count({
      where: { ...whereClause, isActive: true },
    });
    
    const inactiveUsers = totalUsers - activeUsers;

    const ceoCount = await this.prisma.user.count({
      where: { ...whereClause, role: 'CEO' },
    });
    
    const managerCount = await this.prisma.user.count({
      where: { ...whereClause, role: 'Manager' },
    });
    
    const adminCount = await this.prisma.user.count({
      where: { ...whereClause, role: 'Admin' },
    });

    // Stats par company
    const s1Count = await this.prisma.user.count({ where: { company: 'S1' } });
    const s2Count = await this.prisma.user.count({ where: { company: 'S2' } });

    const activeQBConnections = await this.prisma.oAuthToken.count({
      where: {
        expiresAt: { gt: new Date() },
      },
    });

    const totalInvoices = await this.prisma.invoice.count();
    const totalExpenses = await this.prisma.expense.count();
    const totalPayments = await this.prisma.payment.count();

    return {
      totalUsers,
      activeUsers,
      inactiveUsers,
      ceoCount,
      managerCount,
      adminCount,
      s1Count,  // ✅ Stats company S1
      s2Count,  // ✅ Stats company S2
      activeQBConnections,
      totalInvoices,
      totalExpenses,
      totalPayments,
    };
  }
}