import mongoose from "mongoose";

const locationSchema = new mongoose.Schema(
  {
    address: {
      type: String,
      trim: true,
      default: "",
    },
    latitude: {
      type: Number,
      min: [-90, "Latitude must be between -90 and 90"],
      max: [90, "Latitude must be between -90 and 90"],
      default: null,
    },
    longitude: {
      type: Number,
      min: [-180, "Longitude must be between -180 and 180"],
      max: [180, "Longitude must be between -180 and 180"],
      default: null,
    },
    coordinates: {
      type: [Number], // [longitude, latitude] for geospatial 2dsphere queries
      default: undefined,
    },
  },
  { _id: false }
);

const issueSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Issue title is required"],
      trim: true,
      minlength: [3, "Title must be at least 3 characters long"],
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Issue description is required"],
      trim: true,
      minlength: [10, "Description must be at least 10 characters long"],
      maxlength: [5000, "Description cannot exceed 5000 characters"],
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: [true, "Department is required"],
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Reporting user (reportedBy) is required"],
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: {
        values: [
          "submitted",
          "under_review",
          "assigned",
          "in_progress",
          "resolved",
          "closed",
        ],
        message: "{VALUE} is not a valid issue status",
      },
      default: "submitted",
    },
    priority: {
      type: String,
      enum: {
        values: ["low", "medium", "high", "urgent"],
        message: "{VALUE} is not a valid issue priority",
      },
      default: "medium",
    },
    location: {
      type: locationSchema,
      default: null,
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

// Automatically sync coordinates from latitude & longitude
issueSchema.pre("save", function (next) {
  if (
    this.location &&
    this.location.latitude != null &&
    this.location.longitude != null
  ) {
    this.location.coordinates = [
      Number(this.location.longitude),
      Number(this.location.latitude),
    ];
  }
  if (typeof next === "function") {
    next();
  }
});

// Indexes for searching and filtering
issueSchema.index({ status: 1, priority: 1 });
issueSchema.index({ department: 1, status: 1 });
issueSchema.index({ reportedBy: 1, createdAt: -1 });
issueSchema.index({ assignedTo: 1, status: 1 });
issueSchema.index({ category: 1 });
issueSchema.index({ createdAt: -1 });
issueSchema.index({ title: "text", description: "text" });
issueSchema.index({ "location.coordinates": "2dsphere" });

const Issue = mongoose.model("Issue", issueSchema);

export default Issue;
