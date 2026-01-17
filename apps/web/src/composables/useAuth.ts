import { supabase } from '../services/supabase';

export function useAuth() {
  const signInWithGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
        scopes: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.readonly',
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      console.error('Error signing in with Google:', error.message);
      throw error;
    }

    return data;
  };

  const handleAuthCallback = async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) throw error;
    
    if (session?.provider_token) {
      // Send tokens to Agent for secure storage
      // In a real app, organization_id would come from the user's profile
      const organizationId = session.user.user_metadata.organization_id;
      const userId = session.user.id;
      
      if (organizationId) {
        const agentUrl = import.meta.env.VITE_AGENT_URL || 'http://localhost:3001';
        await fetch(`${agentUrl}/api/tokens`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationId,
            userId,
            provider: 'google',
            tokens: {
              access_token: session.provider_token,
              refresh_token: session.provider_refresh_token,
              expires_at: new Date(Date.now() + (session.expires_in || 3600) * 1000).toISOString(),
            },
          }),
        });
      }
    }
  };

  return {
    signInWithGoogle,
    handleAuthCallback,
  };
}
