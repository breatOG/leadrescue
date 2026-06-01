import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken } from "../api/client.js";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api("/api/auth/login", { method: "POST", body: form });
      setToken(data.token);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <Link className="brand auth-brand" to="/"><span className="brand-mark">LR</span> LeadRescue</Link>
        <h1>Contractor login</h1>
        <label>
          Phone number or email
          <input
            type="text"
            value={form.identifier}
            onChange={(e) => setForm({ ...form, identifier: e.target.value })}
            placeholder="+1 (317) 555-0000"
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="button full" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
