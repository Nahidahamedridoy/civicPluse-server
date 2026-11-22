import mongoose from "mongoose";
import Issue from "../models/Issue.js";
import Department from "../models/Department.js";

/**
 * Get all issues with valid GPS coordinates for map display.
 * Supports filtering by department, status, priority, and category.
 *
 * @route GET /api/map/issues
 */
export const getMapIssues = async (req, res) => {
  try {
    const { department, status, priority, category } = req.query || {};

    const filter = {
      "location.latitude": { $ne: null },
      "location.longitude": { $ne: null },
    };

    if (department) {
      if (!mongoose.Types.ObjectId.isValid(department)) {
        return res.status(400).json({
          success: false,
          message: "Invalid department filter ID format.",
        });
      }
      filter.department = new mongoose.Types.ObjectId(department);
    }

    if (status) {
      const validStatuses = [
        "submitted",
        "under_review",
        "assigned",
        "in_progress",
        "resolved",
        "closed",
      ];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status filter. Allowed values: ${validStatuses.join(", ")}.`,
        });
      }
      filter.status = status;
    }

    if (priority) {
      const validPriorities = ["low", "medium", "high", "urgent"];
      if (validPriorities.includes(priority)) {
        filter.priority = priority;
      }
    }

    if (category && typeof category === "string" && category.trim()) {
      filter.category = new RegExp(`^${category.trim()}$`, "i");
    }

    const issues = await Issue.find(filter)
      .select("_id title status priority category location department createdAt updatedAt")
      .populate("department", "name code")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: issues.length,
      data: {
        issues,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve map issues.",
      error: error.message,
    });
  }
};

/**
 * Get issues nearby a given GPS coordinate sorted by distance.
 * Uses MongoDB 2dsphere $geoNear geospatial aggregation.
 *
 * @route GET /api/map/nearby
 */
export const getNearbyIssues = async (req, res) => {
  try {
    const { latitude, longitude, radius, department, status, category, limit } =
      req.query || {};

    // Validate required latitude and longitude
    if (latitude === undefined || latitude === null || latitude === "") {
      return res.status(400).json({
        success: false,
        message: "Latitude query parameter is required.",
      });
    }

    if (longitude === undefined || longitude === null || longitude === "") {
      return res.status(400).json({
        success: false,
        message: "Longitude query parameter is required.",
      });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude. Must be a valid number between -90 and 90.",
      });
    }

    if (isNaN(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({
        success: false,
        message: "Invalid longitude. Must be a valid number between -180 and 180.",
      });
    }

    // Radius handling: if radius > 100, interpret as meters; otherwise interpret as kilometers (default: 10 km)
    let maxDistanceMeters = 10000;
    if (radius !== undefined && radius !== null && radius !== "") {
      const radiusNum = Number(radius);
      if (isNaN(radiusNum) || radiusNum <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid radius. Must be a positive number.",
        });
      }
      maxDistanceMeters = radiusNum > 100 ? radiusNum : radiusNum * 1000;
    }

    const maxLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    // Optional query match within $geoNear
    const queryMatch = {};

    if (department) {
      if (!mongoose.Types.ObjectId.isValid(department)) {
        return res.status(400).json({
          success: false,
          message: "Invalid department filter ID format.",
        });
      }
      queryMatch.department = new mongoose.Types.ObjectId(department);
    }

    if (status) {
      const validStatuses = [
        "submitted",
        "under_review",
        "assigned",
        "in_progress",
        "resolved",
        "closed",
      ];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status filter. Allowed values: ${validStatuses.join(", ")}.`,
        });
      }
      queryMatch.status = status;
    }

    if (category && typeof category === "string" && category.trim()) {
      queryMatch.category = new RegExp(`^${category.trim()}$`, "i");
    }

    const nearbyIssues = await Issue.aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [lng, lat] },
          distanceField: "distanceMeters",
          maxDistance: maxDistanceMeters,
          spherical: true,
          query: queryMatch,
        },
      },
      {
        $lookup: {
          from: "departments",
          localField: "department",
          foreignField: "_id",
          as: "departmentDetails",
        },
      },
      {
        $unwind: {
          path: "$departmentDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          title: 1,
          description: 1,
          status: 1,
          priority: 1,
          category: 1,
          location: 1,
          department: {
            _id: "$departmentDetails._id",
            name: "$departmentDetails.name",
            code: "$departmentDetails.code",
          },
          distanceMeters: { $round: ["$distanceMeters", 1] },
          distanceKm: {
            $round: [{ $divide: ["$distanceMeters", 1000] }, 2],
          },
          createdAt: 1,
        },
      },
      { $limit: maxLimit },
    ]);

    return res.status(200).json({
      success: true,
      count: nearbyIssues.length,
      data: {
        searchOrigin: {
          latitude: lat,
          longitude: lng,
        },
        radiusKm: Number((maxDistanceMeters / 1000).toFixed(2)),
        radiusMeters: maxDistanceMeters,
        issues: nearbyIssues,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve nearby issues.",
      error: error.message,
    });
  }
};

export default {
  getMapIssues,
  getNearbyIssues,
};
