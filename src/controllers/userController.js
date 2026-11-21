import User from "../models/User.js";

/**
 * Get current authenticated user's profile.
 *
 * @route GET /api/users/profile (or /profile)
 */
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate(
      "department",
      "name code"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User profile not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile retrieved successfully.",
      data: {
        user,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve user profile.",
      error: error.message,
    });
  }
};

/**
 * Update authenticated user's profile.
 * Only allows updating name, phone, and avatar.
 * Prevents changing role, department, email, or password.
 *
 * @route PATCH /api/users/profile (or /profile)
 */
export const updateProfile = async (req, res) => {
  try {
    const { name, phone, avatar } = req.body;
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

    // Execute update with only whitelisted fields
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate("department", "name code");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      data: {
        user: updatedUser,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update user profile.",
      error: error.message,
    });
  }
};

export default {
  getProfile,
  updateProfile,
};
