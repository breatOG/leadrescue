import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken } from "../api/client.js";

export default function Login({ mode }) {
  const navigate = useNavigate();
  const isSignup = mode === "signup";
  const [form, setForm] = useState({
    email: "demo@leadrescue.local",
    password: "password123",
    name: "",
    businessName: ""
  });
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const data = await api(`/api/auth/${isSignup ? "signup" : "login"}`, { method: "POST", body: form });
      setToken(data.token);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <Link className="brand auth-brand" to="/"><span className="brand-mark">LR</span> LeadRescue</Link>
        <h1>{isSignup ? "Create contractor account" : "Contractor login"}</h1>
        {isSignup && (
          <>
            <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>Business name<input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} /></label>
          </>
        )}
        <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        {error && <p className="error">{error}</p>}
        <button className="button full" type="submit">{isSignup ? "Sign up" : "Login"}</button>
        <p className="muted">Demo account: demo@leadrescue.local / password123</p>
        <p>{isSignup ? "Already have an account?" : "Need an account?"} <Link to={isSignup ? "/login" : "/signup"}>{isSignup ? "Login" : "Create one"}</Link></p>
      </form>
    </div>
  );
}
