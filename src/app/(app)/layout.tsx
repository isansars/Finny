import { Shell } from "@/components/Shell";
// Pages check the session themselves (requireMe), so a signed-out visit returns to the page asked for after sign-in.
export default function AppLayout({ children }: { children: React.ReactNode }) { return <Shell>{children}</Shell>; }
