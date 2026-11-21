import { Router } from "express";
import {
  addComment,
  getCommentsByIssue,
  deleteComment,
} from "../controllers/commentController.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// Protect all comment endpoints with authentication
router.use(authenticate);

// Endpoints according to specification
router.post("/issues/:issueId/comments", addComment);
router.get("/issues/:issueId/comments", getCommentsByIssue);
router.delete("/comments/:commentId", deleteComment);

// Direct comment deletion when mounted under /api/comments
router.delete("/:commentId", deleteComment);

export default router;
