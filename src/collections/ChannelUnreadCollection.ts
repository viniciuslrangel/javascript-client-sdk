import { batch } from "solid-js";

import type { ChannelUnread as APIChannelUnread } from "stoat-api";

import { ChannelUnread } from "../classes/ChannelUnread.js";
import { Channel } from "../classes/index.js";
import type { HydratedChannelUnread } from "../hydration/channelUnread.js";
import {
  forgetChannelAck,
  loadChannelAcks,
} from "../storage/ChannelAckStore.js";

import { ClassCollection } from "./Collection.js";

/**
 * Collection of Channel Unreads
 */
export class ChannelUnreadCollection extends ClassCollection<
  ChannelUnread,
  HydratedChannelUnread
> {
  /**
   * Load unread information from server
   *
   * Merges locally remembered acks so a cold start does not revive unreads
   * when the server ack worker has not persisted yet.
   */
  async sync(): Promise<void> {
    const unreads = await this.client.api.get("/sync/unreads");
    const userId = this.client.user!.id;
    const cached = loadChannelAcks(userId);
    const replay: [string, string][] = [];

    batch(() => {
      this.reset();
      for (const unread of unreads) {
        this.getOrCreate(unread._id.channel, unread);
      }

      for (const [channelId, messageId] of Object.entries(cached)) {
        const serverLast = this.get(channelId)?.lastMessageId ?? "0";
        if (serverLast.localeCompare(messageId) < 0) {
          this.getOrCreate(channelId, {
            _id: {
              channel: channelId,
              user: userId,
            },
            last_id: messageId,
            mentions: [],
          });
          this.updateUnderlyingObject(channelId, "lastMessageId", messageId);
          this.get(channelId)?.messageMentionIds.clear();
          replay.push([channelId, messageId]);
        } else {
          forgetChannelAck(userId, channelId);
        }
      }
    });

    await Promise.all(
      replay.map(([channelId, messageId]) =>
        this.client.api
          .put(`/channels/${channelId}/ack/${messageId as ""}`)
          .catch(() => undefined),
      ),
    );
  }

  /**
   * Flush debounced acks for every channel (call on pagehide)
   */
  flushPendingAcks(): void {
    for (const channel of this.client.channels.toList()) {
      channel.flushPendingAck();
    }
  }

  /**
   * Clear all unread data
   */
  reset(): void {
    this.updateUnderlyingObject({});
  }

  /**
   * Get or create
   * @param id Id
   * @param data Data
   */
  getOrCreate(id: string, data: APIChannelUnread): ChannelUnread {
    if (this.has(id)) {
      return this.get(id)!;
    } else {
      const instance = new ChannelUnread(this, id);
      this.create(id, "channelUnread", instance, this.client, data);
      return instance;
    }
  }

  /**
   * Get channel unread data for a specific Channel
   * @param channel Channel
   * @returns Unread
   */
  for(channel: Channel): ChannelUnread {
    return this.getOrCreate(channel.id, {
      _id: {
        channel: channel.id,
        user: this.client.user!.id,
      },
      last_id: null,
      mentions: [],
    });
  }
}
