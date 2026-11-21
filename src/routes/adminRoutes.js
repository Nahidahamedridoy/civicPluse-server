import { Router } from "express";
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserRole,
  updateUserStatus,
} from "../controllers/adminController.js";
import { authenticate } from "../middleware/auth.js";
import { authorizeRoles } from "../middleware/authorize.js";

const router = Router();

// Protect all admin user management routes
router.use(authenticate, authorizeRoles("admin"));

router.get("/users", getAllUsers);
router.get("/users/:id", getUserById);
router.post("/users", createUser);
router.patch("/users/:id", updateUser);
router.patch("/users/:id/status", updateUserStatus);
router.patch("/users/:id/role", updateUserRole);

export default router;
