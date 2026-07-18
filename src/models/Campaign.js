import mongoose from "mongoose";

const campaignFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    placeholder: { type: String, default: "", trim: true },
    type: {
      type: String,
      enum: ["text", "phone", "email", "textarea", "select", "radio", "checkbox", "file", "date", "time"],
      default: "text",
    },
    required: { type: Boolean, default: false },
    options: { type: [String], default: [] },
  },
  { _id: false }
);

const campaignSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    publicToken: { type: String, unique: true, sparse: true, trim: true, index: true },
    redirectUrl: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["draft", "active", "closed"],
      default: "active",
      index: true,
    },
    fields: { type: [campaignFieldSchema], default: [] },

    design: {
      brandColor: { type: String, default: "#18181b", trim: true },
      pageBgColor: { type: String, default: "#f4f4f5", trim: true },
      cardBgColor: { type: String, default: "#ffffff", trim: true },
      titleColor: { type: String, default: "#18181b", trim: true },
      descriptionColor: { type: String, default: "#71717a", trim: true },
      inputBgColor: { type: String, default: "#ffffff", trim: true },
      inputBorderColor: { type: String, default: "#e4e4e7", trim: true },
      buttonTextColor: { type: String, default: "#ffffff", trim: true },
      borderRadius: { type: Number, default: 12 },
      headerImageUrl: { type: String, default: "", trim: true },
      fontFamily: { type: String, default: "Inter", trim: true },
      submitButtonText: { type: String, default: "Submit", trim: true },
      successMessage: {
        type: String,
        default: "Thank you! Your response has been submitted.",
        trim: true,
      },
    },
  },
  { timestamps: true }
);

campaignSchema.index({ companyId: 1, createdAt: -1 });

delete mongoose.models.Campaign;
export default mongoose.model("Campaign", campaignSchema);
