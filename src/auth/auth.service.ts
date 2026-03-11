import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async signup(name: string, email: string, password: string, role: string = 'user') {
    // Vérifie si l'email existe déjà
    const existingUser = await this.prisma.user.findUnique({ 
      where: { email } 
    });

    if (existingUser) {
      throw new ConflictException('Cet email existe déjà');
    }

    // Hash le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crée l'utilisateur
    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
      },
    });

    // Génère le token JWT
    const token = this.jwtService.sign({ 
      userId: user.id, 
      email: user.email 
    });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async login(email: string, password: string) {
    // Trouve l'utilisateur
    const user = await this.prisma.user.findUnique({ 
      where: { email } 
    });

    if (!user) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Vérifie le mot de passe
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Génère le token JWT
    const token = this.jwtService.sign({ 
      userId: user.id, 
      email: user.email 
    });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }
}