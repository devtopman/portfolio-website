import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { config } from "../config";
import { loadContent, applyContent, type SiteContent } from "../content";
import "./Admin.css";

type Project = SiteContent["projects"][number];
type Experience = SiteContent["experiences"][number];
type Tab = "projects" | "profile" | "experience" | "skills";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const commas = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  area?: boolean;
  hint?: string;
}) {
  return (
    <label className="adm-field">
      <span>{props.label}</span>
      {props.area ? (
        <textarea rows={4} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
      ) : (
        <input value={props.value} onChange={(e) => props.onChange(e.target.value)} />
      )}
      {props.hint && <small>{props.hint}</small>}
    </label>
  );
}

// Resize to max 1400px and re-encode as JPEG so uploads stay small.
function resizeImage(file: File): Promise<{ type: string; data: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/jpeg", 0.85);
      resolve({ type: "image/jpeg", data: url.split(",")[1] });
    };
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = URL.createObjectURL(file);
  });
}

const Admin = () => {
  const [password, setPassword] = useState(() => sessionStorage.getItem("adm-pw") || "");
  const [authed, setAuthed] = useState(false);
  const [draft, setDraft] = useState<SiteContent>(() => clone(config));
  const [tab, setTab] = useState<Tab>("projects");
  const [sel, setSel] = useState(0);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const headers = () => ({ "Content-Type": "application/json", "x-admin-password": password });

  useEffect(() => {
    // pick up the latest saved content
    loadContent().then(() => setDraft(clone(config)));
  }, []);

  // Verify the password with a harmless authenticated call.
  const login = async () => {
    setStatus("");
    const res = await fetch("/api/upload", { method: "DELETE", headers: headers(), body: "{}" });
    if (res.ok) {
      sessionStorage.setItem("adm-pw", password);
      setAuthed(true);
    } else {
      setStatus("Wrong password");
    }
  };

  const save = async () => {
    setBusy(true);
    setStatus("Saving…");
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(draft),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) applyContent(clone(draft)); // update the live site content too, no reload needed
      setStatus(res.ok ? "Saved ✓ — live on the site" : `Error: ${j.error || res.status}`);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    }
    setBusy(false);
  };

  const set = (fn: (d: SiteContent) => void) =>
    setDraft((prev) => {
      const next = clone(prev);
      fn(next);
      return next;
    });

  // ---------- projects ----------
  const projects = draft.projects;
  const p: Project | undefined = projects[sel];

  const addProject = () => {
    set((d) => {
      const id = Math.max(0, ...d.projects.map((x) => x.id)) + 1;
      d.projects.push({
        id, title: "New project", category: "", technologies: "",
        image: "", description: "", link: "",
      });
    });
    setSel(projects.length);
  };
  const deleteProject = async () => {
    if (!p || !window.confirm(`Delete "${p.title}"? This cannot be undone after you save.`)) return;
    if (p.image) {
      fetch("/api/upload", { method: "DELETE", headers: headers(), body: JSON.stringify({ url: p.image }) });
    }
    set((d) => { d.projects.splice(sel, 1); });
    setSel(Math.max(0, sel - 1));
  };
  const moveProject = (dir: -1 | 1) => {
    const to = sel + dir;
    if (to < 0 || to >= projects.length) return;
    set((d) => { [d.projects[sel], d.projects[to]] = [d.projects[to], d.projects[sel]]; });
    setSel(to);
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setStatus("Uploading image…");
    try {
      const img = await resizeImage(file);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ name: file.name, ...img }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || res.status);
      set((d) => { d.projects[sel].image = j.url; });
      setStatus("Image uploaded — remember to Save");
    } catch (e: any) {
      setStatus(`Upload failed: ${e.message}`);
    }
  };

  // ---------- resume (PDF) ----------
  const uploadResume = async (file?: File) => {
    if (!file) return;
    if (file.type !== "application/pdf") return setStatus("Resume must be a PDF file");
    if (file.size > 3 * 1024 * 1024) return setStatus("PDF is too large — keep it under 3 MB");
    setStatus("Uploading resume…");
    try {
      const data: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1]);
        r.onerror = () => reject(new Error("Could not read file"));
        r.readAsDataURL(file);
      });
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ name: "resume", type: "application/pdf", data }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || res.status);
      const old = draft.resume?.url;
      if (old) fetch("/api/upload", { method: "DELETE", headers: headers(), body: JSON.stringify({ url: old }) });
      set((d) => { d.resume = { url: j.url }; });
      setStatus("Resume uploaded — remember to Save");
    } catch (err: any) {
      setStatus(`Upload failed: ${err.message}`);
    }
  };
  const removeResume = () => {
    const old = draft.resume?.url;
    if (!old || !window.confirm("Remove the resume? The Resume button will stop downloading anything.")) return;
    fetch("/api/upload", { method: "DELETE", headers: headers(), body: JSON.stringify({ url: old }) });
    set((d) => { d.resume = { url: "" }; });
  };

  // ---------- experience ----------
  const exps = draft.experiences;
  const [esel, setEsel] = useState(0);
  const e: Experience | undefined = exps[esel];

  if (!authed) {
    return (
      <div className="adm-login">
        <h1>Admin</h1>
        <input
          type="password"
          placeholder="Password"
          value={password}
          autoFocus
          onChange={(ev) => setPassword(ev.target.value)}
          onKeyDown={(ev) => ev.key === "Enter" && login()}
        />
        <button onClick={login}>Log in</button>
        {status && <p className="adm-err">{status}</p>}
        <Link to="/">← Back to site</Link>
      </div>
    );
  }

  return (
    <div className="adm">
      <header className="adm-bar">
        <Link to="/">← Site</Link>
        <nav>
          {(["projects", "profile", "experience", "skills"] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {{ projects: "Projects", profile: "Profile & About", experience: "Experience", skills: "Skills & Links" }[t]}
            </button>
          ))}
        </nav>
        <span className="adm-status">{status}</span>
        <button className="adm-save" disabled={busy} onClick={save}>Save changes</button>
      </header>

      <main className="adm-main">
        {tab === "projects" && (
          <div className="adm-split">
            <aside>
              {projects.map((x, i) => (
                <button key={x.id} className={i === sel ? "on" : ""} onClick={() => setSel(i)}>
                  {x.title || "(untitled)"}
                </button>
              ))}
              <button className="adm-add" onClick={addProject}>+ Add project</button>
            </aside>
            {p ? (
              <section>
                <div className="adm-row">
                  <button onClick={() => moveProject(-1)}>↑ Move up</button>
                  <button onClick={() => moveProject(1)}>↓ Move down</button>
                  <button className="adm-del" onClick={deleteProject}>Delete project</button>
                </div>
                <p className="adm-note">The first 5 projects appear on the home page; all appear on /myworks.</p>
                <Field label="Title" value={p.title} onChange={(v) => set((d) => { d.projects[sel].title = v; })} />
                <Field label="Category" value={p.category} onChange={(v) => set((d) => { d.projects[sel].category = v; })} />
                <Field label="Technologies" value={p.technologies} hint="Comma separated" onChange={(v) => set((d) => { d.projects[sel].technologies = v; })} />
                <Field label="Description" area value={p.description} onChange={(v) => set((d) => { d.projects[sel].description = v; })} />
                <Field label="Link" value={p.link} hint="https://… or /play for an internal page. Empty = no link" onChange={(v) => set((d) => { d.projects[sel].link = v; })} />
                <div className="adm-field">
                  <span>Image</span>
                  {p.image && <img className="adm-thumb" src={p.image} alt="" />}
                  <input type="file" accept="image/*" onChange={(ev) => upload(ev.target.files?.[0])} />
                  <input value={p.image} placeholder="…or paste an image URL / path" onChange={(ev) => set((d) => { d.projects[sel].image = ev.target.value; })} />
                </div>
              </section>
            ) : <section><p>No projects. Add one.</p></section>}
          </div>
        )}

        {tab === "profile" && (
          <section className="adm-one">
            <Field label="Short name" value={draft.developer.name} onChange={(v) => set((d) => { d.developer.name = v; })} />
            <Field label="Full name" value={draft.developer.fullName} onChange={(v) => set((d) => { d.developer.fullName = v; })} />
            <Field label="Title" value={draft.developer.title} onChange={(v) => set((d) => { d.developer.title = v; })} />
            <Field label="Home page role line 1" value={draft.developer.role1} onChange={(v) => set((d) => { d.developer.role1 = v; })} />
            <Field label="Home page role line 2" value={draft.developer.role2} onChange={(v) => set((d) => { d.developer.role2 = v; })} />
            <Field label="Description" area value={draft.developer.description} onChange={(v) => set((d) => { d.developer.description = v; })} />
            <Field label="Location" value={draft.social.location} onChange={(v) => set((d) => { d.social.location = v; })} />
            <div className="adm-field">
              <span>Resume / CV (PDF, max 3 MB)</span>
              {draft.resume?.url ? (
                <div className="adm-row">
                  <a href={draft.resume.url} target="_blank" rel="noopener noreferrer">View current resume</a>
                  <button className="adm-del" onClick={removeResume}>Remove</button>
                </div>
              ) : (
                <small>No resume uploaded — the Resume button on the site does nothing until you add one.</small>
              )}
              <input type="file" accept="application/pdf" onChange={(ev) => { uploadResume(ev.target.files?.[0]); ev.target.value = ""; }} />
            </div>
            <Field label="About — title" value={draft.about.title} onChange={(v) => set((d) => { d.about.title = v; })} />
            <Field label="About — text" area value={draft.about.description} onChange={(v) => set((d) => { d.about.description = v; })} />
          </section>
        )}

        {tab === "experience" && (
          <div className="adm-split">
            <aside>
              {exps.map((x, i) => (
                <button key={i} className={i === esel ? "on" : ""} onClick={() => setEsel(i)}>
                  {x.position || "(untitled)"} <small>{x.period}</small>
                </button>
              ))}
              <button
                className="adm-add"
                onClick={() => {
                  set((d) => { d.experiences.unshift({ position: "New role", company: "", period: "", location: "", description: "", responsibilities: [], technologies: [] }); });
                  setEsel(0);
                }}
              >+ Add experience</button>
            </aside>
            {e ? (
              <section>
                <div className="adm-row">
                  <button
                    className="adm-del"
                    onClick={() => {
                      if (!window.confirm(`Delete "${e.position}"?`)) return;
                      set((d) => { d.experiences.splice(esel, 1); });
                      setEsel(Math.max(0, esel - 1));
                    }}
                  >Delete entry</button>
                </div>
                <Field label="Position" value={e.position} onChange={(v) => set((d) => { d.experiences[esel].position = v; })} />
                <Field label="Company" value={e.company} onChange={(v) => set((d) => { d.experiences[esel].company = v; })} />
                <Field label="Period" value={e.period} onChange={(v) => set((d) => { d.experiences[esel].period = v; })} />
                <Field label="Location" value={e.location} onChange={(v) => set((d) => { d.experiences[esel].location = v; })} />
                <Field label="Description" area value={e.description} onChange={(v) => set((d) => { d.experiences[esel].description = v; })} />
                <Field label="Responsibilities" area hint="One per line" value={e.responsibilities.join("\n")} onChange={(v) => set((d) => { d.experiences[esel].responsibilities = lines(v); })} />
                <Field label="Technologies" hint="Comma separated" value={e.technologies.join(", ")} onChange={(v) => set((d) => { d.experiences[esel].technologies = commas(v); })} />
              </section>
            ) : <section><p>No entries.</p></section>}
          </div>
        )}

        {tab === "skills" && (
          <section className="adm-one">
            {(["develop", "design"] as const).map((k) => (
              <fieldset key={k}>
                <legend>Skill block: {k === "develop" ? "left" : "right"}</legend>
                <Field label="Title" value={draft.skills[k].title} onChange={(v) => set((d) => { d.skills[k].title = v; })} />
                <Field label="Short description" value={draft.skills[k].description} onChange={(v) => set((d) => { d.skills[k].description = v; })} />
                <Field label="Details" area value={draft.skills[k].details} onChange={(v) => set((d) => { d.skills[k].details = v; })} />
                <Field label="Tools" hint="Comma separated" value={draft.skills[k].tools.join(", ")} onChange={(v) => set((d) => { d.skills[k].tools = commas(v); })} />
              </fieldset>
            ))}
            <fieldset>
              <legend>Contact & social links</legend>
              {(["email", "github", "linkedin", "twitter", "facebook", "instagram"] as const).map((k) => (
                <Field key={k} label={k} value={draft.contact[k]} onChange={(v) => set((d) => { d.contact[k] = v; })} />
              ))}
            </fieldset>
          </section>
        )}
      </main>
    </div>
  );
};

export default Admin;
