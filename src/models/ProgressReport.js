import mongoose from "mongoose";

const progressReportSchema = new mongoose.Schema(
  {
    issue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Issue",
      required: [true, "Issue reference is required"],
    },
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Maintenance staff reference is required"],
    },
    note: {
      type: String,
      required: [true, "Progress note is required"],
      trim: true,
      minlength: [5, "Progress note must be at least 5 characters long"],
      maxlength: [3000, "Progress note cannot exceed 3000 characters"],
    },
    images: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
progressReportSchema.index({ issue: 1, createdAt: -1 });
progressReportSchema.index({ staff: 1 });

const ProgressReport = mongoose.model("ProgressReport", progressReportSchema);

export default ProgressReport;
