import { Spinner } from "@/components/submit-button";

/** Shown instantly while the next page loads, so taps never feel dead. */
export default function Loading() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center text-emerald-400">
      <Spinner className="h-7 w-7" />
    </div>
  );
}
