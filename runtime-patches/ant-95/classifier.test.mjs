import assert from 'node:assert/strict';
import { classifyConversation, unresolvedNotificationState } from './classifier.mjs';

const cases = [
  [{ authoritativeIsOwn: true, firstMessageType: 'sent' }, 'SELL', 'OWNERSHIP_AUTHORITATIVE'],
  [{ authoritativeIsOwn: false, firstMessageType: 'sent' }, 'BUY', 'THREAD_INITIATOR'],
  [{ authoritativeIsOwn: null, firstMessageType: 'sent' }, 'BUY', 'THREAD_INITIATOR'],
  [{ authoritativeIsOwn: false, firstMessageType: 'received' }, 'SELL', 'MESSAGE_DIRECTION'],
  [{ authoritativeIsOwn: null, firstMessageType: 'received' }, 'SELL', 'MESSAGE_DIRECTION'],
  [{ authoritativeIsOwn: null, firstMessageType: undefined }, 'UNKNOWN', 'UNKNOWN'],
  [{ authoritativeIsOwn: true, firstMessageType: 'sent', userOverride: 'BUY' }, 'BUY', 'USER_OVERRIDE'],
  [{ authoritativeIsOwn: false, firstMessageType: 'received', userOverride: 'SELL' }, 'SELL', 'USER_OVERRIDE'],
];
for (const [input, domain, source] of cases) {
  const got = classifyConversation(input);
  assert.equal(got.domain, domain, JSON.stringify(input));
  assert.equal(got.source, source, JSON.stringify(input));
}

const n1 = unresolvedNotificationState(null, 3024983000, '2026-08-25T16:40:00Z');
const n2 = unresolvedNotificationState(n1, 3024983000, '2026-08-25T16:41:00Z');
assert.equal(n1.attempt_count, 1);
assert.equal(n2.attempt_count, 2);
assert.equal(n1.dedupe_key, n2.dedupe_key);
assert.equal(n2.first_detected_at, n1.first_detected_at);

console.log(`PASS ${cases.length + 4} assertions`);
