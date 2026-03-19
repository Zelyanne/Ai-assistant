import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../.env');
const UTC_TIME_LABEL_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Check if .env exists, if not, try current dir (dist/ or src/)
import { existsSync } from 'fs';
const activeEnvPath = existsSync(envPath) ? envPath : path.resolve(process.cwd(), '.env');

dotenv.config({ path: activeEnvPath, override: true });

function parseEodTriggerTimeOverrides(
  value: string | undefined,
  ctx: z.RefinementCtx,
): Record<string, string> {
  if (!value || value.trim().length === 0) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'EOD_TRIGGER_TIME_BY_ORG_JSON must be valid JSON',
    });
    return z.NEVER;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'EOD_TRIGGER_TIME_BY_ORG_JSON must be a JSON object keyed by organization id',
    });
    return z.NEVER;
  }

  const overrides: Record<string, string> = {};

  for (const [organizationId, triggerTime] of Object.entries(parsed)) {
    if (typeof triggerTime !== 'string' || !UTC_TIME_LABEL_PATTERN.test(triggerTime.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `EOD trigger override for ${organizationId} must use UTC HH:MM format`,
      });
      return z.NEVER;
    }

    overrides[organizationId] = triggerTime.trim();
  }

  return overrides;
}

const envSchema = z.object({
  SUPABASE_URL: z.string().url().transform((val) => val.trim()),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).transform((val) => val.trim()),
  MISTRAL_API_KEY: z.string().min(1).transform((val) => val.trim()),
  DEFAULT_LLM_MODEL: z.string().default('mistral-small-latest'),
  OPENAI_API_KEY: z.string().min(1).optional().transform((val) => val?.trim()),
  ANTHROPIC_API_KEY: z.string().min(1).optional().transform((val) => val?.trim()),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3001'),
  CONFIDENCE_THRESHOLD: z.coerce.number().default(0.8),
  EOD_TRIGGER_TIME_UTC: z
    .string()
    .regex(UTC_TIME_LABEL_PATTERN)
    .default('23:00')
    .transform((val) => val.trim()),
  EOD_TRIGGER_TIME_BY_ORG_JSON: z
    .string()
    .optional()
    .transform((val, ctx) => parseEodTriggerTimeOverrides(val, ctx)),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).transform((val) => val.trim()),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).transform((val) => val.trim()),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().transform((val) => val.trim()),
  ENCRYPTION_SECRET: z.string().length(32),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional().transform((val) => val?.trim()),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional().transform((val) => val?.trim()),
  // WhatsApp/Twilio
  WHATSAPP_API_KEY: z.string().min(1).optional().transform((val) => val?.trim()),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional().transform((val) => val?.trim()),
  WHATSAPP_WEBHOOK_SECRET: z.string().min(1).optional().transform((val) => val?.trim()),
  TWILIO_ACCOUNT_SID: z.string().min(1).optional().transform((val) => val?.trim()),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional().transform((val) => val?.trim()),
  TWILIO_WHATSAPP_PHONE_NUMBER: z.string().min(1).optional().transform((val) => val?.trim()),
  // Langfuse Tracing Variables (NEW - Primary)
  ENABLE_LANGFUSE_TRACING: z.string().default('false').transform((val) => val === 'true'),
  LANGFUSE_PUBLIC_KEY: z.string().min(1).optional().transform((val) => val?.trim()),
  LANGFUSE_SECRET_KEY: z.string().min(1).optional().transform((val) => val?.trim()),
  LANGFUSE_HOST: z.string().url().default('https://cloud.langfuse.com').transform((val) => val.trim()),
  // Legacy LangSmith Tracing Variables (DEPRECATED - kept for rollback)
  LANGSMITH_TRACING: z.string().default('false').transform((val) => val === 'true'),
  LANGSMITH_ENDPOINT: z.string().url().default('https://api.smith.langchain.com').transform((val) => val.trim()),
  LANGSMITH_API_KEY: z.string().min(1).optional().transform((val) => val?.trim()),
  LANGSMITH_PROJECT: z.string().min(1).default('ai-assistant').transform((val) => val.trim()),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  process.exit(1);
}

export const config = _env.data;

// Validate Langfuse configuration if enabled
if (config.ENABLE_LANGFUSE_TRACING) {
  if (!config.LANGFUSE_PUBLIC_KEY || !config.LANGFUSE_SECRET_KEY) {
    console.warn('[Config Warning] ENABLE_LANGFUSE_TRACING is enabled but LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY is missing');
  }
}

// Legacy LangSmith validation (deprecated)
if (config.LANGSMITH_TRACING && !config.LANGSMITH_API_KEY) {
  console.warn('[Config Warning] LANGSMITH_TRACING is enabled but LANGSMITH_API_KEY is missing (LangSmith is deprecated)');
}

console.log(`[Config] Loaded configuration for Supabase URL: ${config.SUPABASE_URL}`);
console.log(`[Config] Langfuse tracing: ${config.ENABLE_LANGFUSE_TRACING ? 'ENABLED' : 'DISABLED'}`);
if (config.LANGSMITH_TRACING) {
  console.log('[Config] ⚠️  LangSmith tracing is DEPRECATED - consider migrating to Langfuse');
}
