/** Redirect target that shows a toast on the next page (?notice=...). */
export const flash = (path: string, message: string) => `${path}${path.includes("?") ? "&" : "?"}notice=${encodeURIComponent(message)}`;
