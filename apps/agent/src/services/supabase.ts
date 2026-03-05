import { createClient } from '@supabase/supabase-js';
import { Database } from '@ai-assistant/shared';
import { config } from '../config/index.js';

console.log(`[Supabase] Initializing client for URL: ${config.SUPABASE_URL}`);
if (!config.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[Supabase] Missing SUPABASE_SERVICE_ROLE_KEY');
} else {
  const key = config.SUPABASE_SERVICE_ROLE_KEY;
  const maskedKey = `${key.substring(0, 5)}...${key.substring(key.length - 5)}`;
  console.log(`[Supabase] Service role key confirmed: ${maskedKey} (length: ${key.length})`);

  const isJwtStyleKey = key.split('.').length === 3;
  const isSupabaseSecretKey = key.startsWith('sb_secret_');

  if (!isJwtStyleKey && !isSupabaseSecretKey) {
    console.warn('⚠️ [Supabase] SUPABASE_SERVICE_ROLE_KEY format is unusual. Expected a JWT-style key or an sb_secret_* key.');
  }
}

export const supabase = createClient<Database>(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
