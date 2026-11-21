import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Department from "../models/Department.js";

/**
 * Get all users with pagination, search, and filtering.
 * Admin only.
 *
 * @route GET /api/admin/users
 */
export const getAllUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query?.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query?.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const { role, department, isActive, search } = req.query || {};
    const query = {};

    if (role) {
      query.role = role;
    }

    if (department && mongoose.Types.ObjectId.isValid(department)) {
      query.department = department;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    if (search && typeof search === "string" && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [{ name: searchRegex }, { email: searchRegex }];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("department", "name code"),
      User.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      count: users.length,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      data: {
        users,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve users.",
      error: error.message,
    });
  }
};

/**
 * Get user details by ID.
 * Admin only.
 *
 * @route GET /api/admin/users/:id
 */
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format.",
      });
    }

    const user = await User.findById(id).populate("department", "name code");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        user,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve user.",
      error: error.message,
    });
  }
};

/**
 * Create department_manager or maintenance_staff accounts.
 * Admin only.
 *
 * @route POST /api/admin/users
 */
export const createUser = async (req, res) => {
  try {
    const { name, email, password, role, department, phone, avatar } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name is required.",
      });
    }

    if (!email || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password is required and must be at least 6 characters long.",
      });
    }

    const allowedRoles = [
      "department_manager",
      "maintenance_staff",
      "admin",
      "citizen",
    ];
    if (!role || !allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Role must be one of: ${allowedRoles.join(", ")}.`,
      });
    }

    // Roles requiring a department
    let departmentId = null;
    if (["department_manager", "maintenance_staff"].includes(role)) {
      if (!department || !mongoose.Types.ObjectId.isValid(department)) {
        return res.status(400).json({
          success: false,
          message: `Department is required for role '${role}'.`,
        });
      }

      const existingDept = await Department.findOne({
        _id: department,
        isActive: true,
      });
      if (!existingDept) {
        return res.status(404).json({
          success: false,
          message: "Active department not found with the provided ID.",
        });
      }
      departmentId = existingDept._id;
    } else if (department && mongoose.Types.ObjectId.isValid(department)) {
      departmentId = department;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check duplicate email
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists.",
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role,
      department: departmentId,
      phone: typeof phone === "string" ? phone.trim() : null,
      avatar: typeof avatar === "string" ? avatar.trim() : null,
      isActive: true,
      isEmailVerified: true, // Created by admin
    });

    const populatedUser = await User.findById(newUser._id).populate(
      "department",
      "name code"
    );

    return res.status(201).json({
      success: true,
      message: "User created successfully.",
      data: {
        user: populatedUser,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create user.",
      error: error.message,
    });
  }
};

/**
 * Update user information and department assignment.
 * Admin only.
 *
 * @route PATCH /api/admin/users/:id
 */
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, avatar, department } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format.",
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const updates = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: "Name must be at least 2 characters long.",
        });
      }
      updates.name = name.trim();
    }

    if (phone !== undefined) {
      updates.phone = typeof phone === "string" ? phone.trim() : phone;
    }

    if (avatar !== undefined) {
      updates.avatar = typeof avatar === "string" ? avatar.trim() : avatar;
    }

    if (department !== undefined) {
      if (department === null) {
        if (["department_manager", "maintenance_staff"].includes(user.role)) {
          return res.status(400).json({
            success: false,
            message: `Department cannot be null for ${user.role}.`,
          });
        }
        updates.department = null;
      } else {
        if (!mongoose.Types.ObjectId.isValid(department)) {
          return res.status(400).json({
            success: false,
            message: "Invalid department ID format.",
          });
        }
        const deptExists = await Department.findOne({
          _id: department,
          isActive: true,
        });
        if (!deptExists) {
          return res.status(404).json({
            success: false,
            message: "Active department not found.",
          });
        }
        updates.department = deptExists._id;
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate("department", "name code");

    return res.status(200).json({
      success: true,
      message: "User updated successfully.",
      data: {
        user: updatedUser,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update user.",
      error: error.message,
    });
  }
};

/**
 * Change user role.
 * Admin only.
 *
 * @route PATCH /api/admin/users/:id/role
 */
export const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, department } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format.",
      });
    }

    const allowedRoles = [
      "admin",
      "department_manager",
      "maintenance_staff",
      "citizen",
    ];
    if (!role || !allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Role must be one of: ${allowedRoles.join(", ")}.`,
      });
    }

    // Prevent admin from removing their own admin role
    if (id === req.user._id.toString() && role !== "admin") {
      return res.status(400).json({
        success: false,
        message: "Cannot revoke your own admin role.",
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // If new role requires department, ensure one is present
    let departmentId = department || user.department;
    if (["department_manager", "maintenance_staff"].includes(role)) {
      if (!departmentId || !mongoose.Types.ObjectId.isValid(departmentId)) {
        return res.status(400).json({
          success: false,
          message: `Department is required when assigning role '${role}'.`,
        });
      }
      const deptExists = await Department.findOne({
        _id: departmentId,
        isActive: true,
      });
      if (!deptExists) {
        return res.status(404).json({
          success: false,
          message: "Active department not found.",
        });
      }
      departmentId = deptExists._id;
    } else if (role === "citizen" || role === "admin") {
      departmentId = department ? department : user.department;
    }

    user.role = role;
    user.department = departmentId;
    await user.save();

    const updatedUser = await User.findById(user._id).populate(
      "department",
      "name code"
    );

    return res.status(200).json({
      success: true,
      message: `User role updated to '${role}'.`,
      data: {
        user: updatedUser,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update user role.",
      error: error.message,
    });
  }
};

/**
 * Activate or deactivate user accounts.
 * Admin only.
 *
 * @route PATCH /api/admin/users/:id/status
 */
export const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format.",
      });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Field 'isActive' must be a boolean value.",
      });
    }

    // Prevent logged-in admin from deactivating themselves
    if (id === req.user._id.toString() && isActive === false) {
      return res.status(400).json({
        success: false,
        message: "Cannot deactivate your own admin account.",
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    user.isActive = isActive;
    await user.save();

    const populatedUser = await User.findById(user._id).populate(
      "department",
      "name code"
    );

    return res.status(200).json({
      success: true,
      message: `User account ${isActive ? "activated" : "deactivated"} successfully.`,
      data: {
        user: populatedUser,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update user status.",
      error: error.message,
    });
  }
};

export default {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserRole,
  updateUserStatus,
};
