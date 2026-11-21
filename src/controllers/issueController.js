import mongoose from "mongoose";
import Issue from "../models/Issue.js";
import Department from "../models/Department.js";
import User from "../models/User.js";
import ActivityLog from "../models/ActivityLog.js";
import {
  createAndEmitNotification,
  createAndEmitMany,
} from "../services/notificationService.js";
import ProgressReport from "../models/ProgressReport.js";
import { uploadMultipleImages } from "../services/imageUploadService.js";

// Valid status transitions map
const ALLOWED_STATUS_TRANSITIONS = {
  submitted: ["under_review", "assigned", "closed"],
  under_review: ["assigned", "in_progress", "closed"],
  assigned: ["in_progress", "under_review", "closed"],
  in_progress: ["resolved", "assigned", "under_review"],
  resolved: ["closed", "in_progress"],
  closed: ["under_review"],
};

/**
 * Create a new issue (Citizen only).
 *
 * @route POST /api/issues
 */
export const createIssue = async (req, res) => {
  try {
    const { title, description, category, department, location, images, priority } =
      req.body;

    // Validate required fields
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Issue title is required.",
      });
    }

    if (!description || typeof description !== "string" || !description.trim()) {
      return res.status(400).json({
        success: false,
        message: "Issue description is required.",
      });
    }

    if (!category || typeof category !== "string" || !category.trim()) {
      return res.status(400).json({
        success: false,
        message: "Category is required.",
      });
    }

    if (!department || !mongoose.Types.ObjectId.isValid(department)) {
      return res.status(400).json({
        success: false,
        message: "A valid Department ID is required.",
      });
    }

    // Verify department exists and is active
    const targetDepartment = await Department.findOne({
      _id: department,
      isActive: true,
    });
    if (!targetDepartment) {
      return res.status(404).json({
        success: false,
        message: "Active department not found with the provided ID.",
      });
    }

    // Process uploaded images via Multer/ImgBB or direct image URLs
    let issueImages = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      issueImages = await uploadMultipleImages(req.files);
    } else if (Array.isArray(images)) {
      issueImages = images;
    }

    // Parse location if submitted via multipart/form-data as JSON string
    let parsedLocation = location;
    if (typeof location === "string" && location.trim().startsWith("{")) {
      try {
        parsedLocation = JSON.parse(location);
      } catch (e) {
        parsedLocation = null;
      }
    }

    const newIssue = await Issue.create({
      title: title.trim(),
      description: description.trim(),
      category: category.trim(),
      department: targetDepartment._id,
      reportedBy: req.user._id,
      assignedTo: null,
      status: "submitted",
      priority: priority || "medium",
      location: parsedLocation || null,
      images: issueImages,
    });

    // Record activity log
    await ActivityLog.create({
      issue: newIssue._id,
      performedBy: req.user._id,
      action: "created",
      description: "Issue submitted by citizen.",
      previousStatus: null,
      newStatus: "submitted",
    });

    const populatedIssue = await Issue.findById(newIssue._id)
      .populate("department", "name code")
      .populate("reportedBy", "name email phone avatar");

    return res.status(201).json({
      success: true,
      message: "Issue created successfully.",
      data: {
        issue: populatedIssue,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create issue.",
      error: error.message,
    });
  }
};

/**
 * Get issues with role-based visibility, search, filter, and pagination.
 *
 * @route GET /api/issues
 */
export const getIssues = async (req, res) => {
  try {
    const { status, priority, department, category, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const query = {};

    // Role-based visibility scoping
    if (req.user.role === "citizen") {
      query.reportedBy = req.user._id;
    } else if (req.user.role === "maintenance_staff") {
      query.assignedTo = req.user._id;
    } else if (req.user.role === "department_manager") {
      if (!req.user.department) {
        return res.status(403).json({
          success: false,
          message: "Department manager is not assigned to any department.",
        });
      }
      query.department = req.user.department;
    } else if (req.user.role === "admin") {
      if (department && mongoose.Types.ObjectId.isValid(department)) {
        query.department = department;
      }
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by priority
    if (priority) {
      query.priority = priority;
    }

    // Filter by category
    if (category) {
      query.category = { $regex: new RegExp(`^${category.trim()}$`, "i") };
    }

    // Search by title or description
    if (search && typeof search === "string" && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [{ title: searchRegex }, { description: searchRegex }];
    }

    const [issues, total] = await Promise.all([
      Issue.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("department", "name code")
        .populate("reportedBy", "name email phone avatar")
        .populate("assignedTo", "name email phone avatar"),
      Issue.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      count: issues.length,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      data: {
        issues,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve issues.",
      error: error.message,
    });
  }
};

/**
 * Get issues reported by the logged-in citizen.
 *
 * @route GET /api/issues/my-reports
 */
export const getMyReports = async (req, res) => {
  try {
    const { status, priority, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const query = { reportedBy: req.user._id };

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (search && typeof search === "string" && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [{ title: searchRegex }, { description: searchRegex }];
    }

    const [issues, total] = await Promise.all([
      Issue.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("department", "name code")
        .populate("assignedTo", "name email phone avatar"),
      Issue.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      count: issues.length,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      data: {
        issues,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve your reported issues.",
      error: error.message,
    });
  }
};

/**
 * Get issues assigned to the logged-in maintenance staff.
 *
 * @route GET /api/issues/assigned
 */
export const getAssignedIssues = async (req, res) => {
  try {
    const { status, priority, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const query = { assignedTo: req.user._id };

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (search && typeof search === "string" && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [{ title: searchRegex }, { description: searchRegex }];
    }

    const [issues, total] = await Promise.all([
      Issue.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("department", "name code")
        .populate("reportedBy", "name email phone avatar"),
      Issue.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      count: issues.length,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      data: {
        issues,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve assigned issues.",
      error: error.message,
    });
  }
};

/**
 * Get issue details by ID with role-based access validation.
 *
 * @route GET /api/issues/:id
 */
export const getIssueById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid issue ID format.",
      });
    }

    const issue = await Issue.findById(id)
      .populate("department", "name code")
      .populate("reportedBy", "name email phone avatar")
      .populate("assignedTo", "name email phone avatar");

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: "Issue not found.",
      });
    }

    // Role-based authorization check
    if (req.user.role === "citizen") {
      if (issue.reportedBy._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: You cannot view issues reported by other users.",
        });
      }
    } else if (req.user.role === "maintenance_staff") {
      if (!issue.assignedTo || issue.assignedTo._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: You can only view issues assigned to you.",
        });
      }
    } else if (req.user.role === "department_manager") {
      if (
        !req.user.department ||
        issue.department._id.toString() !== req.user.department.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: You can only view issues within your department.",
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        issue,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve issue details.",
      error: error.message,
    });
  }
};

/**
 * Update issue details.
 *
 * @route PATCH /api/issues/:id
 */
export const updateIssue = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category, priority, location, images } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid issue ID format.",
      });
    }

    const issue = await Issue.findById(id);
    if (!issue) {
      return res.status(404).json({
        success: false,
        message: "Issue not found.",
      });
    }

    // Access control
    if (req.user.role === "citizen") {
      if (issue.reportedBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: You can only update your own issues.",
        });
      }
      if (issue.status !== "submitted") {
        return res.status(400).json({
          success: false,
          message: "Cannot modify an issue that is already under review or in progress.",
        });
      }
    } else if (req.user.role === "department_manager") {
      if (
        !req.user.department ||
        issue.department.toString() !== req.user.department.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: You can only update issues within your department.",
        });
      }
    } else if (req.user.role === "maintenance_staff") {
      return res.status(403).json({
        success: false,
        message: "Maintenance staff cannot edit core issue details. Use status update.",
      });
    }

    // Apply allowed updates
    if (title !== undefined) issue.title = title.trim();
    if (description !== undefined) issue.description = description.trim();
    if (category !== undefined) issue.category = category.trim();
    if (location !== undefined) issue.location = location;
    if (images !== undefined && Array.isArray(images)) issue.images = images;

    // Only admin or manager can modify priority or reassign department
    if (["admin", "department_manager"].includes(req.user.role)) {
      if (
        priority !== undefined &&
        ["low", "medium", "high", "urgent"].includes(priority)
      ) {
        issue.priority = priority;
      }
      if (department !== undefined && mongoose.Types.ObjectId.isValid(department)) {
        const targetDept = await Department.findOne({
          _id: department,
          isActive: true,
        });
        if (targetDept) {
          issue.department = targetDept._id;
        }
      }
    }

    await issue.save();

    // Record activity log
    await ActivityLog.create({
      issue: issue._id,
      performedBy: req.user._id,
      action: "updated",
      description: "Issue details updated.",
      previousStatus: issue.status,
      newStatus: issue.status,
    });

    const updatedIssue = await Issue.findById(issue._id)
      .populate("department", "name code")
      .populate("reportedBy", "name email phone avatar")
      .populate("assignedTo", "name email phone avatar");

    return res.status(200).json({
      success: true,
      message: "Issue updated successfully.",
      data: {
        issue: updatedIssue,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update issue.",
      error: error.message,
    });
  }
};

/**
 * Assign issue to maintenance staff.
 * Department Manager or Admin only.
 *
 * @route PATCH /api/issues/:id/assign
 */
export const assignIssue = async (req, res) => {
  try {
    const { id } = req.params;
    const { staffId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid issue ID format.",
      });
    }

    if (!staffId || !mongoose.Types.ObjectId.isValid(staffId)) {
      return res.status(400).json({
        success: false,
        message: "A valid staffId is required.",
      });
    }

    const issue = await Issue.findById(id);
    if (!issue) {
      return res.status(404).json({
        success: false,
        message: "Issue not found.",
      });
    }

    // Manager can only assign issues for their own department
    if (
      req.user.role === "department_manager" &&
      (!req.user.department ||
        issue.department.toString() !== req.user.department.toString())
    ) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You can only assign issues for your department.",
      });
    }

    // Verify maintenance staff user
    const staff = await User.findById(staffId);
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Assigned staff user not found.",
      });
    }

    if (!staff.isActive) {
      return res.status(400).json({
        success: false,
        message: "Cannot assign issue to an inactive staff member.",
      });
    }

    if (staff.role !== "maintenance_staff") {
      return res.status(400).json({
        success: false,
        message: "Target user is not registered as maintenance staff.",
      });
    }

    // Ensure staff belongs to the issue's department
    if (
      !staff.department ||
      staff.department.toString() !== issue.department.toString()
    ) {
      return res.status(400).json({
        success: false,
        message: "Staff member does not belong to the department assigned to this issue.",
      });
    }

    const previousStatus = issue.status;
    issue.assignedTo = staff._id;

    // Automatically transition to 'assigned' if currently submitted or under_review
    if (["submitted", "under_review"].includes(issue.status)) {
      issue.status = "assigned";
    }

    await issue.save();

    // Log in ActivityLog
    await ActivityLog.create({
      issue: issue._id,
      performedBy: req.user._id,
      action: "assigned",
      description: `Issue assigned to ${staff.name}.`,
      previousStatus,
      newStatus: issue.status,
    });

    // Create & emit real-time notification for the assigned staff
    await createAndEmitNotification({
      recipient: staff._id,
      title: "New Issue Assigned",
      message: `You have been assigned to handle issue: "${issue.title}".`,
      type: "issue_assigned",
      relatedIssue: issue._id,
    });

    const populatedIssue = await Issue.findById(issue._id)
      .populate("department", "name code")
      .populate("reportedBy", "name email phone avatar")
      .populate("assignedTo", "name email phone avatar");

    return res.status(200).json({
      success: true,
      message: "Issue assigned successfully.",
      data: {
        issue: populatedIssue,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to assign issue.",
      error: error.message,
    });
  }
};

/**
 * Verify submitted issue.
 * Department Managers and Admins can verify issues, and assign priority and department.
 *
 * @route PATCH /api/issues/:id/verify
 */
export const verifyIssue = async (req, res) => {
  try {
    const { id } = req.params;
    const { priority, department, notes } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid issue ID format.",
      });
    }

    // Role check: Only department managers and admins can verify issues
    if (req.user.role !== "admin" && req.user.role !== "department_manager") {
      return res.status(403).json({
        success: false,
        message:
          "Forbidden: Only department managers and admins can verify issues.",
      });
    }

    const issue = await Issue.findById(id);
    if (!issue) {
      return res.status(404).json({
        success: false,
        message: "Issue not found.",
      });
    }

    // If department manager, ensure issue belongs to their department
    if (req.user.role === "department_manager") {
      if (
        !req.user.department ||
        issue.department.toString() !== req.user.department.toString()
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Forbidden: You can only verify issues belonging to your department.",
        });
      }
    }

    // Only submitted issues can be verified into under_review
    if (issue.status !== "submitted") {
      return res.status(400).json({
        success: false,
        message: `Issue is already '${issue.status}'. Only 'submitted' issues can be verified.`,
      });
    }

    const previousStatus = issue.status;
    issue.status = "under_review";

    // Managers can assign priority and department
    if (priority && ["low", "medium", "high", "urgent"].includes(priority)) {
      issue.priority = priority;
    }

    if (department && mongoose.Types.ObjectId.isValid(department)) {
      const targetDept = await Department.findOne({
        _id: department,
        isActive: true,
      });
      if (!targetDept) {
        return res.status(404).json({
          success: false,
          message: "Active target department not found.",
        });
      }
      issue.department = targetDept._id;
    }

    await issue.save();

    // Record activity log
    await ActivityLog.create({
      issue: issue._id,
      performedBy: req.user._id,
      action: "verified",
      description: notes
        ? `Issue verified and placed under review: ${notes.trim()}`
        : "Issue verified by department manager and placed under review.",
      previousStatus,
      newStatus: "under_review",
    });

    // Notify citizen reporter (real-time)
    await createAndEmitNotification({
      recipient: issue.reportedBy,
      title: "Issue Verified",
      message: `Your reported issue "${issue.title}" has been verified and placed under review.`,
      type: "status_updated",
      relatedIssue: issue._id,
    });

    const populatedIssue = await Issue.findById(issue._id)
      .populate("department", "name code")
      .populate("reportedBy", "name email phone avatar")
      .populate("assignedTo", "name email phone avatar");

    return res.status(200).json({
      success: true,
      message: "Issue verified successfully.",
      data: {
        issue: populatedIssue,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to verify issue.",
      error: error.message,
    });
  }
};

/**
 * Update issue status with transition validation.
 *
 * @route PATCH /api/issues/:id/status
 */
export const updateIssueStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid issue ID format.",
      });
    }

    const validStatuses = [
      "submitted",
      "under_review",
      "assigned",
      "in_progress",
      "resolved",
      "closed",
    ];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}.`,
      });
    }

    const issue = await Issue.findById(id);
    if (!issue) {
      return res.status(404).json({
        success: false,
        message: "Issue not found.",
      });
    }

    // Role-based permissions for status updates
    // 1. Citizens cannot change issue status
    if (req.user.role === "citizen") {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Citizens are not authorized to change issue status.",
      });
    }

    // 2. Only authorized managers and admin can close resolved issues
    if (status === "closed") {
      if (!["admin", "department_manager"].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message:
            "Forbidden: Only authorized department managers and admins can close issues.",
        });
      }
      if (req.user.role === "department_manager") {
        if (
          !req.user.department ||
          issue.department.toString() !== req.user.department.toString()
        ) {
          return res.status(403).json({
            success: false,
            message:
              "Forbidden: You can only close issues belonging to your department.",
          });
        }
      }
      if (issue.status !== "resolved" && req.user.role !== "admin") {
        return res.status(400).json({
          success: false,
          message: "Only resolved issues can be closed.",
        });
      }
    }

    // 3. Maintenance staff permissions & completion report requirement
    if (req.user.role === "maintenance_staff") {
      if (
        !issue.assignedTo ||
        issue.assignedTo.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: You can only update status for issues assigned to you.",
        });
      }
      if (!["in_progress", "resolved"].includes(status)) {
        return res.status(403).json({
          success: false,
          message:
            "Maintenance staff can only update status to 'in_progress' or 'resolved'.",
        });
      }
      if (status === "resolved") {
        const hasReport = await ProgressReport.exists({
          issue: issue._id,
          staff: req.user._id,
        });
        if (!hasReport) {
          return res.status(400).json({
            success: false,
            message:
              "Cannot mark issue as resolved without submitting a work progress/completion report first.",
          });
        }
      }
    }

    // 4. Department Manager scope
    if (req.user.role === "department_manager") {
      if (
        !req.user.department ||
        issue.department.toString() !== req.user.department.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: You can only update issues within your department.",
        });
      }
    }

    // Validate transition validity (Admin can bypass if forced)
    if (req.user.role !== "admin") {
      const allowedNext = ALLOWED_STATUS_TRANSITIONS[issue.status] || [];
      if (!allowedNext.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot transition status from '${issue.status}' to '${status}'. Allowed transitions: ${allowedNext.join(", ")}.`,
        });
      }
    }

    const previousStatus = issue.status;
    issue.status = status;
    await issue.save();

    // Log change in ActivityLog
    await ActivityLog.create({
      issue: issue._id,
      performedBy: req.user._id,
      action: "status_changed",
      description: notes
        ? `Status updated to ${status}. Notes: ${notes.trim()}`
        : `Status updated to ${status}.`,
      previousStatus,
      newStatus: status,
    });

    // Notify the citizen reporter (real-time)
    await createAndEmitNotification({
      recipient: issue.reportedBy,
      title: "Issue Status Updated",
      message: `Your issue "${issue.title}" status has changed to "${status}".`,
      type: "status_updated",
      relatedIssue: issue._id,
    });

    const populatedIssue = await Issue.findById(issue._id)
      .populate("department", "name code")
      .populate("reportedBy", "name email phone avatar")
      .populate("assignedTo", "name email phone avatar");

    return res.status(200).json({
      success: true,
      message: `Issue status updated to '${status}'.`,
      data: {
        issue: populatedIssue,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update issue status.",
      error: error.message,
    });
  }
};

export default {
  createIssue,
  getIssues,
  getMyReports,
  getAssignedIssues,
  getIssueById,
  updateIssue,
  verifyIssue,
  assignIssue,
  updateIssueStatus,
};
