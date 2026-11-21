import Notification from "../models/Notification.js";
import { emitToUser } from "./socketService.js";

/**
 * Create a single notification in MongoDB and emit it via Socket.IO.
 *
 * @param {Object} notifData - Fields matching the Notification schema
 *   (recipient, title, message, type, relatedIssue).
 * @returns {Promise<Object>} The saved notification document.
 */
export const createAndEmitNotification = async (notifData) => {
  const notification = await Notification.create(notifData);

  const recipientId = notification.recipient.toString();

  // Emit real-time event
  emitToUser(recipientId, "notification:new", notification);

  // Also emit updated unread count
  const unreadCount = await Notification.countDocuments({
    recipient: notification.recipient,
    isRead: false,
  });
  emitToUser(recipientId, "notification:count", { unreadCount });

  return notification;
};

/**
 * Create multiple notifications in MongoDB and emit each via Socket.IO.
 *
 * @param {Array<Object>} notifArray - Array of notification data objects.
 * @returns {Promise<Array<Object>>} The saved notification documents.
 */
export const createAndEmitMany = async (notifArray) => {
  if (!notifArray || notifArray.length === 0) return [];

  const notifications = await Notification.insertMany(notifArray);

  // Collect unique recipients to emit events
  const recipientIds = [...new Set(notifArray.map((n) => n.recipient.toString()))];

  for (const recipientId of recipientIds) {
    // Find notifications for this recipient from the batch
    const userNotifs = notifications.filter(
      (n) => n.recipient.toString() === recipientId
    );

    // Emit each notification individually
    for (const notif of userNotifs) {
      emitToUser(recipientId, "notification:new", notif);
    }

    // Emit updated unread count once per recipient
    const unreadCount = await Notification.countDocuments({
      recipient: recipientId,
      isRead: false,
    });
    emitToUser(recipientId, "notification:count", { unreadCount });
  }

  return notifications;
};

export default {
  createAndEmitNotification,
  createAndEmitMany,
};
