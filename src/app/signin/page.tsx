import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: `Sign in | ${site.name}`,
};

export default function SigninPage() {
  return <AuthForm mode="signin" />;
}
