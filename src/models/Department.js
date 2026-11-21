import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Department name is required"],
      unique: true,
      trim: true,
      minlength: [2, "Department name must be at least 2 characters long"],
      maxlength: [100, "Department name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
      default: "",
    },
    code: {
      type: String,
      required: [true, "Department code is required"],
      unique: true,
      uppercase: true,
      trim: true,
      minlength: [2, "Department code must be at least 2 characters long"],
      maxlength: [20, "Department code cannot exceed 20 characters"],
      match: [
        /^[A-Z0-9_-]+$/,
        "Department code can only contain uppercase letters, numbers, hyphens, and underscores",
      ],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
departmentSchema.index({ isActive: 1 });

const Department = mongoose.model("Department", departmentSchema);

export default Department;
