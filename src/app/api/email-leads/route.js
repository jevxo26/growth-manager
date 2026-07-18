import connectDB from "@/lib/mongodb";
import { assertTenantContext } from "@/lib/auth-context";
import { apiError, apiOk } from "@/lib/http";
import EmailLead from "@/models/EmailLead";

export async function GET(request) {
  const auth = assertTenantContext(request);
  if (auth.error) return apiError(auth.error, auth.status);

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const isApproved = searchParams.get("isApproved");
  const willTakeProduct = searchParams.get("willTakeProduct");
  const search = searchParams.get("search");
  const fetchStats = searchParams.get("fetchStats") === "true";
  const fetchAll = searchParams.get("all") === "true";

  const query = { companyId: auth.context.companyId };

  if (isApproved === "true") query.isApproved = true;
  if (isApproved === "false") query.isApproved = false;

  if (willTakeProduct === "true") query.willTakeProduct = true;
  if (willTakeProduct === "false") query.willTakeProduct = false;

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  await connectDB();

  let stats = null;
  if (fetchStats) {
    // We count based on the current filter `query`
    const [totalCount, approvedCount, productCount] = await Promise.all([
      EmailLead.countDocuments(query),
      EmailLead.countDocuments({ ...query, isApproved: true }),
      EmailLead.countDocuments({ ...query, willTakeProduct: true }),
    ]);
    stats = {
      total: totalCount,
      approved: approvedCount,
      willTakeProduct: productCount,
    };
  }

  let leads;
  let total = 0;

  if (fetchAll) {
    leads = await EmailLead.find(query).sort({ sentAt: -1 }).lean();
    total = leads.length;
  } else {
    const skip = (page - 1) * limit;
    total = await EmailLead.countDocuments(query);
    leads = await EmailLead.find(query)
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  return apiOk({
    leads,
    stats,
    pagination: {
      total,
      page: fetchAll ? 1 : page,
      limit: fetchAll ? total : limit,
      totalPages: fetchAll ? 1 : Math.ceil(total / limit),
    },
  });
}
