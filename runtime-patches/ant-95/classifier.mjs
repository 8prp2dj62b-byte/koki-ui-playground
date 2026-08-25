export function classifyConversation({ authoritativeIsOwn, firstMessageType, userOverride = null }) {
  if (userOverride === 'BUY' || userOverride === 'SELL') {
    return { domain: userOverride, source: 'USER_OVERRIDE', reason: 'MANUAL_USER_SELECTION' };
  }
  if (authoritativeIsOwn === true) {
    return { domain: 'SELL', source: 'OWNERSHIP_AUTHORITATIVE', reason: 'AUTHORITATIVE_OWN_ADVERT' };
  }
  if (firstMessageType === 'sent') {
    return { domain: 'BUY', source: 'THREAD_INITIATOR', reason: 'FIRST_MESSAGE_SENT_BY_CURRENT_ACCOUNT' };
  }
  if (firstMessageType === 'received') {
    return { domain: 'SELL', source: 'MESSAGE_DIRECTION', reason: 'FIRST_MESSAGE_RECEIVED_BY_CURRENT_ACCOUNT' };
  }
  return { domain: 'UNKNOWN', source: 'UNKNOWN', reason: 'INSUFFICIENT_CLASSIFICATION_EVIDENCE' };
}

export function unresolvedNotificationState(previous, threadId, now) {
  const prior = previous && previous.thread_id === threadId ? previous : null;
  return {
    thread_id: threadId,
    type: 'OLX_CLASSIFICATION_REQUIRED',
    status: 'ACTIVE',
    attempt_count: (prior?.attempt_count || 0) + 1,
    first_detected_at: prior?.first_detected_at || now,
    last_reconcile_at: now,
    dedupe_key: `olx-classification:${threadId}`,
  };
}
