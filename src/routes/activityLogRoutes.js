import { Router } from "express";
import { getActivityLogsByIssue } from "../controllers/activityLogController.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// Protect activity log routes with authentication
router.use(authenticate);

router.get("/issues/:issueId/activity", getActivityLogsByIssue);
router.get("/:issueId", getActivityLogsByIssue);

export default router;
