import { Router } from "express";
import {
  createDepartment,
  getAllDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
} from "../controllers/departmentController.js";
import { authenticate } from "../middleware/auth.js";
import { authorizeRoles } from "../middleware/authorize.js";

const router = Router();

// All department endpoints require authentication
router.use(authenticate);

// Publicly visible to all authenticated users
router.get("/", getAllDepartments);
router.get("/:id", getDepartmentById);

// Admin-only operations
router.post("/", authorizeRoles("admin"), createDepartment);
router.patch("/:id", authorizeRoles("admin"), updateDepartment);
router.delete("/:id", authorizeRoles("admin"), deleteDepartment);

export default router;
