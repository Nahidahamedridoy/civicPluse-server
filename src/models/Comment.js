import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
  {
    issue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Issue",
      required: [true, "Issue reference is required"],
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
    },
    message: {
      type: String,
      required: [true, "Comment message is required"],
      trim: true,
      minlength: [1, "Comment message cannot be empty"],
      maxlength: [2000, "Comment message cannot exceed 2000 characters"],
    },
  },
  {
    timestamps: true,
  }
);

// Index on issue field for fast retrieval of comments by issue
commentSchema.index({ issue: 1 });

const Comment = mongoose.model("Comment", commentSchema);

export default Comment;
