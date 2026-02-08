export declare const useUserStore: import("pinia").StoreDefinition<"user", Pick<{
    profile: import("vue").Ref<{
        id: string;
        organization_id?: string | null | undefined | undefined;
        updated_at?: string | undefined | undefined;
        email?: string | null | undefined | undefined;
        full_name?: string | null | undefined | undefined;
        avatar_url?: string | null | undefined | undefined;
        role?: "CEO" | "PM" | "Team Member" | "Simple User" | null | undefined | undefined;
    } | null, {
        id: string;
        organization_id?: string | null | undefined;
        updated_at?: string | undefined;
        email?: string | null | undefined;
        full_name?: string | null | undefined;
        avatar_url?: string | null | undefined;
        role?: "CEO" | "PM" | "Team Member" | "Simple User" | null | undefined;
    } | {
        id: string;
        organization_id?: string | null | undefined | undefined;
        updated_at?: string | undefined | undefined;
        email?: string | null | undefined | undefined;
        full_name?: string | null | undefined | undefined;
        avatar_url?: string | null | undefined | undefined;
        role?: "CEO" | "PM" | "Team Member" | "Simple User" | null | undefined | undefined;
    } | null>;
    loading: import("vue").Ref<boolean, boolean>;
    role: import("vue").ComputedRef<"CEO" | "PM" | "Team Member" | "Simple User" | null>;
    isCEO: import("vue").ComputedRef<boolean>;
    isPM: import("vue").ComputedRef<boolean>;
    isTeamMember: import("vue").ComputedRef<boolean>;
    isSimpleUser: import("vue").ComputedRef<boolean>;
    hasOrganization: import("vue").ComputedRef<boolean>;
    fetchProfile: () => Promise<void>;
}, "profile" | "loading">, Pick<{
    profile: import("vue").Ref<{
        id: string;
        organization_id?: string | null | undefined | undefined;
        updated_at?: string | undefined | undefined;
        email?: string | null | undefined | undefined;
        full_name?: string | null | undefined | undefined;
        avatar_url?: string | null | undefined | undefined;
        role?: "CEO" | "PM" | "Team Member" | "Simple User" | null | undefined | undefined;
    } | null, {
        id: string;
        organization_id?: string | null | undefined;
        updated_at?: string | undefined;
        email?: string | null | undefined;
        full_name?: string | null | undefined;
        avatar_url?: string | null | undefined;
        role?: "CEO" | "PM" | "Team Member" | "Simple User" | null | undefined;
    } | {
        id: string;
        organization_id?: string | null | undefined | undefined;
        updated_at?: string | undefined | undefined;
        email?: string | null | undefined | undefined;
        full_name?: string | null | undefined | undefined;
        avatar_url?: string | null | undefined | undefined;
        role?: "CEO" | "PM" | "Team Member" | "Simple User" | null | undefined | undefined;
    } | null>;
    loading: import("vue").Ref<boolean, boolean>;
    role: import("vue").ComputedRef<"CEO" | "PM" | "Team Member" | "Simple User" | null>;
    isCEO: import("vue").ComputedRef<boolean>;
    isPM: import("vue").ComputedRef<boolean>;
    isTeamMember: import("vue").ComputedRef<boolean>;
    isSimpleUser: import("vue").ComputedRef<boolean>;
    hasOrganization: import("vue").ComputedRef<boolean>;
    fetchProfile: () => Promise<void>;
}, "role" | "isCEO" | "isPM" | "isTeamMember" | "isSimpleUser" | "hasOrganization">, Pick<{
    profile: import("vue").Ref<{
        id: string;
        organization_id?: string | null | undefined | undefined;
        updated_at?: string | undefined | undefined;
        email?: string | null | undefined | undefined;
        full_name?: string | null | undefined | undefined;
        avatar_url?: string | null | undefined | undefined;
        role?: "CEO" | "PM" | "Team Member" | "Simple User" | null | undefined | undefined;
    } | null, {
        id: string;
        organization_id?: string | null | undefined;
        updated_at?: string | undefined;
        email?: string | null | undefined;
        full_name?: string | null | undefined;
        avatar_url?: string | null | undefined;
        role?: "CEO" | "PM" | "Team Member" | "Simple User" | null | undefined;
    } | {
        id: string;
        organization_id?: string | null | undefined | undefined;
        updated_at?: string | undefined | undefined;
        email?: string | null | undefined | undefined;
        full_name?: string | null | undefined | undefined;
        avatar_url?: string | null | undefined | undefined;
        role?: "CEO" | "PM" | "Team Member" | "Simple User" | null | undefined | undefined;
    } | null>;
    loading: import("vue").Ref<boolean, boolean>;
    role: import("vue").ComputedRef<"CEO" | "PM" | "Team Member" | "Simple User" | null>;
    isCEO: import("vue").ComputedRef<boolean>;
    isPM: import("vue").ComputedRef<boolean>;
    isTeamMember: import("vue").ComputedRef<boolean>;
    isSimpleUser: import("vue").ComputedRef<boolean>;
    hasOrganization: import("vue").ComputedRef<boolean>;
    fetchProfile: () => Promise<void>;
}, "fetchProfile">>;
