import { Router } from "express";
import {
  createDepartment,
  getAllDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
  getDepartmentWorkload,
} from "../controllers/departmentController.js";
import { authenticate } from "../middleware/auth.js";
import { authorizeRoles } from "../middleware/authorize.js";

const router = Router();

// All department endpoints require authentication
router.use(authenticate);

// Team Workload endpoints (Admin & Department Manager only)
router.get(
  "/workload",
  authorizeRoles("admin", "department_manager"),
  getDepartmentWorkload
);
router.get(
  "/:id/workload",
  authorizeRoles("admin", "department_manager"),
  getDepartmentWorkload
);

// Publicly visible to all authenticated users
router.get("/", getAllDepartments);
router.get("/:id", getDepartmentById);

// Admin-only operations
router.post("/", authorizeRoles("admin"), createDepartment);
router.patch("/:id", authorizeRoles("admin"), updateDepartment);
router.delete("/:id", authorizeRoles("admin"), deleteDepartment);

export default router;
