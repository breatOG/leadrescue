import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// Password field with a show/hide eye toggle.
// `inputStyle` is applied to the <input>; `className` is forwarded for CSS-styled forms.
export default function PasswordInput({ inputStyle, className, ...rest }) {
  const [show, setShow] = useState(false);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        type={show ? "text" : "password"}
        className={className}
        style={{ width: "100%", boxSizing: "border-box", paddingRight: "2.6rem", ...inputStyle }}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        tabIndex={-1}
        aria-label={show ? "Hide password" : "Show password"}
        style={{
          position: "absolute",
          right: "0.6rem",
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: "#94a3b8",
          display: "flex",
          alignItems: "center"
        }}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
