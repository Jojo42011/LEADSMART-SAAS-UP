import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: `Create account | ${site.name}`,
};

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
