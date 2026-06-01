import { useEffect, useState } from "react";
import { api } from "../api/client.js";

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
    </div>
  );
}
