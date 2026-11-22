import { Router } from "express";
import { getMapIssues, getNearbyIssues } from "../controllers/mapController.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// Protect map endpoints with authentication
router.use(authenticate);

// 1. GPS-based Issue Map API: GET /api/map/issues
router.get("/issues", getMapIssues);

// 2. Nearby Issues API: GET /api/map/nearby
router.get("/nearby", getNearbyIssues);

export default router;
