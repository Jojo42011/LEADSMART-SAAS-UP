import type { Metadata } from "next";
import { Checkout } from "@/components/checkout/Checkout";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: `Checkout | ${site.name}`,
};

export default function CheckoutPage() {
  return <Checkout />;
}
