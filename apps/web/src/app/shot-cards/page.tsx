import { ShotCardBrowser } from "@/components/shot-cards/shot-card-browser";

export default function ShotCardsPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Shot cards</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground text-pretty">
          Each card is a real Remotion component plus the metadata that says when to
          use it. Card ids, categories and recipe intent come from video-shotcraft&apos;s
          104-card taxonomy; metadata lives once in{" "}
          <code className="font-mono text-xs">
            packages/shared/src/shot-cards.json
          </code>
          , read by both the renderer and this page.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <ShotCardBrowser />
      </div>
    </div>
  );
}
