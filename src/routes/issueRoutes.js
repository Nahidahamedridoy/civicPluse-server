import { Router } from "express";
import {
  createIssue,
  getIssues,
  getMyReports,
  getAssignedIssues,
  getIssueById,
  updateIssue,
  verifyIssue,
  assignIssue,
  updateIssueStatus,
} from "../controllers/issueController.js";
import {
  addComment,
  getCommentsByIssue,
} from "../controllers/commentController.js";
import { getActivityLogsByIssue } from "../controllers/activityLogController.js";
import {
  addProgressReport,
  getProgressReportsByIssue,
} from "../controllers/progressReportController.js";
import {
  submitFeedback,
  getFeedbackByIssue,
} from "../controllers/feedbackController.js";
import { uploadIssueImages } from "../middleware/upload.js";
import { authenticate } from "../middleware/auth.js";
import { authorizeRoles } from "../middleware/authorize.js";

const router = Router();

// Protect all issue routes with authentication middleware
router.use(authenticate);

// Specific GET routes before param route
router.get("/my-reports", authorizeRoles("citizen"), getMyReports);
router.get("/assigned", authorizeRoles("maintenance_staff"), getAssignedIssues);

// General list and create (supports up to 5 multipart images via uploadIssueImages)
router.post("/", authorizeRoles("citizen"), uploadIssueImages, createIssue);
router.get("/", getIssues);

// Param-based operations
router.get("/:id", getIssueById);
router.patch("/:id", updateIssue);
router.patch(
  "/:id/verify",
  authorizeRoles("admin", "department_manager"),
  verifyIssue
);
router.patch(
  "/:id/assign",
  authorizeRoles("admin", "department_manager"),
  assignIssue
);
router.patch("/:id/status", updateIssueStatus);

// Work Progress Reports (Maintenance staff submit completion reports with photos)
router.post(
  "/:id/progress-reports",
  authorizeRoles("maintenance_staff", "admin"),
  uploadIssueImages,
  addProgressReport
);
router.get("/:id/progress-reports", getProgressReportsByIssue);

// Citizen Feedback (Only citizen can submit feedback for resolved/closed issues)
router.post("/:id/feedback", authorizeRoles("citizen"), submitFeedback);
router.get("/:id/feedback", getFeedbackByIssue);

// Comments and Activity history sub-resources
router.get("/:id/comments", getCommentsByIssue);
router.post("/:id/comments", addComment);
router.get("/:id/activity", getActivityLogsByIssue);

export default router;
