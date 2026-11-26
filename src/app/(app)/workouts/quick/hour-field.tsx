"use client";

import { useEffect, useState } from "react";

/** The device's local hour, so the title says Morning/Afternoon/Evening for the user, not the server. */
export function HourField() {
  const [hour, setHour] = useState("");
  useEffect(() => {
    queueMicrotask(() => setHour(String(new Date().getHours())));
  }, []);
  return <input type="hidden" name="hour" value={hour} />;
}
