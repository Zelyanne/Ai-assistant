alter table public.profiles
add column if not exists memory_file_paths jsonb not null default '{}'::jsonb;
