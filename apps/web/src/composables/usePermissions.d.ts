export declare function usePermissions(): {
    isCEO: import("vue").ComputedRef<boolean>;
    isPM: import("vue").ComputedRef<boolean>;
    isTeamMember: import("vue").ComputedRef<boolean>;
    role: import("vue").ComputedRef<"CEO" | "PM" | "Team Member" | "Simple User" | null>;
};
