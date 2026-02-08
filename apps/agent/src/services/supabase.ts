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
  
  if (key.length < 100) {
    console.warn('⚠️ [Supabase] The service role key seems too short for a Supabase JWT. It should typically be several hundred characters long.');
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
