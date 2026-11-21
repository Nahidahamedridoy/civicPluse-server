import mongoose from "mongoose";
import ProgressReport from "../models/ProgressReport.js";
import Issue from "../models/Issue.js";
import User from "../models/User.js";
import ActivityLog from "../models/ActivityLog.js";
import {
  createAndEmitMany,
} from "../services/notificationService.js";
import { canUserAccessIssue } from "./commentController.js";
import { uploadMultipleImages } from "../services/imageUploadService.js";

/**
 * Submit a work progress report with completion notes and photographs.
 * Only the maintenance staff assigned to the issue (or admin) can submit reports.
 *
 * @route POST /api/issues/:id/progress-reports
 */
export const addProgressReport = async (req, res) => {
  try {
    const issueId = req.params.id || req.params.issueId;
    const { note, images } = req.body;

    if (!mongoose.Types.ObjectId.isValid(issueId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid issue ID format.",
      });
    }

    if (!note || typeof note !== "string" || note.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: "Progress note is required and must be at least 5 characters long.",
      });
    }

    const issue = await Issue.findById(issueId);
    if (!issue) {
      return res.status(404).json({
        success: false,
        message: "Issue not found.",
      });
    }

    // Access control: only assigned staff or admin
    const isAssignedStaff =
      issue.assignedTo &&
      issue.assignedTo.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isAssignedStaff && !isAdmin) {
      return res.status(403).json({
        success: false,
        message:
          "Forbidden: Only the maintenance staff assigned to this issue can submit progress reports.",
      });
    }

    // Process uploaded images via Multer/ImgBB or provided image URLs
    let reportImages = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      reportImages = await uploadMultipleImages(req.files);
    } else if (Array.isArray(images)) {
      reportImages = images;
    }

    const trimmedNote = note.trim();

    const report = await ProgressReport.create({
      issue: issue._id,
      staff: req.user._id,
      note: trimmedNote,
      images: reportImages,
    });

    // Record in ActivityLog
    await ActivityLog.create({
      issue: issue._id,
      performedBy: req.user._id,
      action: "progress_reported",
      description: `Progress report submitted: ${trimmedNote.slice(0, 80)}${
        trimmedNote.length > 80 ? "..." : ""
      }`,
      previousStatus: issue.status,
      newStatus: issue.status,
    });

    // Notify the department manager(s) of this department
    const departmentManagers = await User.find({
      department: issue.department,
      role: "department_manager",
      isActive: true,
    });

    const notifications = departmentManagers.map((mgr) => ({
      recipient: mgr._id,
      title: "Work Progress Report Submitted",
      message: `${req.user.name} submitted a progress report for issue "${issue.title}".`,
      type: "status_updated",
      relatedIssue: issue._id,
    }));

    if (notifications.length > 0) {
      await createAndEmitMany(notifications);
    }

    const populatedReport = await ProgressReport.findById(report._id).populate(
      "staff",
      "name role avatar phone"
    );

    return res.status(201).json({
      success: true,
      message: "Progress report submitted successfully.",
      data: {
        report: populatedReport,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to submit progress report.",
      error: error.message,
    });
  }
};

/**
 * Get all progress reports for an issue.
 * Accessible to authorized users who can access the issue.
 *
 * @route GET /api/issues/:id/progress-reports
 */
export const getProgressReportsByIssue = async (req, res) => {
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
        message:
          "Forbidden: You do not have permission to view progress reports for this issue.",
      });
    }

    const reports = await ProgressReport.find({ issue: issueId })
      .sort({ createdAt: -1 })
      .populate("staff", "name role avatar phone");

    return res.status(200).json({
      success: true,
      count: reports.length,
      data: {
        reports,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve progress reports.",
      error: error.message,
    });
  }
};

export default {
  addProgressReport,
  getProgressReportsByIssue,
};
