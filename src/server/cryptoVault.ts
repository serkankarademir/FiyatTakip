import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const KEY_FILE = path.join(DATA_DIR, '.vault.key');

function getOrCreateMasterKey(): Buffer {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(KEY_FILE)) {
      const hex = fs.readFileSync(KEY_FILE, 'utf8').trim();
      if (hex.length === 64) {
        return Buffer.from(hex, 'hex');
      }
    }
    // Derive or generate a local machine-specific 256-bit key
    const randomKey = crypto.randomBytes(32);
    fs.writeFileSync(KEY_FILE, randomKey.toString('hex'), { mode: 0o600 });
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
