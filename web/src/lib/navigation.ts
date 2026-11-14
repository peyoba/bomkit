export type AppRoute = "home" | "excel" | "review" | "resistance";

const hashes: Record<AppRoute, string> = {
  home: "",
  excel: "#bom/excel",
  review: "#bom/review",
  resistance: "#resistance",
};

/** Hash URLs work on Vercel, Cloudflare and static hosting without server rewrites. */
export function routeFromHash(hash: string): AppRoute {
  return (Object.keys(hashes) as AppRoute[]).find(route => hashes[route] === hash) ?? "home";
}

export function routeURL(route: AppRoute): string {
  return `${window.location.pathname}${window.location.search}${hashes[route]}`;
}
