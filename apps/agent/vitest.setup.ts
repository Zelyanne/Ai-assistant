// Ensure required env vars exist before any app modules import.

if (!process.env.NODE_ENV) process.env.NODE_ENV = 'test'
if (!process.env.ENCRYPTION_SECRET) {
  process.env.ENCRYPTION_SECRET = '0123456789abcdef0123456789abcdef'
}
