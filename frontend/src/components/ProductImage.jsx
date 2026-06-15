import { useState } from "react";

// Deterministic hue from the product name → stable placeholder colour.
const hueFor = (name) => {
  const s = String(name || "?");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};
const initials = (name) => {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

// Product thumbnail: the uploaded photo when present, otherwise an auto-generated
// initials tile coloured from the product name. `bust` busts the image cache
// after an edit (pass something that changes, e.g. a counter).
export default function ProductImage({ product = {}, className = "h-10 w-10", rounded = "rounded-lg", bust }) {
  const [failed, setFailed] = useState(false);
  const useImg = product.has_image && !failed;
  if (useImg) {
    return (
      <img
        src={`/api/products/${product.id}/image${bust ? `?v=${bust}` : ""}`}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${className} ${rounded} shrink-0 bg-sage-100 object-cover dark:bg-sage-800`}
      />
    );
  }
  const h = hueFor(product.name);
  return (
    <div
      className={`${className} ${rounded} grid shrink-0 place-items-center font-semibold text-white`}
      style={{ background: `hsl(${h} 48% 52%)`, fontSize: "0.7em" }}
      aria-hidden="true"
    >
      {initials(product.name)}
    </div>
  );
}
