import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import * as qs from 'qs';

@Injectable()
export class QuickbooksService {
  private stateStore = new Map<string, Date>(); // Stockage temporaire du state

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService, // ← Injection de Prisma
  ) {}

  getAuthorizationUrl(): string {
    const clientId = this.configService.get<string>('QB_CLIENT_ID');
    const redirectUri = this.configService.get<string>('QB_REDIRECT_URI');

    if (!clientId || !redirectUri) {
      throw new Error('Missing QuickBooks environment variables');
    }

    // Génère un state sécurisé
    const state = Math.random().toString(36).substring(2);
    
    // Sauvegarde le state (expire après 10 minutes)
    this.stateStore.set(state, new Date(Date.now() + 10 * 60 * 1000));

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      redirect_uri: redirectUri,
      state: state,
    });

    return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
  }

  async exchangeCode(code: string, realmId: string, state: string, userId: string) {
    // Vérifie que le state est valide
    if (!this.stateStore.has(state)) {
      throw new Error('Invalid or expired state parameter');
    }
    this.stateStore.delete(state);

    const clientId = this.configService.get<string>('QB_CLIENT_ID');
    const clientSecret = this.configService.get<string>('QB_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('QB_REDIRECT_URI');

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      qs.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // 🔥 SAUVEGARDE DANS LA BASE DE DONNÉES
    const existingToken = await this.prisma.oAuthToken.findUnique({
      where: { userId },
    });

    if (existingToken) {
      // Met à jour le token existant
      await this.prisma.oAuthToken.update({
        where: { userId },
        data: {
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt,
          realmId,
        },
      });
    } else {
      // Crée un nouveau token
      await this.prisma.oAuthToken.create({
        data: {
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt,
          realmId,
          userId,
        },
      });
    }

    return {
      message: '✅ QuickBooks connected successfully and tokens saved!',
      realmId,
      expiresAt,
    };
  }

  async getCompanyInfo(userId: string) {
    // Récupère le token depuis la DB
    const tokenData = await this.prisma.oAuthToken.findUnique({
      where: { userId },
    });

    if (!tokenData) {
      throw new Error('Not authenticated yet. Please connect to QuickBooks first.');
    }

    // Vérifie si le token a expiré
    if (new Date() > tokenData.expiresAt) {
      throw new Error('Token expired. Please reconnect to QuickBooks.');
    }

    const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${tokenData.realmId}/companyinfo/${tokenData.realmId}`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${tokenData.accessToken}`,
        Accept: 'application/json',
      },
    });

    return response.data;
  }
}