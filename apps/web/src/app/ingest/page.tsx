import { IngestPanels } from "@/components/upload/ingest-panels";

// The header lives inside `IngestPanels`, not here: its onward links ("Library",
// "create a promo") have to carry the product the panels are currently filing
// material under, and that state is client-side.
export default function IngestPage() {
  return <IngestPanels />;
}
