"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3, Copy, Download, ExternalLink, LayoutDashboard, Mail, MapPin, Menu, MoreHorizontal, Pencil, Plus, QrCode, Search, Settings2, ShieldCheck, Sparkles, Ticket, Users, UserRoundCheck, UserRoundPlus, Video, X } from "lucide-react";

type EventData = { id: number; title: string; subtitle: string; description: string; category: string; organizer: string; venue: string; location: string; startAt: string; endAt: string; deadlineAt: string; capacity: number; imageUrl: string; updatedAt: string };
type Registration = { id: number; eventId: number; fullName: string; email: string; company: string; role: string; ticketCode: string; isGuest: boolean; checkedInAt: string | null; createdAt: string };
export type Workspace = { event: EventData; registrations: Registration[] };
type Section = "overview" | "event" | "registrations" | "checkin" | "guests";
type EditFields = Omit<EventData, "id" | "updatedAt">;

const dateText = (value: string, options?: Intl.DateTimeFormatOptions) => new Date(value).toLocaleDateString("en-US", options || { month: "long", day: "numeric", year: "numeric" });
const timeText = (value: string) => new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const dateInput = (value: string) => { const d = new Date(value); const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); };
const initials = (name: string) => name.split(" ").map(x => x[0]).slice(0, 2).join("").toUpperCase();
const avatarColors = ["lavender", "peach", "mint", "blue", "rose", "sand"];

export default function WorkspaceClient({ initialData }: { initialData: Workspace }) {
  const [data, setData] = useState<Workspace>(initialData);
  const [view, setView] = useState<"organizer" | "participant">("organizer");
  const [section, setSection] = useState<Section>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "checked" | "pending">("all");
  const [form, setForm] = useState({ fullName: "", email: "", role: "", company: "" });
  const [guestForm, setGuestForm] = useState({ fullName: "", email: "", role: "", company: "" });
  const [myEmail, setMyEmail] = useState("");
  const [lookupEmail, setLookupEmail] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [editFields, setEditFields] = useState<EditFields>({ ...initialData.event });
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const scanLock = useRef(false);

  const event = data.event;
  const people = data.registrations;
  const attendees = people.filter(p => !p.isGuest);
  const guests = people.filter(p => p.isGuest);
  const checkedIn = people.filter(p => p.checkedInAt).length;
  const registrationOpen = new Date() <= new Date(event.deadlineAt) && people.length < event.capacity;
  const myTicket = people.find(p => p.email.toLowerCase() === myEmail.toLowerCase());
  const seatsLeft = Math.max(0, event.capacity - people.length);
  const daysLeft = Math.max(0, Math.ceil((new Date(event.deadlineAt).getTime() - Date.now()) / 86400000));
  const progress = Math.min(100, Math.round((people.length / event.capacity) * 100));

  const refresh = useCallback(async () => { try { const response = await fetch("/api/workspace", { cache: "no-store" }); if (response.ok) setData(await response.json()); } catch { /* preserve existing data */ } }, []);
  useEffect(() => { const saved = localStorage.getItem("gatherly-ticket-email"); if (saved) setMyEmail(saved); const timer = setInterval(refresh, 15000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), 5000); return () => clearTimeout(timer); }, [notice]);

  async function send(method: "POST" | "PATCH", payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const response = await fetch("/api/workspace", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Something went wrong.");
      setData({ event: result.event, registrations: result.registrations });
      return result;
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Please try again.", type: "error" });
      return null;
    } finally { setBusy(false); }
  }

  async function saveEvent(e: React.FormEvent) {
    e.preventDefault();
    const result = await send("PATCH", { ...editFields, startAt: new Date(editFields.startAt).toISOString(), endAt: new Date(editFields.endAt).toISOString(), deadlineAt: new Date(editFields.deadlineAt).toISOString() });
    if (result) { setEditOpen(false); setNotice({ text: "Event details updated everywhere.", type: "success" }); }
  }
  async function register(e: React.FormEvent) {
    e.preventDefault();
    const result = await send("POST", { action: "register", ...form });
    if (result) { setMyEmail(form.email); localStorage.setItem("gatherly-ticket-email", form.email); setForm({ fullName: "", email: "", role: "", company: "" }); setNotice({ text: "You're on the list! Your ticket is ready.", type: "success" }); }
  }
  async function addGuest(e: React.FormEvent) {
    e.preventDefault();
    const result = await send("POST", { action: "guest", ...guestForm });
    if (result) { setGuestOpen(false); setGuestForm({ fullName: "", email: "", role: "", company: "" }); setNotice({ text: "Guest added and ticket created.", type: "success" }); }
  }
  const checkIn = useCallback(async (code: string) => {
    if (scanLock.current) return;
    scanLock.current = true;
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "checkin", code }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Ticket not found.");
      setData({ event: result.event, registrations: result.registrations });
      setNotice({ text: result.message, type: "success" });
      setScanOpen(false);
      setScanCode("");
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : "Could not check in.", type: "error" }); }
    finally { setTimeout(() => { scanLock.current = false; }, 1000); }
  }, []);
  useEffect(() => {
    if (!scanOpen) return;
    let cancelled = false;
    let started = false;
    async function startCamera() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode("qr-reader");
        scannerRef.current = scanner;
        await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 210, height: 210 } }, decoded => { void checkIn(decoded); }, () => {});
        started = true;
        if (cancelled) await scanner.stop();
      } catch { if (!cancelled) setCameraError("Camera unavailable. You can still enter the ticket code below."); }
    }
    void startCamera();
    return () => { cancelled = true; if (started && scannerRef.current) void scannerRef.current.stop().catch(() => {}); scannerRef.current = null; };
  }, [scanOpen, checkIn]);

  const filteredPeople = useMemo(() => people.filter(p => (section === "guests" ? p.isGuest : !p.isGuest) && (filter === "all" || (filter === "checked" ? !!p.checkedInAt : !p.checkedInAt)) && `${p.fullName} ${p.email} ${p.company} ${p.ticketCode}`.toLowerCase().includes(search.toLowerCase())), [people, section, filter, search]);
  function navigate(next: Section) { setSection(next); setSidebarOpen(false); setSearch(""); setFilter("all"); if (next === "checkin") setScanOpen(true); }
  function openEditor() { setEditFields({ title: event.title, subtitle: event.subtitle, description: event.description, category: event.category, organizer: event.organizer, venue: event.venue, location: event.location, imageUrl: event.imageUrl, capacity: event.capacity, startAt: dateInput(event.startAt), endAt: dateInput(event.endAt), deadlineAt: dateInput(event.deadlineAt) }); setEditOpen(true); }
  function changeView(next: "organizer" | "participant") { setView(next); setSidebarOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }

  return <div className="app-shell">
    {sidebarOpen && <div className="mobile-shade" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-symbol"><span /><span /><span /><span /></div><span>gatherly<span className="brand-period">.</span></span></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {view === "organizer" ? <>
          <button className={`nav-item ${section === "overview" ? "active" : ""}`} onClick={() => navigate("overview")}><LayoutDashboard size={18} /> Overview</button>
          <button className={`nav-item ${section === "event" ? "active" : ""}`} onClick={() => navigate("event")}><CalendarDays size={18} /> Event details</button>
          <button className={`nav-item ${section === "registrations" ? "active" : ""}`} onClick={() => navigate("registrations")}><Users size={18} /> Registrations <span className="nav-count">{attendees.length}</span></button>
          <button className={`nav-item ${section === "checkin" ? "active" : ""}`} onClick={() => navigate("checkin")}><QrCode size={18} /> Check-in</button>
          <button className={`nav-item ${section === "guests" ? "active" : ""}`} onClick={() => navigate("guests")}><Sparkles size={18} /> Guest list <span className="nav-count">{guests.length}</span></button>
        </> : <>
          <button className="nav-item active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><LayoutDashboard size={18} /> Discover event</button>
          <button className="nav-item" onClick={() => document.getElementById("participant-ticket")?.scrollIntoView({ behavior: "smooth" })}><Ticket size={18} /> My ticket</button>
        </>}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-help"><div className="help-icon"><Sparkles size={17} /></div><strong>Every great event<br />starts somewhere.</strong><p>Everything you need to bring people together, in one place.</p><span>Made for meaningful moments <ArrowUpRight size={13} /></span></div>
        <div className="sidebar-profile"><div className="profile-avatar">G</div><div><strong>Gatherly Workspace</strong><span>Event organizer</span></div><MoreHorizontal size={18} /></div>
      </div>
    </aside>

    <div className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={21} /></button><span className="breadcrumb">Workspace</span><ChevronRight size={15} className="breadcrumb-arrow" /><strong>{view === "participant" ? "Participant view" : section === "overview" ? "Overview" : section === "event" ? "Event details" : section === "registrations" ? "Registrations" : section === "guests" ? "Guest list" : "Check-in"}</strong></div><div className="topbar-right"><span className="live-indicator"><span /> Event live</span><div className="topbar-divider" /><button className="top-avatar" aria-label="Workspace account">G</button></div></header>
      <main className="content">
        <div className="view-row"><div className="view-tabs"><button className={view === "organizer" ? "selected" : ""} onClick={() => changeView("organizer")}>Organizer dashboard</button><button className={view === "participant" ? "selected" : ""} onClick={() => changeView("participant")}>Participant view <ArrowUpRight size={14} /></button></div><span className="preview-note"><span className="preview-dot" /> Changes sync across both views</span></div>

        {view === "organizer" ? <>
          <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> YOUR EVENT HQ</div><h1>{section === "overview" ? "Your event, at a glance." : section === "event" ? "Event details" : section === "registrations" ? "Registrations" : section === "guests" ? "Your guest list" : "Check-in center"}</h1><p>{section === "overview" ? "All the moving pieces, beautifully in one place." : section === "event" ? "One edit here updates your participant page instantly." : section === "registrations" ? "Meet the people making this event happen." : section === "guests" ? "A special place for the people you invited." : "Welcome your people, one scan at a time."}</p></div><div className="heading-actions">{section === "registrations" || section === "guests" ? <button className="button-secondary" onClick={() => { const rows = (section === "guests" ? guests : attendees); const csv = ["Name,Email,Role,Company,Ticket,Status", ...rows.map(p => [p.fullName,p.email,p.role,p.company,p.ticketCode,p.checkedInAt ? "Checked in" : "Registered"].map(v => `"${String(v).replaceAll('"', '""')}"`).join(","))].join("\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = `${section}-${event.id}.csv`; link.click(); URL.revokeObjectURL(link.href); }}><Download size={16} /> Export CSV</button> : null}<button className="button-primary" onClick={section === "guests" ? () => setGuestOpen(true) : section === "checkin" ? () => setScanOpen(true) : openEditor}>{section === "guests" ? <UserRoundPlus size={17} /> : section === "checkin" ? <QrCode size={17} /> : <Pencil size={16} />}{section === "guests" ? "Add guest" : section === "checkin" ? "Scan ticket" : "Edit event"}</button></div></div>

          {section === "overview" && <>
            <div className="stats-grid">
              <Stat icon={<Users size={20} />} tint="purple" label="Total registrations" value={String(people.length).padStart(2, "0")} detail="People on the list" badge={<><ArrowUpRight size={13} /> Live</>} />
              <Stat icon={<UserRoundCheck size={20} />} tint="green" label="Checked in" value={String(checkedIn).padStart(2, "0")} detail="Arrived at the event" badge={<>{people.length ? Math.round(checkedIn / people.length * 100) : 0}%</>} />
              <Stat icon={<Ticket size={20} />} tint="orange" label="Available spots" value={String(seatsLeft).padStart(2, "0")} detail={`Out of ${event.capacity} total spots`} />
              <Stat icon={<Clock3 size={20} />} tint="pink" label="Registration closes" value={`${daysLeft} ${daysLeft === 1 ? "day" : "days"}`} detail={dateText(event.deadlineAt, { month: "short", day: "numeric", year: "numeric" })} />
            </div>
            <div className="section-heading"><div><h2>Your upcoming event</h2><p>Here&apos;s what your participants see.</p></div><button className="text-link" onClick={() => changeView("participant")}>View participant page <ArrowUpRight size={16} /></button></div>
            <div className="event-row"><EventCard event={event} onClick={() => changeView("participant")} /><div className="event-snapshot"><div className="snapshot-title"><div className="snapshot-icon"><CalendarDays size={19} /></div><span>Event snapshot</span><MoreHorizontal size={19} /></div><div className="snapshot-details"><InfoLine icon={<CalendarDays size={17} />} label="Date & time" value={dateText(event.startAt, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} sub={`${timeText(event.startAt)} – ${timeText(event.endAt)}`} /><InfoLine icon={<MapPin size={17} />} label="Location" value={event.venue} sub={event.location} /><InfoLine icon={<Clock3 size={17} />} label="Registration deadline" value={dateText(event.deadlineAt, { month: "long", day: "numeric", year: "numeric" })} sub={`Closes at ${timeText(event.deadlineAt)}`} /></div><div className="capacity-block"><div><span>Capacity filled</span><strong>{people.length} / {event.capacity}</strong></div><div className="progress-track"><div style={{ width: `${progress}%` }} /></div><small>{seatsLeft} spots still available</small></div></div></div>
            <div className="lower-grid"><div className="panel recent-panel"><div className="panel-head"><div><h2>Recent registrations</h2><p>A look at who&apos;s joining you</p></div><button className="text-link" onClick={() => navigate("registrations")}>View all <ArrowRight size={16} /></button></div><PeopleTable people={[...attendees].reverse().slice(0, 4)} compact /></div><div className="panel guest-preview"><div className="panel-head"><div><h2>Special guests <span className="tiny-count">{guests.length}</span></h2><p>Your invited voices</p></div><button className="icon-button" onClick={() => navigate("guests")} aria-label="View guests"><ArrowUpRight size={18} /></button></div><div className="guest-mini-list">{guests.slice(0, 3).map((g, i) => <div className="guest-mini" key={g.id}><Avatar name={g.fullName} index={i + 3} /><div><strong>{g.fullName}</strong><span>{g.role || "Special guest"}</span></div><span className="guest-tag">Guest</span></div>)}</div><button className="guest-add-line" onClick={() => setGuestOpen(true)}><Plus size={16} /> Invite another guest</button></div></div>
          </>}

          {section === "event" && <div className="details-layout"><div><EventCard event={event} onClick={() => changeView("participant")} /><div className="panel detail-description"><div className="panel-head"><div><h2>About this event</h2><p>The story your attendees will read</p></div><button className="icon-button" onClick={openEditor}><Pencil size={16} /></button></div><p>{event.description}</p><div className="detail-meta"><span><Sparkles size={15} /> {event.category}</span><span><Users size={15} /> Hosted by {event.organizer}</span></div></div></div><div className="panel details-side"><h2>Everything in one place</h2><p>Update these details once and your participant page and registration flow stay in sync.</p><InfoLine icon={<CalendarDays size={18} />} label="Event starts" value={dateText(event.startAt)} sub={timeText(event.startAt)} /><InfoLine icon={<Clock3 size={18} />} label="Event ends" value={dateText(event.endAt)} sub={timeText(event.endAt)} /><InfoLine icon={<MapPin size={18} />} label="Venue" value={event.venue} sub={event.location} /><InfoLine icon={<Ticket size={18} />} label="Registration deadline" value={dateText(event.deadlineAt)} sub={`${timeText(event.deadlineAt)} · ${registrationOpen ? "Open" : "Closed"}`} /><button className="button-primary full-width" onClick={openEditor}><Pencil size={16} /> Edit event details</button></div></div>}

          {(section === "registrations" || section === "guests" || section === "checkin") && <><div className="list-summary"><div className="list-summary-icon">{section === "guests" ? <Sparkles size={22} /> : section === "checkin" ? <QrCode size={22} /> : <Users size={22} />}</div><div><strong>{section === "guests" ? `${guests.length} special guests` : section === "checkin" ? `${checkedIn} people checked in` : `${attendees.length} registered participants`}</strong><span>{section === "guests" ? "Your invited speakers, collaborators, and VIPs" : section === "checkin" ? "Scan a QR ticket or search the list below" : `${seatsLeft} spots remaining · Registration ${registrationOpen ? "open" : "closed"}`}</span></div><button onClick={section === "guests" ? () => setGuestOpen(true) : section === "checkin" ? () => setScanOpen(true) : () => changeView("participant")}>{section === "guests" ? "Add a guest" : section === "checkin" ? "Open scanner" : "View registration page"} <ArrowUpRight size={15} /></button></div><div className="panel list-panel"><div className="list-toolbar"><div className="search-box"><Search size={18} /><input placeholder={section === "guests" ? "Search guests..." : "Search name, email, or ticket..."} value={search} onChange={e => setSearch(e.target.value)} /></div><div className="filter-tabs"><button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All</button><button className={filter === "checked" ? "on" : ""} onClick={() => setFilter("checked")}>Checked in</button><button className={filter === "pending" ? "on" : ""} onClick={() => setFilter("pending")}>Not arrived</button></div></div><PeopleTable people={filteredPeople} onCheckIn={code => void checkIn(code)} /></div></>}
        </> : <>
          <div className="participant-heading"><div className="eyebrow"><span className="eyebrow-line" /> THE EVENT EXPERIENCE</div><h1>Good things happen<br />when we <em>gather.</em></h1><p>Explore the event, save your spot, and keep your ticket close. It&apos;s all right here.</p></div>
          <div className="participant-layout"><div className="participant-main"><div className="participant-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(20,20,37,.82), rgba(20,20,37,.1)), url("${event.imageUrl}")` }}><span className="hero-category"><span /> {event.category}</span><div><span className="hero-overline">YOU&apos;RE INVITED</span><h2>{event.title}</h2><p>{event.subtitle}</p><div className="hero-meta"><span><CalendarDays size={17} /> {dateText(event.startAt, { month: "long", day: "numeric", year: "numeric" })}</span><span><MapPin size={17} /> {event.location}</span></div></div></div><div className="about-panel"><div className="eyebrow"><span className="eyebrow-line" /> ABOUT THE EVENT</div><h2>More than just a date<br />on your calendar.</h2><p>{event.description}</p><div className="about-divider" /><div className="about-features"><div><div className="feature-icon purple"><Sparkles size={20} /></div><strong>Fresh perspectives</strong><span>Ideas to take with you long after the day ends.</span></div><div><div className="feature-icon orange"><Users size={20} /></div><strong>Real connections</strong><span>Meet the people who make it memorable.</span></div></div></div><div className="participant-guests"><div className="section-heading"><div><h2>The people you&apos;ll meet</h2><p>Special guests joining the conversation</p></div><span className="tiny-count">{guests.length} guests</span></div><div className="speaker-grid">{guests.length ? guests.map((g,i) => <div className="speaker-card" key={g.id}><Avatar name={g.fullName} index={i+2} /><div><strong>{g.fullName}</strong><span>{g.role || "Special guest"}{g.company ? ` · ${g.company}` : ""}</span></div><ArrowUpRight size={16} /></div>) : <p>Guest announcements coming soon.</p>}</div></div></div>
            <div className="participant-side"><div className="register-card" id="participant-ticket">{myTicket ? <><div className="register-icon success"><Check size={21} /></div><span className="card-kicker">YOU&apos;RE ON THE LIST</span><h2>Your ticket is ready.</h2><p className="register-intro">See you there, {myTicket.fullName.split(" ")[0]}! Show this QR code at the door.</p><div className="ticket-qr"><QRCodeSVG value={myTicket.ticketCode} size={164} bgColor="#ffffff" fgColor="#1c2140" level="H" /><span>SCAN AT ENTRY</span></div><div className="ticket-code"><span>{myTicket.ticketCode}</span><button title="Copy ticket code" onClick={() => { void navigator.clipboard.writeText(myTicket.ticketCode); setNotice({ text: "Ticket code copied.", type: "success" }); }}><Copy size={16} /></button></div><div className="ticket-owner"><span>ATTENDEE</span><strong>{myTicket.fullName}</strong><small>{myTicket.email}</small></div><button className="button-primary full-width" onClick={() => window.print()}><Download size={16} /> Print ticket</button><button className="subtle-button" onClick={() => { setMyEmail(""); localStorage.removeItem("gatherly-ticket-email"); }}>Look up a different ticket</button></> : <><div className="register-icon"><Ticket size={22} /></div><span className="card-kicker">YOUR SPOT AWAITS</span><h2>Come be part of it.</h2><p className="register-intro">A few details and you&apos;re in. Your QR ticket will be ready instantly.</p><div className="registration-status"><span className={registrationOpen ? "status-open" : "status-closed"}><span /> {registrationOpen ? "Registration open" : "Registration closed"}</span><span>{seatsLeft} spots left</span></div><form onSubmit={register} className="form-stack"><label>Full name<input required minLength={2} placeholder="Your full name" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} disabled={!registrationOpen} /></label><label>Email address<input required type="email" placeholder="you@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} disabled={!registrationOpen} /></label><label>What do you do? <span>(optional)</span><input placeholder="e.g. Product designer" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} disabled={!registrationOpen} /></label><button className="button-primary full-width" disabled={busy || !registrationOpen} type="submit">{busy ? "Saving your spot..." : registrationOpen ? "Save my spot" : "Registration closed"} <ArrowRight size={17} /></button></form><div className="secure-note"><ShieldCheck size={15} /> Free to join. No payment required.</div><div className="lookup-block"><span>Already registered?</span><div><input type="email" placeholder="Enter your email" value={lookupEmail} onChange={e => setLookupEmail(e.target.value)} /><button onClick={() => { const match = people.find(p => p.email.toLowerCase() === lookupEmail.trim().toLowerCase()); if (match) { setMyEmail(match.email); localStorage.setItem("gatherly-ticket-email", match.email); } else setNotice({ text: "No ticket found for that email.", type: "error" }); }}>Find ticket</button></div></div></>}</div><div className="when-card"><div className="when-row"><div className="when-icon"><CalendarDays size={19} /></div><div><span>WHEN</span><strong>{dateText(event.startAt, { weekday: "long", month: "long", day: "numeric" })}</strong><small>{timeText(event.startAt)} – {timeText(event.endAt)}</small></div></div><div className="when-row"><div className="when-icon"><MapPin size={19} /></div><div><span>WHERE</span><strong>{event.venue}</strong><small>{event.location}</small></div></div><div className="when-row"><div className="when-icon"><Clock3 size={19} /></div><div><span>REGISTER BY</span><strong>{dateText(event.deadlineAt, { month: "long", day: "numeric", year: "numeric" })}</strong><small>{timeText(event.deadlineAt)}</small></div></div></div><p className="hosted-by">Thoughtfully hosted by <strong>{event.organizer}</strong></p></div></div>
        </>}
        <footer className="footer"><span>© {new Date().getFullYear()} gatherly. Made for coming together.</span><span><CircleHelp size={15} /> Need a hand? We&apos;re here to help.</span></footer>
      </main>
    </div>

    {notice && <div className={`toast ${notice.type}`}><span>{notice.type === "success" ? <CheckCircle2 size={20} /> : <CircleHelp size={20} />}</span>{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss"><X size={15} /></button></div>}

    {editOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setEditOpen(false); }}><div className="modal edit-modal" role="dialog" aria-modal="true" aria-label="Edit event"><div className="modal-top"><div><span className="modal-kicker">EVENT SETTINGS</span><h2>Make it yours.</h2><p>Update once, see the changes everywhere.</p></div><button className="modal-close" onClick={() => setEditOpen(false)}><X size={20} /></button></div><form onSubmit={saveEvent}><div className="modal-scroll"><div className="modal-section-title">The essentials</div><div className="form-stack"><label>Event name<input required value={editFields.title} onChange={e => setEditFields({ ...editFields, title: e.target.value })} /></label><label>Short tagline<input required value={editFields.subtitle} onChange={e => setEditFields({ ...editFields, subtitle: e.target.value })} /></label><label>Description<textarea required rows={4} value={editFields.description} onChange={e => setEditFields({ ...editFields, description: e.target.value })} /></label><div className="form-two"><label>Category<input required value={editFields.category} onChange={e => setEditFields({ ...editFields, category: e.target.value })} /></label><label>Hosted by<input required value={editFields.organizer} onChange={e => setEditFields({ ...editFields, organizer: e.target.value })} /></label></div></div><div className="modal-section-title">Date & place</div><div className="form-stack"><div className="form-two"><label>Starts at<input required type="datetime-local" value={editFields.startAt} onChange={e => setEditFields({ ...editFields, startAt: e.target.value })} /></label><label>Ends at<input required type="datetime-local" value={editFields.endAt} onChange={e => setEditFields({ ...editFields, endAt: e.target.value })} /></label></div><label>Registration deadline<input required type="datetime-local" value={editFields.deadlineAt} onChange={e => setEditFields({ ...editFields, deadlineAt: e.target.value })} /><small>Registration closes automatically at this time.</small></label><div className="form-two"><label>Venue<input required value={editFields.venue} onChange={e => setEditFields({ ...editFields, venue: e.target.value })} /></label><label>City / location<input required value={editFields.location} onChange={e => setEditFields({ ...editFields, location: e.target.value })} /></label></div><div className="form-two"><label>Capacity<input required type="number" min="1" value={editFields.capacity} onChange={e => setEditFields({ ...editFields, capacity: Number(e.target.value) })} /></label><label>Cover image URL<input required type="url" value={editFields.imageUrl} onChange={e => setEditFields({ ...editFields, imageUrl: e.target.value })} /></label></div></div></div><div className="modal-actions"><button type="button" className="button-secondary" onClick={() => setEditOpen(false)}>Cancel</button><button type="submit" className="button-primary" disabled={busy}>{busy ? "Saving..." : "Save changes"} <ArrowRight size={16} /></button></div></form></div></div>}
    {guestOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setGuestOpen(false); }}><div className="modal small-modal" role="dialog" aria-modal="true" aria-label="Add guest"><div className="modal-top"><div><span className="modal-kicker">SPECIAL GUESTS</span><h2>Invite someone in.</h2><p>Add a guest and create their QR ticket.</p></div><button className="modal-close" onClick={() => setGuestOpen(false)}><X size={20} /></button></div><form onSubmit={addGuest}><div className="modal-scroll form-stack"><label>Full name<input required minLength={2} placeholder="Guest's full name" value={guestForm.fullName} onChange={e => setGuestForm({ ...guestForm, fullName: e.target.value })} /></label><label>Email address<input required type="email" placeholder="guest@example.com" value={guestForm.email} onChange={e => setGuestForm({ ...guestForm, email: e.target.value })} /></label><label>Role / title<input placeholder="e.g. Keynote speaker" value={guestForm.role} onChange={e => setGuestForm({ ...guestForm, role: e.target.value })} /></label><label>Company<input placeholder="e.g. Creative Studio" value={guestForm.company} onChange={e => setGuestForm({ ...guestForm, company: e.target.value })} /></label></div><div className="modal-actions"><button type="button" className="button-secondary" onClick={() => setGuestOpen(false)}>Cancel</button><button type="submit" className="button-primary" disabled={busy}>{busy ? "Adding..." : "Add guest"} <Plus size={16} /></button></div></form></div></div>}
    {scanOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setScanOpen(false); }}><div className="modal small-modal scan-modal" role="dialog" aria-modal="true" aria-label="Scan ticket"><div className="modal-top"><div><span className="modal-kicker">DOOR CHECK-IN</span><h2>Scan a ticket.</h2><p>Point your camera at a guest&apos;s QR code.</p></div><button className="modal-close" onClick={() => setScanOpen(false)}><X size={20} /></button></div><div className="modal-scroll"><div className="scanner-frame"><div id="qr-reader" /><div className="scanner-placeholder"><QrCode size={38} /><span>Camera scanner</span></div></div>{cameraError && <div className="camera-error"><Video size={15} /> {cameraError}</div>}<div className="scan-divider"><span>OR ENTER CODE MANUALLY</span></div><label className="scan-label">Ticket code<div className="scan-input-row"><input placeholder="GTH-XXXXXXXX" value={scanCode} onChange={e => setScanCode(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void checkIn(scanCode); }} /><button className="button-primary" onClick={() => void checkIn(scanCode)} disabled={!scanCode.trim() || busy}>Check in <ArrowRight size={16} /></button></div></label></div></div></div>}
  </div>;
}

function Avatar({ name, index }: { name: string; index: number }) { return <div className={`avatar avatar-${avatarColors[index % avatarColors.length]}`}>{initials(name)}</div>; }
function Stat({ icon, tint, label, value, detail, badge }: { icon: React.ReactNode; tint: string; label: string; value: string; detail: string; badge?: React.ReactNode }) { return <div className="stat-card"><div className="stat-top"><div className={`stat-icon ${tint}`}>{icon}</div>{badge && <span className="stat-badge">{badge}</span>}</div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-detail">{detail}</span></div>; }
function InfoLine({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) { return <div className="info-line"><div className="info-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div></div>; }
function EventCard({ event, onClick }: { event: EventData; onClick: () => void }) { return <button className="event-card" onClick={onClick} style={{ backgroundImage: `linear-gradient(90deg, rgba(17,21,42,.86) 0%, rgba(17,21,42,.37) 68%, rgba(17,21,42,.16) 100%), url("${event.imageUrl}")` }}><span className="event-card-category"><span /> {event.category.toUpperCase()}</span><div className="event-card-content"><span>UPCOMING EVENT</span><h3>{event.title}</h3><p>{event.subtitle}</p><div className="event-card-meta"><span><CalendarDays size={16} /> {dateText(event.startAt, { month: "short", day: "numeric", year: "numeric" })}</span><span><MapPin size={16} /> {event.location}</span></div></div><span className="event-card-arrow"><ArrowUpRight size={20} /></span></button>; }
function PeopleTable({ people, compact = false, onCheckIn }: { people: Registration[]; compact?: boolean; onCheckIn?: (code: string) => void }) { return <div className="table-wrap"><table className="people-table"><thead><tr><th>NAME</th>{!compact && <th>ROLE / COMPANY</th>}<th>{compact ? "TICKET" : "TICKET CODE"}</th><th>STATUS</th>{onCheckIn && <th></th>}</tr></thead><tbody>{people.length ? people.map((person, i) => <tr key={person.id}><td><div className="person-cell"><Avatar name={person.fullName} index={person.id + i} /><div><strong>{person.fullName}</strong><span>{person.email}</span></div></div></td>{!compact && <td><div className="role-cell"><strong>{person.role || "—"}</strong><span>{person.company || "—"}</span></div></td>}<td><span className="ticket-table">{person.ticketCode}</span></td><td><span className={`status-pill ${person.checkedInAt ? "checked" : "registered"}`}><span />{person.checkedInAt ? "Checked in" : "Registered"}</span></td>{onCheckIn && <td>{!person.checkedInAt && <button className="row-action" onClick={() => onCheckIn(person.ticketCode)}>Check in <ArrowRight size={14} /></button>}</td>}</tr>) : <tr><td colSpan={onCheckIn ? 5 : compact ? 3 : 4} className="empty-table">No people found here yet.</td></tr>}</tbody></table></div>; }
