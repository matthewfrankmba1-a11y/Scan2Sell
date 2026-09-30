import { settings } from "./store.js";

const headers = () => ({ "Content-Type": "application/json", "x-access-code": settings.accessCode });

export async function api(path, body) {
  let res;
  try {
    res = await fetch(`/api/${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  } catch {
    throw new Error("Can't reach the server. Are you offline?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
  return data;
}

let healthPromise = null;

/** Which price sources the server is configured for. Cached; `refresh` re-checks. */
export function getHealth({ refresh = false } = {}) {
  if (!healthPromise || refresh) {
    healthPromise = fetch("/api/health", { headers: headers() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Server error ${r.status}`))))
      .catch((err) => {
        healthPromise = null;
        throw err;
      });
  }
  return healthPromise;
}
