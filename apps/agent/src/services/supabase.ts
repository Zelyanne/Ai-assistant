import { createClient } from '@supabase/supabase-js';
import { Database } from '@ai-assistant/shared';
import { config } from '../config/index.js';

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
