import mongoose from "mongoose";
import Department from "../models/Department.js";
import User from "../models/User.js";
import Issue from "../models/Issue.js";

/**
 * Create a new department.
 * Admin only.
 *
 * @route POST /api/departments
 */
export const createDepartment = async (req, res) => {
  try {
    const { name, code, description } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Department name is required.",
      });
    }

    if (!code || typeof code !== "string" || !code.trim()) {
      return res.status(400).json({
        success: false,
        message: "Department code is required.",
      });
    }

    const trimmedName = name.trim();
    const formattedCode = code.trim().toUpperCase();

    // Check duplicate name or code (case-insensitive for name, uppercase for code)
    const existingDept = await Department.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${trimmedName}$`, "i") } },
        { code: formattedCode },
      ],
    });

    if (existingDept) {
      const conflictField =
        existingDept.code === formattedCode ? "code" : "name";
      return res.status(409).json({
        success: false,
        message: `Department with this ${conflictField} already exists.`,
      });
    }

    const department = await Department.create({
      name: trimmedName,
      code: formattedCode,
      description: typeof description === "string" ? description.trim() : "",
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: "Department created successfully.",
      data: {
        department,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error while creating department.",
      error: error.message,
    });
  }
};

/**
 * Get all departments with pagination and search.
 * Authenticated users can view active departments.
 * Admin can optionally view all departments including inactive ones.
 *
 * @route GET /api/departments
 */
export const getAllDepartments = async (req, res) => {
  try {
    const { search, isActive } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const query = {};

    // Non-admin users are strictly restricted to active departments
    if (req.user.role !== "admin") {
      query.isActive = true;
    } else if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    // Search by name or code
    if (search && typeof search === "string" && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [{ name: searchRegex }, { code: searchRegex }];
    }

    const [departments, total] = await Promise.all([
      Department.find(query).sort({ name: 1 }).skip(skip).limit(limit),
      Department.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      count: departments.length,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      data: {
        departments,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve departments.",
      error: error.message,
    });
  }
};

/**
 * Get department by ID.
 * Authenticated users can view active department.
 *
 * @route GET /api/departments/:id
 */
export const getDepartmentById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid department ID format.",
      });
    }

    const department = await Department.findById(id);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found.",
      });
    }

    // Non-admin cannot view inactive department
    if (req.user.role !== "admin" && !department.isActive) {
      return res.status(404).json({
        success: false,
        message: "Department not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        department,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve department.",
      error: error.message,
    });
  }
};

/**
 * Update department by ID.
 * Admin only.
 *
 * @route PATCH /api/departments/:id
 */
export const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description, isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid department ID format.",
      });
    }

    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found.",
      });
    }

    const updates = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Department name cannot be empty.",
        });
      }
      const trimmedName = name.trim();
      // Check if duplicate name exists on other department
      const duplicate = await Department.findOne({
        _id: { $ne: id },
        name: { $regex: new RegExp(`^${trimmedName}$`, "i") },
      });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "A department with this name already exists.",
        });
      }
      updates.name = trimmedName;
    }

    if (code !== undefined) {
      if (typeof code !== "string" || !code.trim()) {
        return res.status(400).json({
          success: false,
          message: "Department code cannot be empty.",
        });
      }
      const formattedCode = code.trim().toUpperCase();
      // Check if duplicate code exists on other department
      const duplicate = await Department.findOne({
        _id: { $ne: id },
        code: formattedCode,
      });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "A department with this code already exists.",
        });
      }
      updates.code = formattedCode;
    }

    if (description !== undefined) {
      updates.description =
        typeof description === "string" ? description.trim() : "";
    }

    if (isActive !== undefined) {
      updates.isActive = Boolean(isActive);
    }

    const updatedDepartment = await Department.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: "Department updated successfully.",
      data: {
        department: updatedDepartment,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update department.",
      error: error.message,
    });
  }
};

/**
 * Delete department (soft delete by setting isActive to false).
 * Admin only.
 *
 * @route DELETE /api/departments/:id
 */
export const deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid department ID format.",
      });
    }

    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found.",
      });
    }

    department.isActive = false;
    await department.save();

    return res.status(200).json({
      success: true,
      message: "Department deactivated successfully.",
      data: {
        department,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete department.",
      error: error.message,
    });
  }
};

/**
 * Get maintenance staff workload for a department.
 * Accessible to Admin and the relevant Department Manager.
 *
 * @route GET /api/departments/:id/workload
 * @route GET /api/departments/workload
 */
export const getDepartmentWorkload = async (req, res) => {
  try {
    const deptId = req.params.id || req.user.department;

    if (!deptId || !mongoose.Types.ObjectId.isValid(deptId)) {
      return res.status(400).json({
        success: false,
        message: "A valid department ID is required.",
      });
    }

    // Role check: Admin or the department manager of that department
    if (req.user.role === "department_manager") {
      if (
        !req.user.department ||
        req.user.department.toString() !== deptId.toString()
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Forbidden: You can only view workload for your own department.",
        });
      }
    } else if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message:
          "Forbidden: Only admins and department managers can access workload statistics.",
      });
    }

    const department = await Department.findById(deptId);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found.",
      });
    }

    const page = Math.max(1, parseInt(req.query?.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query?.limit, 10) || 10)
    );
    const skip = (page - 1) * limit;

    // Fetch maintenance staff in this department
    const staffQuery = {
      department: deptId,
      role: "maintenance_staff",
      isActive: true,
    };

    const [staffList, totalStaff] = await Promise.all([
      User.find(staffQuery)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .select("name email phone avatar role isActive"),
      User.countDocuments(staffQuery),
    ]);

    // Aggregate issue statistics for these staff members
    const staffIds = staffList.map((s) => s._id);

    const issueStats = await Issue.aggregate([
      { $match: { assignedTo: { $in: staffIds } } },
      {
        $group: {
          _id: {
            staffId: "$assignedTo",
            status: "$status",
          },
          count: { $sum: 1 },
        },
      },
    ]);

    // Build stats lookup map
    const statsMap = {};
    staffIds.forEach((id) => {
      statsMap[id.toString()] = {
        assigned: 0,
        inProgress: 0,
        resolved: 0,
        activeWorkload: 0,
      };
    });

    issueStats.forEach((stat) => {
      const staffIdStr = stat._id.staffId.toString();
      const status = stat._id.status;
      const count = stat.count;

      if (statsMap[staffIdStr]) {
        if (status === "assigned") {
          statsMap[staffIdStr].assigned += count;
          statsMap[staffIdStr].activeWorkload += count;
        } else if (status === "in_progress") {
          statsMap[staffIdStr].inProgress += count;
          statsMap[staffIdStr].activeWorkload += count;
        } else if (["resolved", "closed"].includes(status)) {
          statsMap[staffIdStr].resolved += count;
        }
      }
    });

    const staffWorkload = staffList.map((staff) => {
      const stats = statsMap[staff._id.toString()] || {
        assigned: 0,
        inProgress: 0,
        resolved: 0,
        activeWorkload: 0,
      };
      return {
        staff,
        ...stats,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        department: {
          _id: department._id,
          name: department.name,
          code: department.code,
        },
        staffWorkload,
        totalStaff,
        page,
        totalPages: Math.ceil(totalStaff / limit) || 1,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve department team workload.",
      error: error.message,
    });
  }
};

export default {
  createDepartment,
  getAllDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
  getDepartmentWorkload,
};
