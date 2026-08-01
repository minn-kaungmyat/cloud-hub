import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export function encryptToken(text: string | null | undefined): string | null {
  if (!text) return null;
  
  const masterKeyHex = process.env.CRYPTO_MASTER_KEY;
  if (!masterKeyHex || masterKeyHex.length !== 64) {
    throw new Error('CRYPTO_MASTER_KEY must be a 64-character hex string (32 bytes)');
  }

  const key = Buffer.from(masterKeyHex, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encryptedData
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

export function decryptToken(encryptedText: string | null | undefined): string | null {
  if (!encryptedText) return null;

  // If it doesn't look like our encrypted format, maybe it's legacy plain text
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    // Return as is (legacy plain text migration support)
    return encryptedText;
  }

  const masterKeyHex = process.env.CRYPTO_MASTER_KEY;
  if (!masterKeyHex || masterKeyHex.length !== 64) {
    throw new Error('CRYPTO_MASTER_KEY must be a 64-character hex string (32 bytes)');
  }

  try {
    const key = Buffer.from(masterKeyHex, 'hex');
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encryptedData = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    // If decryption fails, it could be a corrupt token or invalid key
    console.error('Failed to decrypt token', err);
    throw new Error('Token decryption failed');
  }
}
