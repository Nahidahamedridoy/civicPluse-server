import mongoose from "mongoose";
import Issue from "../models/Issue.js";

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

export default {
  getAnalytics,
};
