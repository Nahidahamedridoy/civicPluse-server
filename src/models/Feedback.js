import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema(
  {
    issue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Issue",
      required: [true, "Issue reference is required"],
    },
    citizen: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Citizen reference is required"],
    },
    rating: {
      type: Number,
      required: [true, "Rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot be greater than 5"],
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [1000, "Feedback comment cannot exceed 1000 characters"],
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate feedback for the same issue by the same citizen
feedbackSchema.index({ issue: 1, citizen: 1 }, { unique: true });
feedbackSchema.index({ issue: 1 });

const Feedback = mongoose.model("Feedback", feedbackSchema);

export default Feedback;
