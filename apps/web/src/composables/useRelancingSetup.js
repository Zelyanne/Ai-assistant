import { supabase } from '../services/supabase';
function parseMembers(input) {
    const values = input
        .split(/[\n,;]+/g)
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
    return Array.from(new Set(values));
}
function isValidFutureDeadline(deadlineIso) {
    if (!deadlineIso)
        return false;
    const deadlineDate = new Date(deadlineIso);
    if (Number.isNaN(deadlineDate.getTime()))
        return false;
    return deadlineDate.getTime() > Date.now();
}
function normalizeDeadline(deadlineInput) {
    if (!deadlineInput.trim())
        return null;
    const parsed = new Date(deadlineInput);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed.toISOString();
}
function collectMissingFields(projectName, members, deadlineIso) {
    const missing = [];
    if (projectName.trim().length === 0)
        missing.push('project_name');
    if (members.length < 1)
        missing.push('members');
    if (!isValidFutureDeadline(deadlineIso))
        missing.push('deadline');
    return missing;
}
export function useRelancingSetup() {
    async function loadSnapshot(organizationId) {
        const { data: contextRows, error: contextError } = await supabase
            .from('project_scheduling_contexts')
            .select('*')
            .eq('organization_id', organizationId)
            .order('updated_at', { ascending: false })
            .limit(1);
        if (contextError) {
            throw new Error(contextError.message);
        }
        const context = contextRows?.[0];
        if (!context) {
            return {
                contextId: null,
                projectName: '',
                deadline: '',
                members: [],
                setupStatus: 'incomplete',
                missingFields: ['project_name', 'members', 'deadline'],
            };
        }
        const { data: memberRows, error: memberError } = await supabase
            .from('project_member_assignments')
            .select('member_name')
            .eq('project_context_id', context.id)
            .eq('is_active', true);
        if (memberError) {
            throw new Error(memberError.message);
        }
        const members = (memberRows ?? [])
            .map((row) => row.member_name)
            .filter((name) => typeof name === 'string' && name.trim().length > 0);
        const missingFields = collectMissingFields(context.project_name, members, context.deadline);
        return {
            contextId: context.id,
            projectName: context.project_name,
            deadline: context.deadline ?? '',
            members,
            setupStatus: context.setup_status,
            missingFields,
        };
    }
    async function saveSetup(input) {
        const contextId = input.contextId ?? crypto.randomUUID();
        const members = parseMembers(input.membersInput);
        const projectName = input.projectName.trim();
        const deadlineIso = normalizeDeadline(input.deadlineInput);
        const missingFields = collectMissingFields(projectName, members, deadlineIso);
        const setupStatus = missingFields.length > 0 ? 'incomplete' : 'complete';
        const nowIso = new Date().toISOString();
        const { error: upsertError } = await supabase.from('project_scheduling_contexts').upsert({
            id: contextId,
            organization_id: input.organizationId,
            project_name: projectName,
            deadline: deadlineIso,
            setup_status: setupStatus,
            scheduler_config: {
                allow_overdue_nudging: true,
            },
            updated_at: nowIso,
        }, { onConflict: 'id' });
        if (upsertError) {
            throw new Error(upsertError.message);
        }
        const { error: deactivateError } = await supabase
            .from('project_member_assignments')
            .update({ is_active: false, updated_at: nowIso })
            .eq('project_context_id', contextId);
        if (deactivateError) {
            throw new Error(deactivateError.message);
        }
        if (members.length > 0) {
            const { error: memberUpsertError } = await supabase.from('project_member_assignments').upsert(members.map((memberName) => ({
                organization_id: input.organizationId,
                project_context_id: contextId,
                member_name: memberName,
                is_active: true,
                updated_at: nowIso,
            })), { onConflict: 'project_context_id,member_name' });
            if (memberUpsertError) {
                throw new Error(memberUpsertError.message);
            }
        }
        return {
            contextId,
            projectName,
            deadline: deadlineIso ?? '',
            members,
            setupStatus,
            missingFields,
        };
    }
    return {
        loadSnapshot,
        saveSetup,
    };
}
//# sourceMappingURL=useRelancingSetup.js.map