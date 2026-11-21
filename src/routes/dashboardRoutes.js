import { Router } from "express";
import { getDashboardStats } from "../controllers/dashboardController.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// Protect all dashboard routes
router.use(authenticate);

router.get("/", getDashboardStats);

export default router;
