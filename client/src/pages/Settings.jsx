import { useEffect, useState } from "react";
import { api } from "../api/client.js";

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: "", identifier: "", password: "", role: "staff" });
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "" });
  const [msg, setMsg] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  async function loadUsers() {
    const data = await api("/api/auth/users");
    setUsers(data.users);
  }

  useEffect(() => { loadUsers(); }, []);

  async function addUser(e) {
    e.preventDefault();
    setMsg("");
    try {
      await api("/api/auth/users", { method: "POST", body: form });
      setForm({ name: "", identifier: "", password: "", role: "staff" });
      setMsg("User added.");
      await loadUsers();
    } catch (err) { setMsg(err.message); }
  }

  async function removeUser(id) {
    if (!confirm("Remove this user?")) return;
    await api(`/api/auth/users/${id}`, { method: "DELETE" });
    await loadUsers();
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwMsg("");
    try {
      await api("/api/auth/password", { method: "PATCH", body: pwForm });
      setPwForm({ currentPassword: "", newPassword: "" });
      setPwMsg("Password updated.");
    } catch (err) { setPwMsg(err.message); }
  }

  return (
    <>
      <h2>Team access</h2>
      <div className="user-list">
        {users.map((u) => (
          <div className="user-row" key={u.id}>
            <div>
              <strong>{u.name || "Unnamed"}</strong>
              <span className="muted"> · {u.phoneNumber || u.email} · {u.role}</span>
            </div>
            <button className="ghost small" onClick={() => removeUser(u.id)}>Remove</button>
          </div>
        ))}
      </div>

      <h3>Add user</h3>
      <form className="settings-form" onSubmit={addUser}>
        <div className="form-grid">
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Phone or email<input value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} placeholder="+13175550000" required /></label>
          <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
          <label>Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="owner">Owner</option>
              <option value="staff">Staff</option>
            </select>
          </label>
        </div>
        {msg && <p className={msg.includes("added") ? "success" : "error"}>{msg}</p>}
        <button className="button" type="submit">Add user</button>
      </form>

      <h2>Change your password</h2>
      <form className="settings-form" onSubmit={changePassword}>
        <div className="form-grid">
          <label>Current password<input type="password" value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} required /></label>
          <label>New password<input type="password" value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} required /></label>
        </div>
        {pwMsg && <p className={pwMsg.includes("updated") ? "success" : "error"}>{pwMsg}</p>}
        <button className="button" type="submit">Update password</button>
      </form>
    </>
  );
}

const defaultAvailability = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startTime: "09:00",
  endTime: "17:00",
  slotMinutes: 60
}));

export default function Settings() {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api("/api/business/settings").then(({ business }) => {
      setForm({
        ...business,
        serviceAreasText: business.serviceAreas.join(", "),
        serviceTypesText: business.serviceTypes.map((type) => type.name).join(", "),
        availability: business.availability.length ? business.availability : defaultAvailability
      });
    });
  }, []);

  function setField(field, value) {
    setForm({ ...form, [field]: value });
  }

  function updateAvailability(index, field, value) {
    const availability = [...form.availability];
    availability[index] = { ...availability[index], [field]: value };
    setField("availability", availability);
  }

  async function submit(event) {
    event.preventDefault();
    setSaved(false);
    await api("/api/business/settings", {
      method: "PUT",
      body: {
        name: form.name,
        industryType: form.industryType,
        twilioPhoneNumber: form.twilioPhoneNumber,
        businessPhoneNumber: form.businessPhoneNumber,
        ownerNotificationPhone: form.ownerNotificationPhone,
        ownerNotificationEmail: form.ownerNotificationEmail,
        serviceAreas: form.serviceAreasText.split(",").map((item) => item.trim()).filter(Boolean),
        serviceTypes: form.serviceTypesText.split(",").map((item) => item.trim()).filter(Boolean),
        businessHours: form.businessHours,
        availability: form.availability
      }
    });
    setSaved(true);
  }

  if (!form) return <div className="page"><h1>Settings</h1><p>Loading...</p></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Business profile</p>
          <h1>Settings</h1>
        </div>
      </div>
      <form className="panel settings-form" onSubmit={submit}>
        <div className="form-grid">
          <label>Business name<input value={form.name || ""} onChange={(e) => setField("name", e.target.value)} /></label>
          <label>Industry type<input value={form.industryType || ""} onChange={(e) => setField("industryType", e.target.value)} /></label>
          <label>Twilio phone number<input value={form.twilioPhoneNumber || ""} onChange={(e) => setField("twilioPhoneNumber", e.target.value)} /></label>
          <label>Business phone<input value={form.businessPhoneNumber || ""} onChange={(e) => setField("businessPhoneNumber", e.target.value)} /></label>
          <label>Owner notification phone<input value={form.ownerNotificationPhone || ""} onChange={(e) => setField("ownerNotificationPhone", e.target.value)} /></label>
          <label>Owner notification email<input value={form.ownerNotificationEmail || ""} onChange={(e) => setField("ownerNotificationEmail", e.target.value)} /></label>
        </div>
        <label>Service areas<input value={form.serviceAreasText} onChange={(e) => setField("serviceAreasText", e.target.value)} /></label>
        <label>Service types<input value={form.serviceTypesText} onChange={(e) => setField("serviceTypesText", e.target.value)} /></label>
        <h2>Appointment availability</h2>
        <div className="availability-list">
          {form.availability.map((slot, index) => (
            <div className="availability-row" key={`${slot.dayOfWeek}-${index}`}>
              <label>Day<input type="number" min="0" max="6" value={slot.dayOfWeek} onChange={(e) => updateAvailability(index, "dayOfWeek", e.target.value)} /></label>
              <label>Start<input type="time" value={slot.startTime} onChange={(e) => updateAvailability(index, "startTime", e.target.value)} /></label>
              <label>End<input type="time" value={slot.endTime} onChange={(e) => updateAvailability(index, "endTime", e.target.value)} /></label>
              <label>Minutes<input type="number" min="30" value={slot.slotMinutes} onChange={(e) => updateAvailability(index, "slotMinutes", e.target.value)} /></label>
            </div>
          ))}
        </div>
        {saved && <p className="success">Settings saved.</p>}
        <button className="button" type="submit">Save settings</button>
      </form>
      <div className="panel" style={{ marginTop: 18 }}>
        <UserManagement />
      </div>
    </div>
  );
}
