"use client";

import { useEffect } from "react";
import { Button, Card } from "@/components/ui";

/**
 * Shown instead of a blank page when something on a page crashes while it renders.
 * The most common cause is a browser tab left open across an update: the old page tries to load files
 * that no longer exist, and a full reload fixes it.
 */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="mx-auto mt-10 max-w-xl text-center">
      <h1 className="text-lg font-semibold">This page could not be shown</h1>
      <p className="mt-2 text-sm text-muted">
        Reload the page first. If you still see this, send the line below to whoever maintains the dashboard.
      </p>
      <code className="mt-3 block break-words rounded-lg bg-surface-2 p-2.5 text-left font-mono text-xs">
        {error.message || "Unknown error"}
        {error.digest ? ` (ref ${error.digest})` : ""}
      </code>
      <div className="mt-4 flex justify-center gap-2">
        <Button variant="primary" onClick={() => window.location.reload()}>
          Reload page
        </Button>
        <Button onClick={reset}>Try again</Button>
      </div>
    </Card>
  );
}
