import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM Encryption Utility
 * Format: iv:authTag:encryptedData (hex)
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypts text using AES-256-GCM
 * @param text - The plain text to encrypt
 * @param secret - The 32-character encryption key
 * @returns string - Encrypted data in iv:authTag:encryptedData format
 */
export function encrypt(text: string, secret: string): string {
  if (secret.length !== 32) {
    throw new Error('Secret must be exactly 32 characters long for AES-256');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(secret), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts text using AES-256-GCM
 * @param encryptedText - Encrypted data in iv:authTag:encryptedData format
 * @param secret - The 32-character encryption key
 * @returns string - Decrypted plain text
 */
export function decrypt(encryptedText: string, secret: string): string {
  if (secret.length !== 32) {
    throw new Error('Secret must be exactly 32 characters long for AES-256');
  }

  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format');
  }

  const [ivHex, authTagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, Buffer.from(secret), iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(dataHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
