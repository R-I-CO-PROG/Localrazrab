import { Suspense } from "react";
import { ProposalsHub } from "@/components/proposals/proposals-hub";

export default function ProposalsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-8">
          <div className="h-20 animate-pulse rounded-xl bg-muted" />
          <div className="h-12 w-72 animate-pulse rounded-xl bg-muted" />
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
        </div>
      }
    >
      <ProposalsHub />
    </Suspense>
  );
}
