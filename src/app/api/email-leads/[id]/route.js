import connectDB from "@/lib/mongodb";
import { assertTenantContext } from "@/lib/auth-context";
import { apiError, apiOk } from "@/lib/http";
import EmailLead from "@/models/EmailLead";

export async function PATCH(request, { params }) {
  const auth = assertTenantContext(request);
  if (auth.error) return apiError(auth.error, auth.status);

  const { id } = await params;
  if (!id) return apiError("Lead id is required", 400);

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return apiError("Invalid JSON body", 400);
  }

  await connectDB();

  const updateFields = {};
  if (typeof body.isApproved === "boolean") {
    updateFields.isApproved = body.isApproved;
  }
  if (typeof body.willTakeProduct === "boolean") {
    updateFields.willTakeProduct = body.willTakeProduct;
  }

  if (Object.keys(updateFields).length === 0) {
    return apiError("No valid fields provided for update", 400);
  }

  const updatedLead = await EmailLead.findOneAndUpdate(
    { _id: id, companyId: auth.context.companyId },
    { $set: updateFields },
    { new: true }
  ).lean();

  if (!updatedLead) return apiError("Lead not found", 404);

  return apiOk({ lead: updatedLead });
}
