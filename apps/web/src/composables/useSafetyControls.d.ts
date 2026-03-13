export declare function useSafetyControls(): {
    emergencyBrakeEnabled: import("vue").Ref<boolean, boolean>;
    loading: import("vue").Ref<boolean, boolean>;
    saving: import("vue").Ref<boolean, boolean>;
    error: import("vue").Ref<string | null, string | null>;
    refresh: () => Promise<void>;
    subscribe: () => void;
    unsubscribe: () => void;
    setEmergencyBrakeEnabled: (enabled: boolean) => Promise<void>;
};
