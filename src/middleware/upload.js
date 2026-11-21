import multer from "multer";

// Configure memory storage so files are never written to server disk
const storage = multer.memoryStorage();

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

// Allowed extensions
const ALLOWED_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

/**
 * File filter to ensure only JPEG, JPG, PNG, and WEBP images are accepted.
 */
const fileFilter = (req, file, cb) => {
  const isMimeValid = ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase());
  const isExtValid = ALLOWED_EXTENSIONS.test(file.originalname);

  if (isMimeValid && isExtValid) {
    cb(null, true);
  } else {
    const error = new Error(
      "Invalid file type. Only JPEG, JPG, PNG, and WEBP formats are allowed."
    );
    error.code = "INVALID_FILE_TYPE";
    cb(error, false);
  }
};

/**
 * Base multer instance with 5 MB file size limit and memory storage
 */
export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB per file
  },
  fileFilter,
});

/**
 * Middleware for uploading up to 5 images for an issue
 */
export const uploadIssueImages = upload.array("images", 5);

/**
 * Middleware for uploading a single image (e.g., avatar)
 */
export const uploadSingleImage = upload.single("image");

export default {
  upload,
  uploadIssueImages,
  uploadSingleImage,
};

