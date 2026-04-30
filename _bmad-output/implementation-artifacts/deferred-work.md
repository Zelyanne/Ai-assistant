# Deferred Work

## AI Assistant Chat + Topic Watch Harness Refactor

- Add database-level uniqueness for topic-watch alert idempotency. Current code performs application-level duplicate checks for `command_messages.correlation_id` and `tasks.payload->>correlation_id`, which reduces duplicates but cannot fully prevent concurrent inserts. A follow-up migration should add first-class indexed/unique correlation keys or equivalent unique constraints and update inserts to treat conflict as success.
