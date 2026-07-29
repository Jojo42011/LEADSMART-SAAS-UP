import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { requireUser } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Command center",
};

export default async function DashboardPage() {
  // Checked on the server before any markup is sent, so the command center
  // cannot be reached by navigating straight to /dashboard.
  await requireUser();
  return <Dashboard />;
}
