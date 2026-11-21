import mongoose from "mongoose";
import Notification from "../models/Notification.js";

/**
 * Get logged-in user's notifications with pagination.
 *
 * @route GET /api/notifications
 */
export const getMyNotifications = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query?.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query?.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const isRead = req.query?.isRead;

    const query = { recipient: req.user._id };
    if (isRead !== undefined) {
      query.isRead = isRead === "true";
    }

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("relatedIssue", "title status priority"),
      Notification.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      count: notifications.length,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      data: {
        notifications,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve notifications.",
      error: error.message,
    });
  }
};

/**
 * Get unread notification count for the logged-in user.
 *
 * @route GET /api/notifications/unread-count
 */
export const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });

    return res.status(200).json({
      success: true,
      data: {
        unreadCount: count,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve unread notification count.",
      error: error.message,
    });
  }
};

/**
 * Mark a specific notification as read.
 *
 * @route PATCH /api/notifications/:id/read
 */
export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID format.",
      });
    }

    const notification = await Notification.findOne({
      _id: id,
      recipient: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    notification.isRead = true;
    await notification.save();

    return res.status(200).json({
      success: true,
      message: "Notification marked as read.",
      data: {
        notification,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to mark notification as read.",
      error: error.message,
    });
  }
};

/**
 * Mark all notifications as read for logged-in user.
 *
 * @route PATCH /api/notifications/mark-all-read
 */
export const markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { $set: { isRead: true } }
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read.",
      data: {
        modifiedCount: result.modifiedCount,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to mark all notifications as read.",
      error: error.message,
    });
  }
};

/**
 * Delete a notification owned by the logged-in user.
 *
 * @route DELETE /api/notifications/:id
 */
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID format.",
      });
    }

    const deleted = await Notification.findOneAndDelete({
      _id: id,
      recipient: req.user._id,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete notification.",
      error: error.message,
    });
  }
};

export default {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
