import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as qs from 'qs';

@Injectable()
export class QuickbooksService {
  constructor(private configService: ConfigService) {}

 getAuthorizationUrl(): string {
  const clientId = this.configService.get<string>('QB_CLIENT_ID');
  const redirectUri = this.configService.get<string>('QB_REDIRECT_URI');

  if (!clientId || !redirectUri) {
    throw new Error('Missing QuickBooks environment variables');
  }

  const state = Math.random().toString(36).substring(2);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: redirectUri,
    state: state,
  });

  return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
}

  async exchangeCode(code: string, realmId: string) {
    
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
return {
  message: "QuickBooks connected successfully",
};
  }
}