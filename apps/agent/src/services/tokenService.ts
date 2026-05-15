import { supabase } from './supabase.js';
import { encrypt } from '@ai-assistant/shared/utils/encryption.js';
import { config } from '../config/index.js';
import { Effect } from 'effect';

const ENCRYPTION_SECRET = config.ENCRYPTION_SECRET;

if (!ENCRYPTION_SECRET || ENCRYPTION_SECRET.length !== 32) {
  throw new Error('CRITICAL: ENCRYPTION_SECRET_PROJECT_GOOGLE_ASSITANT must be exactly 32 characters long.');
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  scopes?: string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function storeWorkspaceTokensEffect(
  organizationId: string,
  userId: string,
  provider: string,
  tokens: GoogleTokens
): Effect.Effect<{ success: boolean; error?: string }, never> {
  return Effect.gen(function* () {
    const refreshToken = tokens.refresh_token;
    const encryptedAccessToken = yield* Effect.try({
      try: () => encrypt(tokens.access_token, ENCRYPTION_SECRET),
      catch: (error) => error,
    });
    const encryptedRefreshToken = refreshToken
      ? yield* Effect.try({
        try: () => encrypt(refreshToken, ENCRYPTION_SECRET),
        catch: (error) => error,
      })
      : null;

    const encryptedCreds = {
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
      expires_at: tokens.expires_at,
      scopes: tokens.scopes ?? [],
    };

    const { error } = yield* Effect.tryPromise({
      try: async () => await supabase
        .from('workspace_integrations')
        .upsert({
          organization_id: organizationId,
          user_id: userId,
          provider,
          encrypted_creds: encryptedCreds,
          sync_status: 'idle',
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'organization_id,provider'
        }),
      catch: (error) => error,
    });

    if (error) {
      console.error('Error storing tokens:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  }).pipe(
    Effect.catchAll((error) => Effect.sync(() => {
      console.error('Token storage failed:', error);
      return { success: false, error: errorMessage(error) };
    })),
  );
}

export async function storeWorkspaceTokens(
  organizationId: string,
  userId: string,
  provider: string,
  tokens: GoogleTokens
): Promise<{ success: boolean; error?: string }> {
  return Effect.runPromise(storeWorkspaceTokensEffect(organizationId, userId, provider, tokens));
}
