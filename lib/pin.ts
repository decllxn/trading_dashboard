import crypto from 'crypto';

export function hashPin(pin: string, userId: string): string {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('PIN must be exactly 4 digits');
  }
  return crypto.createHash('sha256').update(`journal-pin:${userId}:${pin}`).digest('hex');
}

export function verifyPin(enteredPin: string, storedHash: string, userId: string): boolean {
  if (!storedHash || !/^\d{4}$/.test(enteredPin)) return false;
  return hashPin(enteredPin, userId) === storedHash;
}
