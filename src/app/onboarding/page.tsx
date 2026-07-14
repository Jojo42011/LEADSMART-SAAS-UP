import type { Metadata } from "next";
import { Wizard } from "@/components/onboarding/Wizard";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: `Get started | ${site.name}`,
};

export default function OnboardingPage() {
  return <Wizard />;
}
