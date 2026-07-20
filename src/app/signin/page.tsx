import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function SigninPage() {
  return <AuthForm mode="signin" />;
}
