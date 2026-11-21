import mongoose from "mongoose";
import Issue from "../models/Issue.js";
import Department from "../models/Department.js";
import User from "../models/User.js";

/**
 * Get analytics statistics with aggregation queries.
 * Only Admin and Department Manager roles are authorized.
 *
 * @route GET /api/analytics
 */
export const getAnalytics = async (req, res) => {
  try {
    // Role check: Only admin and department_manager can access analytics
    if (!["admin", "department_manager"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You are not authorized to view analytics.",
      });
    }

    const { startDate, endDate, department } = req.query || {};
    const matchFilter = {};

    // Scope for Department Manager: strictly restricted to their department
    if (req.user.role === "department_manager") {
      if (!req.user.department) {
        return res.status(403).json({
          success: false,
          message: "Department manager is not assigned to any department.",
        });
      }
      matchFilter.department = new mongoose.Types.ObjectId(req.user.department);
    } else if (req.user.role === "admin" && department) {
      if (!mongoose.Types.ObjectId.isValid(department)) {
        return res.status(400).json({
          success: false,
          message: "Invalid department filter ID format.",
        });
      }
      matchFilter.department = new mongoose.Types.ObjectId(department);
    }

    // Date range filtering
    if (startDate || endDate) {
      matchFilter.createdAt = {};

      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid startDate format. Use ISO date format (YYYY-MM-DD).",
          });
        }
        matchFilter.createdAt.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid endDate format. Use ISO date format (YYYY-MM-DD).",
          });
        }
        // Include full end day by adjusting to end of day if only date passed
        end.setHours(23, 59, 59, 999);
        matchFilter.createdAt.$lte = end;
      }
    }

    // 1. Grouped by status
    const statusAggregation = await Issue.aggregate([
      { $match: matchFilter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $project: { status: "$_id", count: 1, _id: 0 } },
    ]);

    // 2. Grouped by priority
    const priorityAggregation = await Issue.aggregate([
      { $match: matchFilter },
      { $group: { _id: "$priority", count: { $sum: 1 } } },
      { $project: { priority: "$_id", count: 1, _id: 0 } },
    ]);

    // 3. Grouped by department
    const departmentAggregation = await Issue.aggregate([
      { $match: matchFilter },
      { $group: { _id: "$department", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "departments",
          localField: "_id",
          foreignField: "_id",
          as: "departmentDetails",
        },
      },
      { $unwind: { path: "$departmentDetails", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          departmentId: "$_id",
          departmentName: { $ifNull: ["$departmentDetails.name", "Unknown"] },
          departmentCode: { $ifNull: ["$departmentDetails.code", "N/A"] },
          count: 1,
          _id: 0,
        },
      },
      { $sort: { count: -1 } },
    ]);

    // 4. Grouped by category
    const categoryAggregation = await Issue.aggregate([
      { $match: matchFilter },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $project: { category: "$_id", count: 1, _id: 0 } },
      { $sort: { count: -1 } },
    ]);

    // 5. Monthly issue creation trends
    const monthlyTrends = await Issue.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $project: { month: "$_id", count: 1, _id: 0 } },
      { $sort: { month: 1 } },
    ]);

    // 6. Resolved vs Pending statistics
    let pendingCount = 0;
    let resolvedCount = 0;

    statusAggregation.forEach((item) => {
      if (["submitted", "under_review", "assigned", "in_progress"].includes(item.status)) {
        pendingCount += item.count;
      } else if (["resolved", "closed"].includes(item.status)) {
        resolvedCount += item.count;
      }
    });

    const totalIssuesCount = pendingCount + resolvedCount;
    const resolutionRate =
      totalIssuesCount > 0
        ? Number(((resolvedCount / totalIssuesCount) * 100).toFixed(2))
        : 0;

    // 7. Average resolution time (in hours)
    const resolvedMatch = {
      ...matchFilter,
      status: { $in: ["resolved", "closed"] },
    };

    const resolutionTimeAggregation = await Issue.aggregate([
      { $match: resolvedMatch },
      {
        $project: {
          resolutionTimeHours: {
            $divide: [{ $subtract: ["$updatedAt", "$createdAt"] }, 1000 * 60 * 60],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgHours: { $avg: "$resolutionTimeHours" },
          minHours: { $min: "$resolutionTimeHours" },
          maxHours: { $max: "$resolutionTimeHours" },
        },
      },
    ]);

    const averageResolutionHours =
      resolutionTimeAggregation.length > 0 && resolutionTimeAggregation[0].avgHours
        ? Number(resolutionTimeAggregation[0].avgHours.toFixed(2))
        : 0;

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          totalIssues: totalIssuesCount,
          pendingIssues: pendingCount,
          resolvedIssues: resolvedCount,
          resolutionRatePercentage: resolutionRate,
          averageResolutionHours,
        },
        issuesByStatus: statusAggregation,
        issuesByPriority: priorityAggregation,
        issuesByDepartment: departmentAggregation,
        issuesByCategory: categoryAggregation,
        monthlyTrends,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to generate analytics.",
      error: error.message,
    });
  }
};

/**
 * Get Department Performance Analytics.
 * Admin can see all departments or filter by department.
 * Department Manager sees only their department.
 *
 * @route GET /api/analytics/department-performance
 */
export const getDepartmentPerformance = async (req, res) => {
  try {
    if (!["admin", "department_manager"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You are not authorized to view department performance analytics.",
      });
    }

    const { startDate, endDate, department } = req.query || {};
    const matchFilter = {};

    if (req.user.role === "department_manager") {
      if (!req.user.department) {
        return res.status(403).json({
          success: false,
          message: "Department manager is not assigned to any department.",
        });
      }
      matchFilter.department = new mongoose.Types.ObjectId(req.user.department);
    } else if (req.user.role === "admin" && department) {
      if (!mongoose.Types.ObjectId.isValid(department)) {
        return res.status(400).json({
          success: false,
          message: "Invalid department filter ID format.",
        });
      }
      matchFilter.department = new mongoose.Types.ObjectId(department);
    }

    if (startDate || endDate) {
      matchFilter.createdAt = {};

      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid startDate format. Use ISO date format (YYYY-MM-DD).",
          });
        }
        matchFilter.createdAt.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid endDate format. Use ISO date format (YYYY-MM-DD).",
          });
        }
        end.setHours(23, 59, 59, 999);
        matchFilter.createdAt.$lte = end;
      }
    }

    // Aggregate issues per department
    const departmentMetrics = await Issue.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: "$department",
          totalIssues: { $sum: 1 },
          pendingIssues: {
            $sum: {
              $cond: [
                { $in: ["$status", ["submitted", "under_review", "assigned"]] },
                1,
                0,
              ],
            },
          },
          inProgressIssues: {
            $sum: {
              $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0],
            },
          },
          resolvedIssues: {
            $sum: {
              $cond: [{ $in: ["$status", ["resolved", "closed"]] }, 1, 0],
            },
          },
          resolutionTimes: {
            $push: {
              $cond: [
                { $in: ["$status", ["resolved", "closed"]] },
                {
                  $divide: [
                    { $subtract: ["$updatedAt", "$createdAt"] },
                    1000 * 60 * 60,
                  ],
                },
                "$$REMOVE",
              ],
            },
          },
        },
      },
      {
        $lookup: {
          from: "departments",
          localField: "_id",
          foreignField: "_id",
          as: "departmentDetails",
        },
      },
      { $unwind: { path: "$departmentDetails", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          departmentId: "$_id",
          departmentName: { $ifNull: ["$departmentDetails.name", "Unknown"] },
          departmentCode: { $ifNull: ["$departmentDetails.code", "N/A"] },
          totalIssues: 1,
          pendingIssues: 1,
          inProgressIssues: 1,
          resolvedIssues: 1,
          resolutionRatePercentage: {
            $cond: [
              { $gt: ["$totalIssues", 0] },
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ["$resolvedIssues", "$totalIssues"] },
                      100,
                    ],
                  },
                  2,
                ],
              },
              0,
            ],
          },
          averageResolutionHours: {
            $cond: [
              { $gt: [{ $size: "$resolutionTimes" }, 0] },
              { $round: [{ $avg: "$resolutionTimes" }, 2] },
              0,
            ],
          },
          _id: 0,
        },
      },
      // Composite ranking score: resolutionRatePercentage * 0.7 + (100 - min(avgHours, 100)) * 0.3
      {
        $addFields: {
          score: {
            $add: [
              { $multiply: ["$resolutionRatePercentage", 0.7] },
              {
                $multiply: [
                  {
                    $max: [
                      0,
                      { $subtract: [100, "$averageResolutionHours"] },
                    ],
                  },
                  0.3,
                ],
              },
            ],
          },
        },
      },
      { $sort: { score: -1, totalIssues: -1 } },
    ]);

    // Add explicit ranking index
    const rankedDepartments = departmentMetrics.map((dept, index) => {
      const { score, ...rest } = dept;
      return {
        rank: index + 1,
        ...rest,
      };
    });

    return res.status(200).json({
      success: true,
      count: rankedDepartments.length,
      data: {
        departments: rankedDepartments,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to generate department performance analytics.",
      error: error.message,
    });
  }
};

/**
 * Get Staff Performance Analytics.
 * Admin can view all staff or filter by department.
 * Department Manager can view staff in their department only.
 * Maintenance Staff are forbidden.
 *
 * @route GET /api/analytics/staff-performance
 */
export const getStaffPerformance = async (req, res) => {
  try {
    if (!["admin", "department_manager"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You are not authorized to view staff performance analytics.",
      });
    }

    const { startDate, endDate, department, page, limit } = req.query || {};
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const pageLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (currentPage - 1) * pageLimit;

    // Determine target department
    let deptFilter = null;
    if (req.user.role === "department_manager") {
      if (!req.user.department) {
        return res.status(403).json({
          success: false,
          message: "Department manager is not assigned to any department.",
        });
      }
      deptFilter = new mongoose.Types.ObjectId(req.user.department);
    } else if (req.user.role === "admin" && department) {
      if (!mongoose.Types.ObjectId.isValid(department)) {
        return res.status(400).json({
          success: false,
          message: "Invalid department filter ID format.",
        });
      }
      deptFilter = new mongoose.Types.ObjectId(department);
    }

    // Match filter for issues
    const issueMatch = { assignedTo: { $ne: null } };
    if (deptFilter) {
      issueMatch.department = deptFilter;
    }

    if (startDate || endDate) {
      issueMatch.createdAt = {};

      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid startDate format. Use ISO date format (YYYY-MM-DD).",
          });
        }
        issueMatch.createdAt.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid endDate format. Use ISO date format (YYYY-MM-DD).",
          });
        }
        end.setHours(23, 59, 59, 999);
        issueMatch.createdAt.$lte = end;
      }
    }

    // Aggregate staff performance from issues
    const staffMetrics = await Issue.aggregate([
      { $match: issueMatch },
      {
        $group: {
          _id: "$assignedTo",
          totalAssigned: { $sum: 1 },
          pendingIssues: {
            $sum: {
              $cond: [{ $eq: ["$status", "assigned"] }, 1, 0],
            },
          },
          inProgressIssues: {
            $sum: {
              $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0],
            },
          },
          resolvedIssues: {
            $sum: {
              $cond: [{ $in: ["$status", ["resolved", "closed"]] }, 1, 0],
            },
          },
          resolutionTimes: {
            $push: {
              $cond: [
                { $in: ["$status", ["resolved", "closed"]] },
                {
                  $divide: [
                    { $subtract: ["$updatedAt", "$createdAt"] },
                    1000 * 60 * 60,
                  ],
                },
                "$$REMOVE",
              ],
            },
          },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "staffUser",
        },
      },
      { $unwind: "$staffUser" },
      {
        $lookup: {
          from: "departments",
          localField: "staffUser.department",
          foreignField: "_id",
          as: "departmentDetails",
        },
      },
      { $unwind: { path: "$departmentDetails", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          staffId: "$_id",
          name: "$staffUser.name",
          email: "$staffUser.email",
          avatar: "$staffUser.avatar",
          departmentId: "$staffUser.department",
          departmentName: { $ifNull: ["$departmentDetails.name", "N/A"] },
          totalAssigned: 1,
          pendingIssues: 1,
          inProgressIssues: 1,
          resolvedIssues: 1,
          activeWorkload: { $add: ["$pendingIssues", "$inProgressIssues"] },
          resolutionRatePercentage: {
            $cond: [
              { $gt: ["$totalAssigned", 0] },
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ["$resolvedIssues", "$totalAssigned"] },
                      100,
                    ],
                  },
                  2,
                ],
              },
              0,
            ],
          },
          averageResolutionHours: {
            $cond: [
              { $gt: [{ $size: "$resolutionTimes" }, 0] },
              { $round: [{ $avg: "$resolutionTimes" }, 2] },
              0,
            ],
          },
          _id: 0,
        },
      },
      { $sort: { resolvedIssues: -1, totalAssigned: -1 } },
    ]);

    const totalStaff = staffMetrics.length;
    const paginatedStaff = staffMetrics.slice(skip, skip + pageLimit);

    return res.status(200).json({
      success: true,
      count: paginatedStaff.length,
      total: totalStaff,
      page: currentPage,
      totalPages: Math.ceil(totalStaff / pageLimit) || 1,
      data: {
        staff: paginatedStaff,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to generate staff performance analytics.",
      error: error.message,
    });
  }
};

export default {
  getAnalytics,
  getDepartmentPerformance,
  getStaffPerformance,
};
