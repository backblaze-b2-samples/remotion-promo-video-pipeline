import { IngestPanels } from "@/components/upload/ingest-panels";

export default function IngestPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Ingest</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground text-pretty">
          Two ways material enters the bucket: capture a live page with Playwright, or
          upload a file you already have. Both land under{" "}
          <code className="font-mono text-xs">assets/&lt;product&gt;/</code> so the
          scoped Library and the renderer can find them.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2 max-w-3xl">
        <IngestPanels />
      </div>
    </div>
  );
}
