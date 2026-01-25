import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../src/utils/encryption';

describe('Encryption Utility', () => {
  const testSecret = '0123456789abcdef0123456789abcdef'; // 32 characters for AES-256
  const testData = 'sensitive-google-token';

  it('should encrypt and decrypt data correctly', () => {
    const encrypted = encrypt(testData, testSecret);
    expect(encrypted).toBeDefined();
    expect(encrypted).not.toBe(testData);
    
    const decrypted = decrypt(encrypted, testSecret);
    expect(decrypted).toBe(testData);
  });

  it('should produce different ciphertexts for the same data (due to IV)', () => {
    const encrypted1 = encrypt(testData, testSecret);
    const encrypted2 = encrypt(testData, testSecret);
    
    expect(encrypted1).not.toBe(encrypted2);
  });

  it('should fail to decrypt with incorrect secret', () => {
    const encrypted = encrypt(testData, testSecret);
    const wrongSecret = 'wrong-secret-0123456789abcdefghi';
    
    expect(() => decrypt(encrypted, wrongSecret)).toThrow();
  });
});
