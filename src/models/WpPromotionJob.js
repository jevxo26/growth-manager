import mongoose from "mongoose";

const wpJobRecipientSchema = new mongoose.Schema(
  {
    leadId: { type: mongoose.Schema.Types.ObjectId, required: false },
    name: { type: String, default: "" },
    phone: { type: String, required: true },
  },
  { _id: false }
);

const wpJobLogSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true },
    name: { type: String, default: "" },
    phone: { type: String, required: true },
    status: { type: String, enum: ["queued", "failed"], required: true },
    waLink: { type: String, default: "" },
    error: { type: String, default: "" },
    sentAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const wpPromotionJobSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    draftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WpPromotionDraft",
      required: true,
      index: true,
    },
    recipients: { type: [wpJobRecipientSchema], default: [] },
    templateText: { type: String, required: true },
    templateLink: { type: String, default: "" },

    intervalSeconds: { type: Number, default: 5, min: 5 },
    currentIndex: { type: Number, default: 0, min: 0 },
    retryCount: { type: Number, default: 0, min: 0 },
    sentCount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["running", "completed", "failed", "cancelled"], default: "running", index: true },

    nextRunAt: { type: Date, default: null },
    lastRunAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
    lastWaLink: { type: String, default: "" },
    sendLogs: { type: [wpJobLogSchema], default: [] },
  },
  { timestamps: true }
);

wpPromotionJobSchema.index({ companyId: 1, status: 1, createdAt: -1 });

export default mongoose.models.WpPromotionJob || mongoose.model("WpPromotionJob", wpPromotionJobSchema);

