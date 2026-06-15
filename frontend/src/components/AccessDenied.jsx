import { Link } from "react-router-dom";
import { ShieldX, LayoutDashboard, PackageX } from "lucide-react";

// Explicit "you can't see this" screen — far clearer than a silent redirect,
// which makes users think the button they clicked is broken. Used by <Guarded>
// for both role denials and modules that aren't licensed/enabled.
export default function AccessDenied({ variant = "role", role }) {
  const isModule = variant === "module";
  const Icon = isModule ? PackageX : ShieldX;
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="card max-w-md p-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300">
          <Icon className="h-7 w-7" />
        </span>
        <h2 className="mt-5 font-display text-xl font-semibold text-sage-900 dark:text-sage-50">
          {isModule ? "Not available" : "Access denied"}
        </h2>
        <p className="mt-2 text-sm text-sage-500 dark:text-sage-400">
          {isModule
            ? "This feature isn’t enabled on your current plan. Ask your administrator if you need it switched on."
            : `Your role${role ? ` (${role})` : ""} doesn’t have permission to open this page. If you think this is a mistake, contact a manager or owner.`}
        </p>
        <Link to="/" className="btn-primary mx-auto mt-6 w-fit">
          <LayoutDashboard className="h-4 w-4" /> Back to dashboard
        </Link>
      </div>
    </div>
  );
}
