import { BottomNav } from "@/components/bottom-nav";
import { Suspense } from "react";
import { TzSync } from "@/components/tz-sync";
import { UndoBanner } from "@/components/undo-banner";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <TzSync />
      <Suspense fallback={null}>
        <UndoBanner />
      </Suspense>
      <div className="pb-24">{children}</div>
      <BottomNav />
    </>
  );
}
