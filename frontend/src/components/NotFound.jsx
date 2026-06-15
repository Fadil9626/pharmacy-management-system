import { Link } from "react-router-dom";
import { Compass, LayoutDashboard } from "lucide-react";

// Honest 404 for unknown URLs (rendered inside the app shell so the menu stays).
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="card max-w-md p-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sage-100 text-sage-500 dark:bg-sage-800 dark:text-sage-300">
          <Compass className="h-7 w-7" />
        </span>
        <h2 className="mt-5 font-display text-xl font-semibold text-sage-900 dark:text-sage-50">Page not found</h2>
        <p className="mt-2 text-sm text-sage-500 dark:text-sage-400">
          The page you’re looking for doesn’t exist or may have moved.
        </p>
        <Link to="/" className="btn-primary mx-auto mt-6 w-fit">
          <LayoutDashboard className="h-4 w-4" /> Back to dashboard
        </Link>
      </div>
    </div>
  );
}
