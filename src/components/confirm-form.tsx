"use client";

/** A form that asks before submitting when `needsConfirm()` says so. */
export function ConfirmForm({
  action,
  className,
  children,
  message,
  dateField,
  existingDays,
  windowStart,
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: React.ReactNode;
  message: (day: string) => string;
  dateField: string;
  existingDays: string[];
  windowStart: string;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        const day = String(new FormData(e.currentTarget).get(dateField) ?? "");
        // Ask when that day already has data, or is older than what we can see here.
        const risky = existingDays.includes(day) || (day !== "" && day < windowStart);
        if (risky && !window.confirm(message(day))) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
