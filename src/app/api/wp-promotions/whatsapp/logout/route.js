import { NextResponse } from "next/server";
import { logoutWaClient } from "@/lib/wp/waClient";
import { assertTenantContext } from "@/lib/auth-context";

export async function POST(request) {
  try {
    const auth = assertTenantContext(request);
    const clientKey = auth?.context?.companyId || "default";
    
    const result = await logoutWaClient(clientKey);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[WA-LOGOUT-API] Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Support GET for easy manual trigger if needed
export async function GET(request) {
  try {
    const auth = assertTenantContext(request);
    const clientKey = auth?.context?.companyId || "default";
    
    const result = await logoutWaClient(clientKey);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
