-- Migration: Pause known-unsupported schedules + backfill assistant.command payload
-- Story: Scheduled Agent Requests: One-off + Finite Recurrence
-- Created: 2026-04-02

-- Prevent repeated failures/catch-up floods from deprecated task types.
UPDATE public.user_schedules
SET is_active = false,
    last_error = COALESCE(last_error, 'Unsupported schedule task_type paused by migration 20260402000400'),
    updated_at = now()
WHERE is_active = true
  AND task_type IN (
    'schedule.execute',
    'email.check',
    'calendar.check',
    'report.send',
    'reminder.send'
  );

-- Backfill assistant.command schedules missing task_payload.command.
UPDATE public.user_schedules
SET task_payload = jsonb_set(task_payload, '{command}', to_jsonb(task_payload->>'command_text'), true),
    updated_at = now()
WHERE task_type = 'assistant.command'
  AND (task_payload->>'command' IS NULL OR btrim(task_payload->>'command') = '')
  AND (task_payload->>'command_text' IS NOT NULL AND btrim(task_payload->>'command_text') <> '');

UPDATE public.user_schedules
SET task_payload = jsonb_set(task_payload, '{command}', to_jsonb(task_payload->>'message_text'), true),
    updated_at = now()
WHERE task_type = 'assistant.command'
  AND (task_payload->>'command' IS NULL OR btrim(task_payload->>'command') = '')
  AND (task_payload->>'message_text' IS NOT NULL AND btrim(task_payload->>'message_text') <> '');

-- Ensure scheduled assistant.command tasks never pause for confirmation at run time.
UPDATE public.user_schedules
SET task_payload = task_payload || jsonb_build_object('confirmed', true, 'high_risk', true),
    updated_at = now()
WHERE task_type = 'assistant.command'
  AND (task_payload->>'command' IS NOT NULL AND btrim(task_payload->>'command') <> '');

-- Inactivate assistant.command schedules that are still invalid after backfill.
UPDATE public.user_schedules
SET is_active = false,
    last_error = COALESCE(last_error, 'Invalid schedule payload: assistant.command requires task_payload.command'),
    updated_at = now()
WHERE task_type = 'assistant.command'
  AND is_active = true
  AND (task_payload->>'command' IS NULL OR btrim(task_payload->>'command') = '');

-- Pause schedules with invalid IANA timezones.
UPDATE public.user_schedules
SET is_active = false,
    last_error = COALESCE(last_error, 'Invalid schedule timezone'),
    updated_at = now()
WHERE is_active = true
  AND timezone IS NOT NULL
  AND timezone NOT IN (SELECT name FROM pg_timezone_names);

-- Pause schedules with invalid cron format (limited to *, */N, or exact integers; 5 fields).
WITH invalid AS (
  SELECT id
  FROM public.user_schedules
  WHERE is_active = true
    AND (
      array_length(regexp_split_to_array(btrim(cron_expression), '\\s+'), 1) <> 5
      OR NOT (
        (
          (regexp_split_to_array(btrim(cron_expression), '\\s+'))[1] = '*'
          OR (
            (regexp_split_to_array(btrim(cron_expression), '\\s+'))[1] ~ '^\\*\\/\\d+$'
            AND substring((regexp_split_to_array(btrim(cron_expression), '\\s+'))[1] from 3)::integer BETWEEN 1 AND 59
          )
          OR (
            (regexp_split_to_array(btrim(cron_expression), '\\s+'))[1] ~ '^\\d+$'
            AND ((regexp_split_to_array(btrim(cron_expression), '\\s+'))[1])::integer BETWEEN 0 AND 59
          )
        )
        AND (
          (regexp_split_to_array(btrim(cron_expression), '\\s+'))[2] = '*'
          OR (
            (regexp_split_to_array(btrim(cron_expression), '\\s+'))[2] ~ '^\\*\\/\\d+$'
            AND substring((regexp_split_to_array(btrim(cron_expression), '\\s+'))[2] from 3)::integer BETWEEN 1 AND 23
          )
          OR (
            (regexp_split_to_array(btrim(cron_expression), '\\s+'))[2] ~ '^\\d+$'
            AND ((regexp_split_to_array(btrim(cron_expression), '\\s+'))[2])::integer BETWEEN 0 AND 23
          )
        )
        AND (
          (regexp_split_to_array(btrim(cron_expression), '\\s+'))[3] = '*'
          OR (
            (regexp_split_to_array(btrim(cron_expression), '\\s+'))[3] ~ '^\\*\\/\\d+$'
            AND substring((regexp_split_to_array(btrim(cron_expression), '\\s+'))[3] from 3)::integer BETWEEN 1 AND 31
          )
          OR (
            (regexp_split_to_array(btrim(cron_expression), '\\s+'))[3] ~ '^\\d+$'
            AND ((regexp_split_to_array(btrim(cron_expression), '\\s+'))[3])::integer BETWEEN 1 AND 31
          )
        )
        AND (
          (regexp_split_to_array(btrim(cron_expression), '\\s+'))[4] = '*'
          OR (
            (regexp_split_to_array(btrim(cron_expression), '\\s+'))[4] ~ '^\\*\\/\\d+$'
            AND substring((regexp_split_to_array(btrim(cron_expression), '\\s+'))[4] from 3)::integer BETWEEN 1 AND 12
          )
          OR (
            (regexp_split_to_array(btrim(cron_expression), '\\s+'))[4] ~ '^\\d+$'
            AND ((regexp_split_to_array(btrim(cron_expression), '\\s+'))[4])::integer BETWEEN 1 AND 12
          )
        )
        AND (
          (regexp_split_to_array(btrim(cron_expression), '\\s+'))[5] = '*'
          OR (
            (regexp_split_to_array(btrim(cron_expression), '\\s+'))[5] ~ '^\\*\\/\\d+$'
            AND substring((regexp_split_to_array(btrim(cron_expression), '\\s+'))[5] from 3)::integer BETWEEN 1 AND 7
          )
          OR (
            (regexp_split_to_array(btrim(cron_expression), '\\s+'))[5] ~ '^\\d+$'
            AND ((regexp_split_to_array(btrim(cron_expression), '\\s+'))[5])::integer BETWEEN 0 AND 6
          )
        )
      )
    )
)
UPDATE public.user_schedules s
SET is_active = false,
    last_error = COALESCE(last_error, 'Invalid cron expression'),
    updated_at = now()
FROM invalid
WHERE s.id = invalid.id;
