"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * There is deliberately NO bucket-wide delete button here.
 *
 * Every destructive path in this app is prefix-scoped
 * (`types/keys.job_prefixes()`), and no bucket-wide delete exists in the codebase
 * at all — see AGENTS.md §3. Shipping an "Empty bucket" affordance, even a
 * demo-only one, would advertise a capability this app refuses to have. So this
 * panel explains the scoping and routes to the real, scoped action instead.
 */
export function DangerZone() {
  return (
    <Card className="border-destructive/40">
      <CardHeader className="border-b border-destructive/30 py-4 px-5">
        <CardTitle className="card-title text-destructive">Danger Zone</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Deletes are prefix-scoped, and there is no bucket-wide delete</AlertTitle>
          <AlertDescription>
            Deleting a promo purges exactly four keys —{" "}
            <code className="font-mono text-xs">storyboards/&lt;id&gt;.json</code>,{" "}
            <code className="font-mono text-xs">frames/&lt;id&gt;/</code>,{" "}
            <code className="font-mono text-xs">renders/&lt;id&gt;/</code> and{" "}
            <code className="font-mono text-xs">manifests/&lt;id&gt;.json</code>.
            Shared material under <code className="font-mono text-xs">assets/</code>{" "}
            and every other promo are untouched. This app has no code path that can
            empty a bucket.
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 p-3">
          <div>
            <p className="text-sm font-medium">Delete a promo</p>
            <p className="text-xs text-muted-foreground">
              Removes its storyboard, every intermediate frame, every rendered
              variant and its manifest. There is no undo.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/promos">Go to Promos</Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
          <div>
            <p className="text-sm font-medium">Delete a single object</p>
            <p className="text-xs text-muted-foreground">
              The full-bucket explorer deletes one key at a time, with a
              confirmation per object.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/files">Go to Files</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
