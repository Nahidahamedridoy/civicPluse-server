import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    issue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Issue",
      required: [true, "Issue reference is required"],
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User (performedBy) reference is required"],
    },
    action: {
      type: String,
      required: [true, "Action is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Activity description is required"],
      trim: true,
    },
    previousStatus: {
      type: String,
      trim: true,
      default: null,
    },
    newStatus: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
activityLogSchema.index({ issue: 1 });
activityLogSchema.index({ performedBy: 1 });
activityLogSchema.index({ issue: 1, createdAt: -1 });

const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);

export default ActivityLog;
