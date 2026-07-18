import mongoose from "mongoose";

const emailLeadSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    name: { type: String, default: "" },
    email: { type: String, required: true },
    isApproved: { type: Boolean, default: false },
    willTakeProduct: { type: Boolean, default: false },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

emailLeadSchema.index({ companyId: 1, email: 1 }, { unique: true });

export default mongoose.models.EmailLead || mongoose.model("EmailLead", emailLeadSchema);
