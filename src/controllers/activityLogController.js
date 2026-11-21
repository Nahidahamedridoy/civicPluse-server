import mongoose from "mongoose";
import ActivityLog from "../models/ActivityLog.js";
import Issue from "../models/Issue.js";
import { canUserAccessIssue } from "./commentController.js";

/**
 * Get activity history for a specific issue.
 * Supports pagination.
 * Only users who have permission to view that issue can view its activity history.
 *
 * @route GET /api/issues/:issueId/activity (or /api/activity-logs/issues/:issueId/activity)
 */
export const getActivityLogsByIssue = async (req, res) => {
  try {
    const issueId = req.params.issueId || req.params.id;
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

    // Access authorization check
    if (!canUserAccessIssue(req.user, issue)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not have permission to view activity logs for this issue.",
      });
    }

    const [logs, total] = await Promise.all([
      ActivityLog.find({ issue: issueId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("performedBy", "name role avatar"),
      ActivityLog.countDocuments({ issue: issueId }),
    ]);

    return res.status(200).json({
      success: true,
      count: logs.length,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      data: {
        logs,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve activity history.",
      error: error.message,
    });
  }
};

export default {
  getActivityLogsByIssue,
};
