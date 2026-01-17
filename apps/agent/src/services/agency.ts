import { supabase } from './supabase.js';
import { AgencyTier } from '@ai-assistant/shared';

export class AgencyService {
  /**
   * Fetches the agency tier for a given topic in an organization.
   * Defaults to 'Restricted' if not found.
   */
  static async getTierForTopic(organizationId: string, topicName: string): Promise<AgencyTier> {
    const { data, error } = await supabase
      .from('agency_perimeters')
      .select('tier')
      .eq('organization_id', organizationId)
      .eq('topic_name', topicName)
      .single();

    if (error || !data) {
      console.warn(`[AgencyService] No tier found for topic "${topicName}" in org ${organizationId}. Defaulting to Restricted.`);
      return 'Restricted';
    }

    return data.tier as AgencyTier;
  }
}
