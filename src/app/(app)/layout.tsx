import { BottomNav } from "@/components/bottom-nav";
import { TzSync } from "@/components/tz-sync";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <TzSync />
      <div className="pb-24">{children}</div>
      <BottomNav />
    </>
  );
}
