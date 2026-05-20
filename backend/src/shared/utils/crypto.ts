import crypto from 'node:crypto';
import { logger } from './logger.js';

const ALGORITHM = 'aes-256-gcm';
// Default key for dev fallback, MUST be set in production .env
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'fallback_dev_key_change_me_in_prod_123'; 

export function encryptSession(data: any): any {
  if (!data) return data;
  if (data.__encrypted) return data; // Already encrypted

  try {
    const iv = crypto.randomBytes(12);
    // Ensure key is exactly 32 bytes
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    const payload = JSON.stringify(data);
    let encrypted = cipher.update(payload, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return {
      __encrypted: true,
      data: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag
    };
  } catch (err) {
    logger.error('Failed to encrypt session:', err);
    throw err;
  }
}

export function decryptSession(data: any): any {
  if (!data) return data;
  if (!data.__encrypted) return data; // Not encrypted, legacy format

  try {
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(data.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
    
    let decrypted = decipher.update(data.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (err) {
    logger.error('Failed to decrypt session:', err);
    return null;
  }
}
