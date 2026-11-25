import { BottomNav } from "@/components/bottom-nav";
import { Suspense } from "react";
import { TzSync } from "@/components/tz-sync";
import { FlashToast, ToastProvider } from "@/components/toast";
import { UndoBanner } from "@/components/undo-banner";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <ToastProvider>
      <TzSync />
      <FlashToast />
      <Suspense fallback={null}>
        <UndoBanner />
      </Suspense>
      <div className="pb-24">{children}</div>
      <BottomNav />
    </ToastProvider>
  );
}
