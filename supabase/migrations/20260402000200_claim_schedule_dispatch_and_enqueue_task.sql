-- Migration: Atomic schedule dispatch claim + enqueue task
-- Story: Scheduled Agent Requests: One-off + Finite Recurrence
-- Created: 2026-04-02

CREATE OR REPLACE FUNCTION public.claim_schedule_dispatch(
  schedule_id UUID,
  dispatch_window_start TIMESTAMPTZ,
  dispatch_window_end TIMESTAMPTZ
)
RETURNS TABLE (
  should_dispatch BOOLEAN,
  reason TEXT,
  dispatch_id UUID,
  task_id UUID,
  remaining_runs_after INTEGER,
  is_active_after BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  schedule_row public.user_schedules%ROWTYPE;
  claimed_dispatch_id UUID;
  inserted_task_id UUID;
  sanitized_payload JSONB;
  effective_payload JSONB;
  command_value TEXT;
  remaining_after INTEGER;
  active_after BOOLEAN;
BEGIN
  -- Explicit auth guard: only service_role should call this RPC.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'claim_schedule_dispatch is restricted to service_role';
  END IF;

  SELECT *
    INTO schedule_row
    FROM public.user_schedules
   WHERE id = schedule_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found', NULL::uuid, NULL::uuid, NULL::integer, NULL::boolean;
    RETURN;
  END IF;

  IF schedule_row.is_active IS DISTINCT FROM true THEN
    RETURN QUERY SELECT false, 'inactive', NULL::uuid, NULL::uuid, schedule_row.remaining_runs, schedule_row.is_active;
    RETURN;
  END IF;

  -- End cutoff semantics: occurrences at or after end_at are not eligible.
  IF schedule_row.end_at IS NOT NULL AND dispatch_window_start >= schedule_row.end_at THEN
    UPDATE public.user_schedules
       SET is_active = false,
           updated_at = now()
     WHERE id = schedule_id;

    RETURN QUERY SELECT false, 'ended', NULL::uuid, NULL::uuid, schedule_row.remaining_runs, false;
    RETURN;
  END IF;

  IF schedule_row.remaining_runs IS NOT NULL AND schedule_row.remaining_runs <= 0 THEN
    UPDATE public.user_schedules
       SET is_active = false,
           updated_at = now()
     WHERE id = schedule_id;

    RETURN QUERY SELECT false, 'exhausted', NULL::uuid, NULL::uuid, schedule_row.remaining_runs, false;
    RETURN;
  END IF;

  INSERT INTO public.user_schedule_dispatches (
    organization_id,
    schedule_id,
    dispatch_window_start,
    dispatch_window_end
  ) VALUES (
    schedule_row.organization_id,
    schedule_id,
    dispatch_window_start,
    dispatch_window_end
  )
  ON CONFLICT (schedule_id, dispatch_window_start) DO NOTHING
  RETURNING id INTO claimed_dispatch_id;

  IF claimed_dispatch_id IS NULL THEN
    RETURN QUERY SELECT false, 'already_claimed', NULL::uuid, NULL::uuid, schedule_row.remaining_runs, schedule_row.is_active;
    RETURN;
  END IF;

  sanitized_payload := COALESCE(schedule_row.task_payload, '{}'::jsonb)
    - 'scheduled'
    - 'schedule_id'
    - 'schedule_dispatch_id'
    - 'cron_expression'
    - 'timezone'
    - 'trigger_time'
    - 'topic'
    - 'organization_id'
    - 'user_id'
    - 'status';

  -- Enforce invariants for assistant.command schedules.
  IF schedule_row.task_type = 'assistant.command' THEN
    command_value := NULLIF(btrim(sanitized_payload->>'command'), '');

    -- Backward-compat: accept command_text/message_text as a fallback.
    IF command_value IS NULL THEN
      command_value := NULLIF(btrim(sanitized_payload->>'command_text'), '');
    END IF;
    IF command_value IS NULL THEN
      command_value := NULLIF(btrim(sanitized_payload->>'message_text'), '');
    END IF;

    IF command_value IS NULL THEN
      UPDATE public.user_schedules
         SET is_active = false,
             last_error = 'Invalid schedule payload: assistant.command requires task_payload.command',
             updated_at = now()
       WHERE id = schedule_id;

      -- Do not burn the dispatch window.
      DELETE FROM public.user_schedule_dispatches WHERE id = claimed_dispatch_id;

      RETURN QUERY SELECT false, 'invalid_payload', NULL::uuid, NULL::uuid, schedule_row.remaining_runs, false;
      RETURN;
    END IF;

    sanitized_payload := sanitized_payload
      || jsonb_build_object(
        'command', command_value,
        'command_text', COALESCE(NULLIF(btrim(sanitized_payload->>'command_text'), ''), command_value),
        'message_text', COALESCE(NULLIF(btrim(sanitized_payload->>'message_text'), ''), command_value),
        'confirmed', true,
        'high_risk', true
      );
  END IF;

  effective_payload := sanitized_payload
    || jsonb_build_object(
      'schedule_id', schedule_id,
      'schedule_dispatch_id', claimed_dispatch_id,
      'cron_expression', schedule_row.cron_expression,
      'timezone', schedule_row.timezone,
      'scheduled', true,
      'trigger_time', dispatch_window_start
    );

  INSERT INTO public.tasks (
    organization_id,
    user_id,
    domain_action,
    topic,
    status,
    payload
  ) VALUES (
    schedule_row.organization_id,
    schedule_row.user_id,
    schedule_row.task_type,
    COALESCE(schedule_row.topic, 'Schedule'),
    'queued',
    effective_payload
  )
  RETURNING id INTO inserted_task_id;

  UPDATE public.user_schedule_dispatches
     SET task_id = inserted_task_id
   WHERE id = claimed_dispatch_id;

  UPDATE public.user_schedules
     SET run_count = run_count + 1,
         remaining_runs = CASE
           WHEN remaining_runs IS NULL THEN NULL
           ELSE remaining_runs - 1
         END,
         is_active = CASE
           WHEN remaining_runs IS NULL THEN is_active
           ELSE (remaining_runs - 1) > 0
         END,
         updated_at = now()
   WHERE id = schedule_id
  RETURNING remaining_runs, is_active INTO remaining_after, active_after;

  RETURN QUERY SELECT true, 'dispatched', claimed_dispatch_id, inserted_task_id, remaining_after, active_after;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_schedule_dispatch(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_schedule_dispatch(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  TO service_role;
