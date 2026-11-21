import { Router } from "express";
import { getAnalytics } from "../controllers/analyticsController.js";
import { authenticate } from "../middleware/auth.js";
import { authorizeRoles } from "../middleware/authorize.js";

const router = Router();

// Analytics is only accessible to authenticated Admins and Department Managers
router.use(authenticate, authorizeRoles("admin", "department_manager"));

router.get("/", getAnalytics);

export default router;
