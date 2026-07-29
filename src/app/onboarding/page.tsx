import type { Metadata } from "next";
import { Wizard } from "@/components/onboarding/Wizard";

export const metadata: Metadata = {
  title: "Get started",
};

export default function OnboardingPage() {
  return <Wizard />;
}
