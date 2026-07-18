"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/usage", label: "Usage" },
  { href: "/dashboard/wp-promotions", label: "WP Promotions" },
  { href: "/dashboard/wp-leads", label: "WP Leads" },
  { href: "/dashboard/email-promotions", label: "Email Promotions" },
  { href: "/dashboard/email-leads", label: "Email Leads" },
  { href: "/dashboard/campaigns", label: "Campaigns" },
  { href: "/dashboard/leads", label: "Leads" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/deliveries", label: "Deliveries" },
  { href: "/dashboard/courier-settings", label: "Courier Settings" },
  { href: "/dashboard/users", label: "Users" },
  { href: "/dashboard/subscription", label: "Subscription" },
];

export default function CustomerDashboardShell({ title, children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sessionUser, setSessionUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => response.json().then((json) => ({ response, json })))
      .then(({ response, json }) => {
        if (!response.ok) {
          router.replace("/login");
          return;
        }
        setSessionUser(json?.data || null);
        setLoadingUser(false);
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (loadingUser) {
    return <main className="min-h-screen p-8">Checking account...</main>;
  }

  return (
    <main className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto grid w-full max-w-7xl gap-6 md:grid-cols-[240px_1fr]">
        <aside className="rounded-xl border bg-white p-4">
          <h2 className="text-lg font-semibold">Customer Dashboard</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Logged in as {sessionUser?.name || "User"}
            {sessionUser?.company?.name ? ` · ${sessionUser.company.name}` : ""}
          </p>

          <nav className="mt-4 grid gap-2">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded px-3 py-2 text-sm ${
                    isActive ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-6 rounded border p-3 text-xs">
            <p>
              <span className="font-medium">Role:</span> {sessionUser?.role}
            </p>
            <p className="mt-1 break-all text-zinc-500">{sessionUser?.email}</p>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 w-full rounded bg-zinc-900 px-3 py-2 text-white"
            >
              Logout
            </button>
          </div>
        </aside>

        <section className="rounded-xl border bg-white p-5">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <div className="mt-5">{children}</div>
        </section>
      </div>
    </main>
  );
}
