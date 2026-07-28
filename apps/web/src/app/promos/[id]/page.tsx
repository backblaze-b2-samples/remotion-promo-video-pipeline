import { PromoDetailView } from "@/components/promos/promo-detail-view";

export default async function PromoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PromoDetailView jobId={id} />;
}
