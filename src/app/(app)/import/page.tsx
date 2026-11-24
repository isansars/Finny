import { requireMe } from "@/lib/session";
import { ImportWizard } from "@/components/ImportWizard";
export const dynamic = "force-dynamic";
export const metadata = { title: "Import a workbook" };
export default async function Page() { await requireMe("/import"); return <div className="fy-narrow"><ImportWizard /></div>; }
