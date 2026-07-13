import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import crypto from 'crypto';
import { verifyWebhookSignature } from './snaptrade.ts';

test('verifyWebhookSignature - valid signature', () => {
  const originalKey = process.env.SNAPTRADE_CONSUMER_KEY;
  process.env.SNAPTRADE_CONSUMER_KEY = 'test-consumer-key';

  try {
    const rawBody = JSON.stringify({
      eventType: 'ACCOUNT_TRANSACTIONS_UPDATED',
      userId: 'user-uuid',
      accountId: 'account-uuid',
    });

    const expectedSignature = crypto
      .createHmac('sha256', 'test-consumer-key')
      .update(rawBody)
      .digest('base64');

    const isValid = verifyWebhookSignature(rawBody, expectedSignature);
    assert.equal(isValid, true);
  } finally {
    process.env.SNAPTRADE_CONSUMER_KEY = originalKey;
  }
});

test('verifyWebhookSignature - invalid signature', () => {
  const originalKey = process.env.SNAPTRADE_CONSUMER_KEY;
  process.env.SNAPTRADE_CONSUMER_KEY = 'test-consumer-key';

  try {
    const rawBody = 'test-payload';
    const isValid = verifyWebhookSignature(rawBody, 'wrong-signature-base64');
    assert.equal(isValid, false);
  } finally {
    process.env.SNAPTRADE_CONSUMER_KEY = originalKey;
  }
});

test('verifyWebhookSignature - missing key or header', () => {
  const originalKey = process.env.SNAPTRADE_CONSUMER_KEY;
  delete process.env.SNAPTRADE_CONSUMER_KEY;

  try {
    const isValid = verifyWebhookSignature('payload', 'sig');
    assert.equal(isValid, false);
  } finally {
    process.env.SNAPTRADE_CONSUMER_KEY = originalKey;
  }
});
