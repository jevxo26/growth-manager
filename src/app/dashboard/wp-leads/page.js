import WpLeadsClient from "./wp-leads-client";

export const metadata = {
  title: "WP Leads - Smart Delivery",
  description: "Manage leads from your WhatsApp promotions.",
};

export default function WpLeadsPage() {
  return <WpLeadsClient />;
}
