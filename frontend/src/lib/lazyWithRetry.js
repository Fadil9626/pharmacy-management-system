import { lazy } from "react";

// Wrap a dynamic import with a few silent retries. A brief network drop — or an
// in-flight deploy swapping chunk hashes — would otherwise throw a ChunkLoadError
// and blank the screen the instant a cashier opens a new section. We retry the
// import a couple of times with a short backoff; only if those are exhausted does
// the error propagate to the nearest <ErrorBoundary> for a graceful fallback.
export default function lazyWithRetry(factory, retries = 3, delay = 350) {
  return lazy(
    () =>
      new Promise((resolve, reject) => {
        const attempt = (left) => {
          factory()
            .then(resolve)
            .catch((err) => {
              if (left <= 0) return reject(err);
              setTimeout(() => attempt(left - 1), delay);
            });
        };
        attempt(retries);
      })
  );
}
