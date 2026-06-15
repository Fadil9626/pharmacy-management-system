import { Component } from "react";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";

// Detect a failed dynamic import (chunk load) vs. a generic runtime error —
// they get different copy and recovery actions.
const isChunkError = (e) => {
  const m = (e && (e.message || String(e))) || "";
  return (
    (e && e.name === "ChunkLoadError") ||
    /loading chunk [\d]+ failed/i.test(m) ||
    /dynamically imported module/i.test(m) ||
    /importing a module script failed/i.test(m) ||
    /failed to fetch dynamically imported/i.test(m)
  );
};

// Catches render/runtime errors and failed lazy chunks below it, showing a
// graceful fallback instead of a white screen. Mount one inside the Layout
// (keyed by route, so the sidebar survives and navigating elsewhere recovers
// without a reload) and one globally as a last resort.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info);
  }

  reset = () => this.setState({ error: null });
  reload = () => window.location.reload();

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunk = isChunkError(error);
    const body = (
      <div className="card max-w-md p-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300">
          <AlertTriangle className="h-7 w-7" />
        </span>
        <h2 className="mt-5 font-display text-xl font-semibold text-sage-900 dark:text-sage-50">
          {chunk ? "Couldn’t load this section" : "Something went wrong"}
        </h2>
        <p className="mt-2 text-sm text-sage-500 dark:text-sage-400">
          {chunk
            ? "This is usually a brief connection drop or a just-released update. Reloading will fix it — you won’t lose saved work."
            : "An unexpected error occurred on this screen. The rest of the app is still running — pick another section from the menu, or try again."}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          {!chunk && (
            <button onClick={this.reset} className="btn-outline">
              <RotateCcw className="h-4 w-4" /> Try again
            </button>
          )}
          <button onClick={this.reload} className="btn-primary">
            <RefreshCw className="h-4 w-4" /> Reload app
          </button>
        </div>
      </div>
    );

    if (this.props.fullScreen)
      return <div className="flex min-h-screen items-center justify-center bg-sage-50 p-6 dark:bg-sage-950">{body}</div>;
    return <div className="flex min-h-[60vh] items-center justify-center p-6">{body}</div>;
  }
}
