import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import * as qs from 'qs';

@Injectable()
export class QuickbooksService {
  // Stockage temporaire des states OAuth
  private stateStore = new Map<string, Date>();

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  // ─────────────────────────────────────────────
  // ÉTAPE 1 : Générer l'URL d'autorisation OAuth
  // ─────────────────────────────────────────────
  getAuthorizationUrl(userId: string): string {
    const clientId = this.configService.get<string>('QB_CLIENT_ID');
    const redirectUri = this.configService.get<string>('QB_REDIRECT_URI');

    if (!clientId || !redirectUri) {
      throw new Error('Missing QuickBooks environment variables');
    }

    const state = `${userId}_${Math.random().toString(36).substring(2)}`;
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

  // ─────────────────────────────────────────────
  // ÉTAPE 2 : Échanger le code contre un access token
  // ─────────────────────────────────────────────
  async exchangeCode(code: string, realmId: string, state: string, userId: string) {
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

    // Sauvegarde ou mise à jour du token en DB
    const existingToken = await this.prisma.oAuthToken.findUnique({
      where: { userId },
    });

    if (existingToken) {
      await this.prisma.oAuthToken.update({
        where: { userId },
        data: { accessToken: access_token, refreshToken: refresh_token, expiresAt, realmId },
      });
    } else {
      await this.prisma.oAuthToken.create({
        data: { accessToken: access_token, refreshToken: refresh_token, expiresAt, realmId, userId },
      });
    }

    return {
      message: '✅ QuickBooks connected successfully and tokens saved!',
      realmId,
      expiresAt,
    };
  }

  // ─────────────────────────────────────────────
  // Refresh le token QuickBooks automatiquement
  // Appelé quand le access token est expiré
  // ─────────────────────────────────────────────
  private async refreshAccessToken(userId: string) {
    const tokenData = await this.prisma.oAuthToken.findUnique({
      where: { userId },
    });

    if (!tokenData) throw new Error('Non connecté à QuickBooks.');

    const clientId = this.configService.get<string>('QB_CLIENT_ID');
    const clientSecret = this.configService.get<string>('QB_CLIENT_SECRET');
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    // Appel QuickBooks pour obtenir un nouveau access token
    const response = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      qs.stringify({
        grant_type: 'refresh_token',
        refresh_token: tokenData.refreshToken,
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

    // Met à jour le token en DB
    await this.prisma.oAuthToken.update({
      where: { userId },
      data: { accessToken: access_token, refreshToken: refresh_token, expiresAt },
    });

    console.log('✅ Token QuickBooks rafraîchi avec succès');
    return { ...tokenData, accessToken: access_token, expiresAt };
  }

  // ─────────────────────────────────────────────
  // Récupère le token valide — refresh automatique si expiré
  // Utilisée par toutes les méthodes qui appellent QuickBooks
  // ─────────────────────────────────────────────
  private async getValidToken(userId: string) {
    const tokenData = await this.prisma.oAuthToken.findUnique({
      where: { userId },
    });

    if (!tokenData) {
      throw new Error('Non connecté à QuickBooks. Veuillez vous connecter d\'abord.');
    }

    // Si le token est expiré → refresh automatique
    if (new Date() > tokenData.expiresAt) {
      console.log('🔄 Token expiré — refresh automatique...');
      return await this.refreshAccessToken(userId);
    }

    return tokenData;
  }

  // ─────────────────────────────────────────────
  // DONNÉES 1 : Informations de l'entreprise
  // ─────────────────────────────────────────────
  async getCompanyInfo(userId: string) {
    const tokenData = await this.getValidToken(userId);

    const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${tokenData.realmId}/companyinfo/${tokenData.realmId}`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${tokenData.accessToken}`,
        Accept: 'application/json',
      },
    });

    // Retourne uniquement CompanyInfo
    return response.data.CompanyInfo;
  }

  // ─────────────────────────────────────────────
  // DONNÉES 2 : Liste des factures
  // ─────────────────────────────────────────────
  async getInvoices(userId: string) {
    const tokenData = await this.getValidToken(userId);

    const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${tokenData.realmId}/query?query=SELECT * FROM Invoice MAXRESULTS 20&minorversion=65`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${tokenData.accessToken}`,
        Accept: 'application/json',
      },
    });

    return response.data.QueryResponse.Invoice || [];
  }

  // ─────────────────────────────────────────────
  // DONNÉES 3 : Liste des clients
  // ─────────────────────────────────────────────
  async getCustomers(userId: string) {
    const tokenData = await this.getValidToken(userId);

    const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${tokenData.realmId}/query?query=SELECT * FROM Customer MAXRESULTS 20&minorversion=65`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${tokenData.accessToken}`,
        Accept: 'application/json',
      },
    });

    return response.data.QueryResponse.Customer || [];
  }

  // ─────────────────────────────────────────────
  // DONNÉES 4 : Rapport Profit & Loss
  // ─────────────────────────────────────────────
  async getProfitAndLoss(userId: string) {
    const tokenData = await this.getValidToken(userId);

    const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${tokenData.realmId}/reports/ProfitAndLoss?minorversion=65`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${tokenData.accessToken}`,
        Accept: 'application/json',
      },
    });

    return response.data;
  }
}