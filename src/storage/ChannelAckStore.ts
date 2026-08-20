/**
 * Persist optimistic channel acks so cold starts stay correct when the
 * server's async ack pipeline (Redis → AMQP → crond → Mongo) lags or drops.
 */
const STORAGE_PREFIX = "stoat.js:channel-acks:";

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

/**
 * Load cached last-acked message ids for a user
 */
export function loadChannelAcks(userId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Remember that we locally acknowledged up to messageId in channelId
 */
export function rememberChannelAck(
  userId: string,
  channelId: string,
  messageId: string,
): void {
  try {
    const all = loadChannelAcks(userId);
    const previous = all[channelId];
    if (previous && previous.localeCompare(messageId) >= 0) return;
    all[channelId] = messageId;
    localStorage.setItem(storageKey(userId), JSON.stringify(all));
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Drop a cached ack once the server has caught up (or we no longer need it)
 */
export function forgetChannelAck(
  userId: string,
  channelId: string,
  messageId?: string,
): void {
  try {
    const all = loadChannelAcks(userId);
    if (!(channelId in all)) return;
    if (messageId && all[channelId].localeCompare(messageId) > 0) return;
    delete all[channelId];
    if (Object.keys(all).length === 0) {
      localStorage.removeItem(storageKey(userId));
    } else {
      localStorage.setItem(storageKey(userId), JSON.stringify(all));
    }
  } catch {
    // ignore
  }
}
