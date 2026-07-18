"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { 
  OverviewIcon, UsageIcon, PromotionIcon, CampaignIcon, 
  LeadIcon, OrderIcon, DeliveryIcon, SettingsIcon, 
  UserIcon, SubscriptionIcon, LogoutIcon 
} from "./DashboardIcons";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: OverviewIcon },
  { href: "/dashboard/usage", label: "Usage", icon: UsageIcon },
  { href: "/dashboard/wp-promotions", label: "WP Promotions", icon: PromotionIcon },
  { href: "/dashboard/wp-leads", label: "WP Leads", icon: LeadIcon },
  { href: "/dashboard/email-promotions", label: "Email Promotions", icon: PromotionIcon },
  { href: "/dashboard/email-leads", label: "Email Leads", icon: LeadIcon },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: CampaignIcon },
  { href: "/dashboard/leads", label: "Leads", icon: LeadIcon },
  { href: "/dashboard/orders", label: "Orders", icon: OrderIcon },
  { href: "/dashboard/deliveries", label: "Deliveries", icon: DeliveryIcon },
  { href: "/dashboard/courier-settings", label: "Courier Settings", icon: SettingsIcon },
  { href: "/dashboard/users", label: "Users", icon: UserIcon },
  { href: "/dashboard/subscription", label: "Subscription", icon: SubscriptionIcon },
];

export default function Sidebar({ sessionUser, onLogout }) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 text-slate-300 transition-all duration-300 lg:translate-x-0">
      <div className="flex h-full flex-col p-6">
        {/* Brand */}
        <div className="mb-10 flex items-center gap-2 text-xl font-bold tracking-tight text-white">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">S</div>
          Smart Growth<span className="font-light text-amber-500">|</span>
        </div>

        {/* User Info */}
        <div className="mb-8 rounded-2xl bg-slate-800/50 p-4 ring-1 ring-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-indigo-500/20 ring-2 ring-indigo-500/40 flex items-center justify-center text-indigo-400 font-bold">
              {sessionUser?.name?.[0] || "U"}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-semibold text-white">{sessionUser?.name || "User"}</p>
              <p className="truncate text-xs text-slate-400">{sessionUser?.company?.name || "No Company"}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                  isActive 
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                    : "hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon />
                {item.label}
                {isActive && (
                  <motion.div 
                    layoutId="active-pill"
                    className="absolute right-2 h-1.5 w-1.5 rounded-full bg-white"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer / Logout */}
        <div className="mt-6 pt-6 border-t border-slate-800">
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-400 transition-all hover:bg-red-500/10 hover:text-red-400"
          >
            <LogoutIcon />
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
