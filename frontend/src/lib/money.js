// Currency formatting driven by the pharmacy's settings. setCurrency() is called
// once when settings load; money()/money0() read the live symbol at render time.
let SYMBOL = "$";
let CODE = "USD";

export function setCurrency(symbol, code) {
  if (symbol) SYMBOL = symbol;
  if (code) CODE = code;
}
export function currencySymbol() {
  return SYMBOL;
}
export function currencyCode() {
  return CODE;
}

const fmt2 = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

// Currency (with symbol)
export const money = (n) => `${SYMBOL}${fmt2.format(Number(n || 0))}`;
export const money0 = (n) => `${SYMBOL}${fmt0.format(Number(n || 0))}`;
// Plain number (counts, units — no currency symbol)
export const num = (n) => fmt0.format(Number(n || 0));
