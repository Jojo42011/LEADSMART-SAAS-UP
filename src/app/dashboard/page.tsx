import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: `Command center | ${site.name}`,
};

export default function DashboardPage() {
  return <Dashboard />;
}
