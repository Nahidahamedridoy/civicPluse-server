import { Router } from "express";
import { getProfile, updateProfile } from "../controllers/userController.js";
import { authenticate } from "../middleware/auth.js";
import { uploadSingleImage } from "../middleware/upload.js";

const router = Router();

// Protect all profile endpoints with authentication middleware
router.use(authenticate);

router.get("/profile", getProfile);
router.patch("/profile", uploadSingleImage, updateProfile);

export default router;
