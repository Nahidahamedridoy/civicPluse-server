/**
 * ImgBB Image Upload Service
 * Securely uploads images to ImgBB and returns hosted URLs.
 */

/**
 * Upload a single image (Buffer, Multer file object, or Base64 string) to ImgBB.
 *
 * @param {Buffer|Object|string} fileOrBuffer - Image buffer, Multer file, or base64 string.
 * @param {string} [customName] - Optional custom filename.
 * @returns {Promise<string>} The hosted image URL from ImgBB.
 */
export const uploadImage = async (fileOrBuffer, customName = "") => {
  const apiKey = process.env.IMGBB_API_KEY;

  if (!apiKey || !apiKey.trim()) {
    throw new Error(
      "IMGBB_API_KEY is not defined in environment variables. Please configure IMGBB_API_KEY in your .env file."
    );
  }

  let base64Image;

  if (Buffer.isBuffer(fileOrBuffer)) {
    base64Image = fileOrBuffer.toString("base64");
  } else if (
    fileOrBuffer &&
    fileOrBuffer.buffer &&
    Buffer.isBuffer(fileOrBuffer.buffer)
  ) {
    // Multer memory-storage file object
    base64Image = fileOrBuffer.buffer.toString("base64");
  } else if (typeof fileOrBuffer === "string" && fileOrBuffer.trim()) {
    // Base64 string (strips any data URL prefix like "data:image/png;base64,")
    base64Image = fileOrBuffer.replace(/^data:image\/\w+;base64,/, "").trim();
  } else {
    throw new Error(
      "Invalid image payload provided. Expected a Buffer, Multer file object, or Base64 string."
    );
  }

  // Prepare payload for ImgBB API
  const formData = new URLSearchParams();
  formData.append("image", base64Image);
  if (customName) {
    formData.append("name", customName);
  }

  const endpoint = `https://api.imgbb.com/1/upload?key=${encodeURIComponent(
    apiKey.trim()
  )}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const data = await response.json();

    if (!response.ok || !data || !data.success) {
      const errorMsg =
        data?.error?.message ||
        `ImgBB API error with status ${response.status}: ${response.statusText}`;
      throw new Error(`Image upload failed: ${errorMsg}`);
    }

    // Return hosted URL
    return data.data.url;
  } catch (error) {
    // Prevent leaking API key if it appeared in error URLs
    const sanitizedMessage = error.message.replace(apiKey.trim(), "[REDACTED]");
    throw new Error(`ImgBB upload error: ${sanitizedMessage}`);
  }
};

/**
 * Upload multiple images concurrently to ImgBB.
 *
 * @param {Array<Buffer|Object|string>} files - Array of image files/buffers.
 * @returns {Promise<string[]>} Array of hosted image URLs.
 */
export const uploadMultipleImages = async (files) => {
  if (!Array.isArray(files) || files.length === 0) {
    return [];
  }

  const uploadPromises = files.map((file, index) => {
    const filename = file?.originalname || `image_${Date.now()}_${index + 1}`;
    return uploadImage(file, filename);
  });

  return Promise.all(uploadPromises);
};

export default {
  uploadImage,
  uploadMultipleImages,
};

