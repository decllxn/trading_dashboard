import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const PREFIX = 'enc:v1:';

/**
 * Derive a 256-bit encryption key uniquely per user using PBKDF2.
 */
function getDerivedKey(userId: string): Buffer {
  const masterSecret =
    process.env.ENCRYPTION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'trading-dashboard-e2ee-secret-key-salt-987123';
  const salt = crypto.createHash('sha256').update(`${masterSecret}:${userId}`).digest();
  return crypto.pbkdf2Sync(userId, salt, 10000, 32, 'sha256');
}

/**
 * Encrypt a plain text string. Returns "enc:v1:<ivHex>:<authTagHex>:<ciphertextHex>".
 */
export function encryptText(text: string | null | undefined, userId: string): string | null {
  if (text == null) return null;
  if (typeof text !== 'string') text = String(text);
  if (!text) return text;
  if (text.startsWith(PREFIX)) return text; // Already encrypted

  const key = getDerivedKey(userId);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a string starting with "enc:v1:". If unencrypted (legacy row), returns original text as-is.
 */
export function decryptText(encryptedText: string | null | undefined, userId: string): string | null {
  if (encryptedText == null) return null;
  if (typeof encryptedText !== 'string') return String(encryptedText);
  if (!encryptedText.startsWith(PREFIX)) return encryptedText;

  try {
    const raw = encryptedText.slice(PREFIX.length);
    const parts = raw.split(':');
    if (parts.length !== 3) return encryptedText;

    const [ivHex, authTagHex, cipherHex] = parts;
    const key = getDerivedKey(userId);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Decryption error for user:', userId, err);
    return encryptedText;
  }
}

/**
 * Encrypt a JSON-serializable value (object, array, etc.) into an encrypted payload.
 */
export function encryptJson<T>(data: T, userId: string): any {
  if (data == null) return data;
  const jsonString = JSON.stringify(data);
  return encryptText(jsonString, userId);
}

/**
 * Decrypt an encrypted JSON payload back into type T.
 */
export function decryptJson<T>(payload: any, userId: string): T {
  if (payload == null) return payload as T;
  if (typeof payload === 'string' && payload.startsWith(PREFIX)) {
    const decryptedStr = decryptText(payload, userId);
    if (!decryptedStr) return payload as T;
    try {
      return JSON.parse(decryptedStr) as T;
    } catch {
      return decryptedStr as unknown as T;
    }
  }
  return payload as T;
}
