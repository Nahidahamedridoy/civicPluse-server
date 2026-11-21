import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { generateToken } from "../utils/jwt.js";

/**
 * Register a new citizen account.
 * Public registration always assigns the 'citizen' role.
 *
 * @route POST /api/auth/register (or /register)
 */
export const register = async (req, res) => {
  try {
    const { name, email, password, phone, avatar } = req.body;

    // Validate required fields
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

    const normalizedEmail = email.toLowerCase().trim();

    // Check for duplicate email
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email is already registered.",
      });
    }

    // Securely hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Enforce citizen role and reject privilege escalation
    const newUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      phone: typeof phone === "string" ? phone.trim() : null,
      avatar: typeof avatar === "string" ? avatar.trim() : null,
      role: "citizen",
      department: null,
      isActive: true,
      isEmailVerified: false,
    });

    // Generate JWT
    const token = generateToken({
      id: newUser._id,
      role: newUser.role,
    });

    // Safe user response without password
    const userResponse = {
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      phone: newUser.phone,
      avatar: newUser.avatar,
      department: newUser.department,
      isActive: newUser.isActive,
      isEmailVerified: newUser.isEmailVerified,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt,
    };

    return res.status(201).json({
      success: true,
      message: "Registration successful.",
      data: {
        user: userResponse,
        token,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error during registration.",
      error: error.message,
    });
  }
};

/**
 * Login user using email and password.
 *
 * @route POST /api/auth/login (or /login)
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Query user and explicitly select password
    const user = await User.findOne({ email: normalizedEmail }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is deactivated. Please contact support.",
      });
    }

    // Compare passwords securely
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // Generate JWT
    const token = generateToken({
      id: user._id,
      role: user.role,
    });

    // Safe user response without password
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      avatar: user.avatar,
      department: user.department,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: {
        user: userResponse,
        token,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error during login.",
      error: error.message,
    });
  }
};

export default {
  register,
  login,
};
