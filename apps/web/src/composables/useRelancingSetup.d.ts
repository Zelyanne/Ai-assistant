export type RelancingSetupStatus = 'incomplete' | 'complete';
export type RelancingSetupSnapshot = {
    contextId: string | null;
    projectName: string;
    deadline: string;
    members: string[];
    setupStatus: RelancingSetupStatus;
    missingFields: string[];
};
export type SaveRelancingSetupInput = {
    organizationId: string;
    contextId: string | null;
    projectName: string;
    membersInput: string;
    deadlineInput: string;
};
export declare function useRelancingSetup(): {
    loadSnapshot: (organizationId: string) => Promise<RelancingSetupSnapshot>;
    saveSetup: (input: SaveRelancingSetupInput) => Promise<RelancingSetupSnapshot>;
};
