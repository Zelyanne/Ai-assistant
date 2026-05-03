import { createClient } from '@supabase/supabase-js';
import type { Database } from '@ai-assistant/shared';


const supabaseUrl = import.meta.env.VITE_SUPABASE_URL_PROJECT_GOOGLE_ASSITANT || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY_PROJECT_GOOGLE_ASSITANT || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing (VITE_SUPABASE_URL_PROJECT_GOOGLE_ASSITANT, VITE_SUPABASE_ANON_KEY_PROJECT_GOOGLE_ASSITANT).');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

export const signInWithGoogle = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/onboarding',
    },
  });
  if (error) throw error;
};

