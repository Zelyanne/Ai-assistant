import { supabase } from './supabase.js';
import { encrypt } from '@ai-assistant/shared';

const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || '';

if (!ENCRYPTION_SECRET || ENCRYPTION_SECRET.length !== 32) {
  throw new Error('CRITICAL: ENCRYPTION_SECRET must be exactly 32 characters long.');
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
}

export async function storeWorkspaceTokens(
  organizationId: string,
  userId: string,
  provider: string,
  tokens: GoogleTokens
): Promise<{ success: boolean; error?: string }> {
  try {
    const encryptedAccessToken = encrypt(tokens.access_token, ENCRYPTION_SECRET);
    const encryptedRefreshToken = tokens.refresh_token 
      ? encrypt(tokens.refresh_token, ENCRYPTION_SECRET) 
      : null;

    const encryptedCreds = {
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
      expires_at: tokens.expires_at,
    };

    const { error } = await supabase
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
      });

    if (error) {
      console.error('Error storing tokens:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Token storage failed:', err);
    return { success: false, error: err.message };
  }
}
