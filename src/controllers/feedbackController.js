import mongoose from "mongoose";
import Feedback from "../models/Feedback.js";
import Issue from "../models/Issue.js";
import User from "../models/User.js";
import ActivityLog from "../models/ActivityLog.js";
import {
  createAndEmitMany,
} from "../services/notificationService.js";
import { canUserAccessIssue } from "./commentController.js";

/**
 * Submit feedback for a resolved or closed issue.
 * Only the original citizen reporter can submit feedback.
 *
 * @route POST /api/issues/:id/feedback
 */
export const submitFeedback = async (req, res) => {
  try {
    const issueId = req.params.id || req.params.issueId;
    const { rating, comment } = req.body;

    if (!mongoose.Types.ObjectId.isValid(issueId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid issue ID format.",
      });
    }

    const numericRating = Number(rating);
    if (!numericRating || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating is required and must be an integer between 1 and 5.",
      });
    }

    const issue = await Issue.findById(issueId);
    if (!issue) {
      return res.status(404).json({
        success: false,
        message: "Issue not found.",
      });
    }

    // Access check: only the original reporting citizen can submit feedback
    if (issue.reportedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Only the original citizen reporter can submit feedback.",
      });
    }

    // Allowed ONLY when issue status is resolved or closed
    if (!["resolved", "closed"].includes(issue.status)) {
      return res.status(400).json({
        success: false,
        message: "Feedback can only be submitted for resolved or closed issues.",
      });
    }

    // Check for duplicate feedback
    const existingFeedback = await Feedback.findOne({
      issue: issue._id,
      citizen: req.user._id,
    });

    if (existingFeedback) {
      return res.status(409).json({
        success: false,
        message: "You have already submitted feedback for this issue.",
      });
    }

    const feedback = await Feedback.create({
      issue: issue._id,
      citizen: req.user._id,
      rating: numericRating,
      comment: typeof comment === "string" ? comment.trim() : "",
    });

    // Record in ActivityLog
    await ActivityLog.create({
      issue: issue._id,
      performedBy: req.user._id,
      action: "feedback_submitted",
      description: `Citizen submitted resolution feedback: rating ${numericRating}/5.`,
      previousStatus: issue.status,
      newStatus: issue.status,
    });

    // Notify assigned staff member and department manager
    const recipients = [];
    if (issue.assignedTo) {
      recipients.push(issue.assignedTo);
    }

    const managers = await User.find({
      department: issue.department,
      role: "department_manager",
      isActive: true,
    });
    managers.forEach((mgr) => recipients.push(mgr._id));

    const notifications = recipients.map((recipientId) => ({
      recipient: recipientId,
      title: "Citizen Feedback Received",
      message: `Citizen gave a ${numericRating}/5 rating for issue: "${issue.title}".`,
      type: "general",
      relatedIssue: issue._id,
    }));

    if (notifications.length > 0) {
      await createAndEmitMany(notifications);
    }

    const populatedFeedback = await Feedback.findById(feedback._id).populate(
      "citizen",
      "name avatar"
    );

    return res.status(201).json({
      success: true,
      message: "Feedback submitted successfully.",
      data: {
        feedback: populatedFeedback,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Feedback has already been submitted for this issue.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to submit feedback.",
      error: error.message,
    });
  }
};

/**
 * Get feedback for a specific issue.
 * Accessible to authorized users who can access the issue.
 *
 * @route GET /api/issues/:id/feedback
 */
export const getFeedbackByIssue = async (req, res) => {
  try {
    const issueId = req.params.id || req.params.issueId;

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

    if (!canUserAccessIssue(req.user, issue)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not have permission to view feedback for this issue.",
      });
    }

    const feedback = await Feedback.findOne({ issue: issueId }).populate(
      "citizen",
      "name avatar"
    );

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: "No feedback found for this issue.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        feedback,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve feedback.",
      error: error.message,
    });
  }
};

export default {
  submitFeedback,
  getFeedbackByIssue,
};
