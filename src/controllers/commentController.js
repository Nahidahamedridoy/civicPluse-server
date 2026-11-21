import mongoose from "mongoose";
import Comment from "../models/Comment.js";
import Issue from "../models/Issue.js";
import Notification from "../models/Notification.js";
import ActivityLog from "../models/ActivityLog.js";

/**
 * Helper to determine if a user has permission to view/interact with an issue.
 */
export const canUserAccessIssue = (user, issue) => {
  if (!user || !issue) return false;
  if (user.role === "admin") return true;

  if (user.role === "department_manager") {
    const issueDeptId = issue.department?._id || issue.department;
    return Boolean(
      user.department &&
        issueDeptId &&
        issueDeptId.toString() === user.department.toString()
    );
  }

  if (user.role === "maintenance_staff") {
    const assignedStaffId = issue.assignedTo?._id || issue.assignedTo;
    return Boolean(
      assignedStaffId && assignedStaffId.toString() === user._id.toString()
    );
  }

  if (user.role === "citizen") {
    const reporterId = issue.reportedBy?._id || issue.reportedBy;
    return Boolean(
      reporterId && reporterId.toString() === user._id.toString()
    );
  }

  return false;
};

/**
 * Add a comment to an issue.
 *
 * @route POST /api/issues/:issueId/comments
 */
export const addComment = async (req, res) => {
  try {
    const { issueId } = req.params;
    const { message } = req.body;

    if (!mongoose.Types.ObjectId.isValid(issueId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid issue ID format.",
      });
    }

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Comment message is required.",
      });
    }

    const issue = await Issue.findById(issueId);
    if (!issue) {
      return res.status(404).json({
        success: false,
        message: "Issue not found.",
      });
    }

    // Access check
    if (!canUserAccessIssue(req.user, issue)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not have permission to comment on this issue.",
      });
    }

    const trimmedMessage = message.trim();

    const newComment = await Comment.create({
      issue: issue._id,
      user: req.user._id,
      message: trimmedMessage,
    });

    // Populate user info for returned comment
    const populatedComment = await Comment.findById(newComment._id).populate(
      "user",
      "name role avatar"
    );

    // Record activity log
    await ActivityLog.create({
      issue: issue._id,
      performedBy: req.user._id,
      action: "comment_added",
      description: `${req.user.name} added a comment.`,
      previousStatus: issue.status,
      newStatus: issue.status,
    });

    // Notify relevant parties
    const notificationsToCreate = [];
    const commenterIdStr = req.user._id.toString();

    // 1. Notify reporting citizen (if commenter is not the reporter)
    const reporterIdStr = issue.reportedBy.toString();
    if (commenterIdStr !== reporterIdStr) {
      notificationsToCreate.push({
        recipient: issue.reportedBy,
        title: "New Comment on Your Issue",
        message: `${req.user.name} commented on "${issue.title}": "${trimmedMessage.slice(0, 80)}${trimmedMessage.length > 80 ? "..." : ""}"`,
        type: "comment_added",
        relatedIssue: issue._id,
      });
    }

    // 2. Notify assigned maintenance staff (if exists and commenter is not the assigned staff)
    if (issue.assignedTo) {
      const assignedStaffIdStr = issue.assignedTo.toString();
      if (
        commenterIdStr !== assignedStaffIdStr &&
        reporterIdStr !== assignedStaffIdStr
      ) {
        notificationsToCreate.push({
          recipient: issue.assignedTo,
          title: "New Comment on Assigned Issue",
          message: `${req.user.name} commented on "${issue.title}": "${trimmedMessage.slice(0, 80)}${trimmedMessage.length > 80 ? "..." : ""}"`,
          type: "comment_added",
          relatedIssue: issue._id,
        });
      }
    }

    if (notificationsToCreate.length > 0) {
      await Notification.insertMany(notificationsToCreate);
    }

    return res.status(201).json({
      success: true,
      message: "Comment added successfully.",
      data: {
        comment: populatedComment,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to add comment.",
      error: error.message,
    });
  }
};

/**
 * Get all comments for an issue with pagination.
 *
 * @route GET /api/issues/:issueId/comments
 */
export const getCommentsByIssue = async (req, res) => {
  try {
    const { issueId } = req.params;
    const page = Math.max(1, parseInt(req.query?.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query?.limit, 10) || 20));
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(issueId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid issue ID format.",
      });
    }

    const issue = await Issue.findById(issueId);
    if (!issue) {
      return res.status(404).json({
        success: false,
        message: "Issue not found.",
      });
    }

    // Access check
    if (!canUserAccessIssue(req.user, issue)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not have permission to view comments for this issue.",
      });
    }

    const [comments, total] = await Promise.all([
      Comment.find({ issue: issueId })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "name role avatar"),
      Comment.countDocuments({ issue: issueId }),
    ]);

    return res.status(200).json({
      success: true,
      count: comments.length,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      data: {
        comments,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve comments.",
      error: error.message,
    });
  }
};

/**
 * Delete a comment.
 * Allowed for the author of the comment or admin.
 *
 * @route DELETE /api/comments/:commentId
 */
export const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid comment ID format.",
      });
    }

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found.",
      });
    }

    // Check ownership or admin privilege
    const isOwner = comment.user.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You are not authorized to delete this comment.",
      });
    }

    await Comment.findByIdAndDelete(commentId);

    return res.status(200).json({
      success: true,
      message: "Comment deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete comment.",
      error: error.message,
    });
  }
};

export default {
  canUserAccessIssue,
  addComment,
  getCommentsByIssue,
  deleteComment,
};
