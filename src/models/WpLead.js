import mongoose from "mongoose";

const wpLeadSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    name: { type: String, default: "" },
    phone: { type: String, required: true },
    isApproved: { type: Boolean, default: false },
    willTakeProduct: { type: Boolean, default: false },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

wpLeadSchema.index({ companyId: 1, phone: 1 }, { unique: true });

export default mongoose.models.WpLead || mongoose.model("WpLead", wpLeadSchema);
