import { supabase } from './supabase.js';

/**
 * Service to handle scheduled morning briefs based on user preferences.
 */
export class BriefingScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL = 60 * 1000; // Check every minute
  private readonly DEFAULT_BRIEFING_TIME = '08:00';

  /**
   * Starts the scheduler.
   */
  start() {
    console.log('[BriefingScheduler] Starting scheduled brief monitor...');
    this.intervalId = setInterval(() => this.checkAndTriggerBriefs(), this.CHECK_INTERVAL);
    // Also run immediately on start
    this.checkAndTriggerBriefs();
  }

  /**
   * Stops the scheduler.
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Checks for users who are due for a morning brief and triggers the task.
   */
  private async checkAndTriggerBriefs() {
    try {
      const now = new Date();
      const currentHhMm = now.toTimeString().slice(0, 5); // "08:00"

      // 1. Find users due for the default morning brief time
      // and who haven't had a brief generated today.
      if (currentHhMm !== this.DEFAULT_BRIEFING_TIME) {
        return;
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: users, error } = await supabase
        .from('profiles')
        .select('id, organization_id, last_brief_generated_at')
        .not('organization_id', 'is', null);

      if (error) throw error;
      if (!users || users.length === 0) return;

      for (const user of users) {
        if (!user.organization_id) {
          continue;
        }

        // Double check: was it already generated today?
        const lastGen = user.last_brief_generated_at ? new Date(user.last_brief_generated_at) : null;
        if (lastGen && lastGen >= todayStart) {
          continue; 
        }

        console.log(`[BriefingScheduler] Triggering scheduled brief for user ${user.id} at ${currentHhMm}`);
        
        // 2. Queue the morning.brief task
        // The processor will automatically skip if no new relevant mail is found
        const { error: taskError } = await supabase.from('tasks').insert({
          organization_id: user.organization_id,
          user_id: user.id,
          domain_action: 'morning.brief',
          status: 'queued',
          payload: { scheduled: true }
        });

        if (taskError) {
          console.error(`[BriefingScheduler] Failed to queue brief for user ${user.id}:`, taskError);
        }
      }
    } catch (err) {
      console.error('[BriefingScheduler] Error in check cycle:', err);
    }
  }
}

export const briefingScheduler = new BriefingScheduler();
