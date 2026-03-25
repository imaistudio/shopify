import crypto from 'crypto';

const DEFAULT_ENCRYPTION_KEY = 'your-32-character-encryption-key-here';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || DEFAULT_ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_BYTES = Buffer.from(ENCRYPTION_KEY).subarray(0, 32);

if (process.env.NODE_ENV === "production" && ENCRYPTION_KEY === DEFAULT_ENCRYPTION_KEY) {
  throw new Error("ENCRYPTION_KEY must be set in production");
}

if (KEY_BYTES.length !== 32) {
  throw new Error("ENCRYPTION_KEY must be at least 32 bytes");
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY_BYTES, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

export function decrypt(encryptedData: string): string {
  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY_BYTES, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

export function maskApiKey(apiKey: string): string {
  return `${apiKey.slice(0, 12)}••••${apiKey.slice(-4)}`;
}
