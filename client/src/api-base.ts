// "/api" in the HR app; "/fleet/api" in the public company-car page (built with base "/fleet/").
export const apiBase = `${import.meta.env.BASE_URL}api`;
/** Rewrites an "/api/..." path to this build's API prefix. */
export const apiPath = (path: string) => path.startsWith("/api/") ? apiBase + path.slice(4) : path;
