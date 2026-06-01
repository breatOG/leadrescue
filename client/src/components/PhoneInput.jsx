// Formats a US phone number as the user types: "(317) 555-0199".
// Stores nothing special — the parent gets the raw digits via onChange,
// and the backend normalizes to E.164. No "+" required.

export function formatPhone(value) {
  const digits = (value || "").replace(/\D/g, "").slice(0, 10);
  const len = digits.length;
  if (len === 0) return "";
  if (len < 4) return `(${digits}`;
  if (len < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Returns just the digits (what we send to the server).
export function phoneDigits(value) {
  return (value || "").replace(/\D/g, "");
}

export default function PhoneInput({ value, onChange, style, ...rest }) {
  function handleChange(e) {
    const formatted = formatPhone(e.target.value);
    // Hand the parent the formatted display value; it can strip digits when submitting.
    onChange(formatted);
  }

  return (
    <input
      type="tel"
      inputMode="numeric"
      autoComplete="tel"
      placeholder="(317) 555-0199"
      value={value}
      onChange={handleChange}
      style={style}
      {...rest}
    />
  );
}
