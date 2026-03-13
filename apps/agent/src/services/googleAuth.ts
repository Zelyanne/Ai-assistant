import { google } from 'googleapis';
import { config } from '../config/index.js';

type TokenExchangeResult = {
  tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
    scope?: string | null;
    [key: string]: unknown;
  };
  email: string | null | undefined;
  scopes: string[];
};

export const GOOGLE_WORKSPACE_SCOPES = {
  gmail: ['https://www.googleapis.com/auth/gmail.modify'],
  calendar: ['https://www.googleapis.com/auth/calendar'],
  drive: [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.file',
  ],
  docs: ['https://www.googleapis.com/auth/documents'],
  sheets: ['https://www.googleapis.com/auth/spreadsheets'],
  slides: ['https://www.googleapis.com/auth/presentations'],
  profile: ['https://www.googleapis.com/auth/userinfo.email'],
} as const;

export const GOOGLE_WORKSPACE_OAUTH_SCOPES = Array.from(
  new Set(Object.values(GOOGLE_WORKSPACE_SCOPES).flat()),
);

export class GoogleAuthService {
  private oauth2Client;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      config.GOOGLE_OAUTH_CLIENT_ID,
      config.GOOGLE_OAUTH_CLIENT_SECRET,
      config.GOOGLE_OAUTH_REDIRECT_URI
    );
  }

  /**
   * Generates the Google OAuth URL for authorization.
   * Forces consent to ensure a refresh token is always returned.
   */
  getAuthUrl(state: string): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_WORKSPACE_OAUTH_SCOPES,
      state, // organization_id passed via state
    });
  }

  /**
   * Exchanges an authorization code for access and refresh tokens.
   */
  async exchangeCodeForTokens(code: string): Promise<TokenExchangeResult> {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);

    // Also fetch the user's email to identify the account
    const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    return {
      tokens: tokens as Record<string, unknown>,
      email: userInfo.data.email,
      scopes:
        typeof tokens.scope === 'string'
          ? tokens.scope.split(' ').map((scope) => scope.trim()).filter(Boolean)
          : [],
    };
  }

  /**
   * Refreshes an access token using a refresh token.
   */
  async refreshAccessToken(refreshToken: string): Promise<{ access_token?: string | null; expiry_date?: number | null; [key: string]: unknown }> {
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await this.oauth2Client.refreshAccessToken();
    return credentials as { access_token?: string | null; expiry_date?: number | null; [key: string]: unknown };
  }
}

export const googleAuthService = new GoogleAuthService();
