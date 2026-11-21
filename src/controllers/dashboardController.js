import mongoose from "mongoose";
import Issue from "../models/Issue.js";
import User from "../models/User.js";
import Department from "../models/Department.js";
import ActivityLog from "../models/ActivityLog.js";

/**
 * Get role-based dashboard statistics.
 *
 * @route GET /api/dashboard
 */
export const getDashboardStats = async (req, res) => {
  try {
    const { role } = req.user;

    // 1. Admin Dashboard
    if (role === "admin") {
      const [
        totalUsers,
        totalDepartments,
        totalIssues,
        statusCounts,
        priorityCounts,
        recentIssues,
        recentActivities,
      ] = await Promise.all([
        User.countDocuments(),
        Department.countDocuments({ isActive: true }),
        Issue.countDocuments(),
        Issue.aggregate([
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        Issue.aggregate([
          { $group: { _id: "$priority", count: { $sum: 1 } } },
        ]),
        Issue.find()
          .sort({ createdAt: -1 })
          .limit(5)
          .populate("department", "name code")
          .populate("reportedBy", "name email avatar")
          .populate("assignedTo", "name email avatar"),
        ActivityLog.find()
          .sort({ createdAt: -1 })
          .limit(10)
          .populate("performedBy", "name role avatar")
          .populate("issue", "title status priority"),
      ]);

      const issuesByStatus = {
        submitted: 0,
        under_review: 0,
        assigned: 0,
        in_progress: 0,
        resolved: 0,
        closed: 0,
      };
      statusCounts.forEach((item) => {
        if (item._id && issuesByStatus[item._id] !== undefined) {
          issuesByStatus[item._id] = item.count;
        }
      });

      const issuesByPriority = {
        low: 0,
        medium: 0,
        high: 0,
        urgent: 0,
      };
      priorityCounts.forEach((item) => {
        if (item._id && issuesByPriority[item._id] !== undefined) {
          issuesByPriority[item._id] = item.count;
        }
      });

      return res.status(200).json({
        success: true,
        data: {
          role: "admin",
          summary: {
            totalUsers,
            totalDepartments,
            totalIssues,
          },
          issuesByStatus,
          issuesByPriority,
          recentIssues,
          recentActivities,
        },
      });
    }

    // 2. Department Manager Dashboard
    if (role === "department_manager") {
      if (!req.user.department) {
        return res.status(403).json({
          success: false,
          message: "Department manager is not assigned to any department.",
        });
      }

      const deptId = req.user.department;

      const [
        totalDepartmentIssues,
        statusCounts,
        staffCount,
        recentDepartmentIssues,
      ] = await Promise.all([
        Issue.countDocuments({ department: deptId }),
        Issue.aggregate([
          { $match: { department: new mongoose.Types.ObjectId(deptId) } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        User.countDocuments({
          department: deptId,
          role: "maintenance_staff",
          isActive: true,
        }),
        Issue.find({ department: deptId })
          .sort({ createdAt: -1 })
          .limit(5)
          .populate("reportedBy", "name email avatar")
          .populate("assignedTo", "name email avatar"),
      ]);

      let pendingIssues = 0;
      let inProgressIssues = 0;
      let resolvedIssues = 0;

      statusCounts.forEach((item) => {
        if (["submitted", "under_review"].includes(item._id)) {
          pendingIssues += item.count;
        } else if (["assigned", "in_progress"].includes(item._id)) {
          inProgressIssues += item.count;
        } else if (["resolved", "closed"].includes(item._id)) {
          resolvedIssues += item.count;
        }
      });

      return res.status(200).json({
        success: true,
        data: {
          role: "department_manager",
          departmentId: deptId,
          summary: {
            totalIssues: totalDepartmentIssues,
            pendingIssues,
            inProgressIssues,
            resolvedIssues,
            staffCount,
          },
          recentIssues: recentDepartmentIssues,
        },
      });
    }

    // 3. Maintenance Staff Dashboard
    if (role === "maintenance_staff") {
      const staffId = req.user._id;

      const [
        assignedIssues,
        inProgressIssues,
        resolvedIssues,
        recentAssignedIssues,
      ] = await Promise.all([
        Issue.countDocuments({ assignedTo: staffId }),
        Issue.countDocuments({
          assignedTo: staffId,
          status: "in_progress",
        }),
        Issue.countDocuments({
          assignedTo: staffId,
          status: { $in: ["resolved", "closed"] },
        }),
        Issue.find({ assignedTo: staffId })
          .sort({ createdAt: -1 })
          .limit(5)
          .populate("department", "name code")
          .populate("reportedBy", "name email phone avatar"),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          role: "maintenance_staff",
          summary: {
            assignedIssues,
            inProgressIssues,
            resolvedIssues,
          },
          recentIssues: recentAssignedIssues,
        },
      });
    }

    // 4. Citizen Dashboard
    if (role === "citizen") {
      const citizenId = req.user._id;

      const [
        totalReportedIssues,
        pendingIssues,
        inProgressIssues,
        resolvedIssues,
        recentReports,
      ] = await Promise.all([
        Issue.countDocuments({ reportedBy: citizenId }),
        Issue.countDocuments({
          reportedBy: citizenId,
          status: { $in: ["submitted", "under_review"] },
        }),
        Issue.countDocuments({
          reportedBy: citizenId,
          status: { $in: ["assigned", "in_progress"] },
        }),
        Issue.countDocuments({
          reportedBy: citizenId,
          status: { $in: ["resolved", "closed"] },
        }),
        Issue.find({ reportedBy: citizenId })
          .sort({ createdAt: -1 })
          .limit(5)
          .populate("department", "name code")
          .populate("assignedTo", "name email avatar"),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          role: "citizen",
          summary: {
            totalReportedIssues,
            pendingIssues,
            inProgressIssues,
            resolvedIssues,
          },
          recentReports,
        },
      });
    }

    return res.status(400).json({
      success: false,
      message: "Unrecognized user role.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve dashboard statistics.",
      error: error.message,
    });
  }
};

export default {
  getDashboardStats,
};
