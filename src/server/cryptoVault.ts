import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

function getDataDir(): string {
  if (process.env.DATABASE_PATH && process.env.DATABASE_PATH.trim()) {
    return path.dirname(path.resolve(process.env.DATABASE_PATH.trim()));
  }
  if (process.env.DATA_DIR && process.env.DATA_DIR.trim()) {
    return path.resolve(process.env.DATA_DIR.trim());
  }
  return path.resolve(process.cwd(), 'data');
}

function getOrCreateMasterKey(): Buffer {
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.trim()) {
    return crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY.trim()).digest();
  }
  const dataDir = getDataDir();
  const keyFile = path.join(dataDir, '.vault.key');
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (fs.existsSync(keyFile)) {
      const hex = fs.readFileSync(keyFile, 'utf8').trim();
      if (hex.length === 64) {
        return Buffer.from(hex, 'hex');
      }
    }
    // Derive or generate a local machine-specific 256-bit key
    const randomKey = crypto.randomBytes(32);
    fs.writeFileSync(keyFile, randomKey.toString('hex'), { mode: 0o600 });
    return randomKey;
  } catch {
    // Fallback derived from hostname + userInfo if filesystem is read-only
    const seed = `${os.hostname()}-${os.userInfo().username}-fiyat-takip-agent-v1`;
    return crypto.createHash('sha256').update(seed).digest();
  }
}

/**
 * Encrypts a secret string using AES-256-GCM before storing in SQLite.
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const key = getOrCreateMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a secret string stored with encryptSecret.
 */
export function decryptSecret(cipherText: string): string {
  if (!cipherText || !cipherText.includes(':')) return '';
  try {
    const [ivHex, tagHex, dataHex] = cipherText.split(':');
    if (!ivHex || !tagHex || !dataHex) return '';
    const key = getOrCreateMasterKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

/**
 * Masks a token for safe display in UI settings (e.g., "123456:ABC...XYZ")
 */
export function maskSecret(secret: string): string {
  if (!secret) return '';
  if (secret.length <= 8) return '••••••••';
  return `${secret.slice(0, 4)}••••••••${secret.slice(-4)}`;
}
