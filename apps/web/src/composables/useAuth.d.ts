export declare function useAuth(): {
    signInWithGoogle: () => Promise<{
        provider: import("@supabase/supabase-js").Provider;
        url: string;
    }>;
    handleAuthCallback: () => Promise<void>;
};
