"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient as createSupabaseClient } from "../lib/supabase/client";

type Task = { id: string; title: string; done: boolean; priority: "Low" | "Medium" | "High"; due: string; category: string };
type Note = { id: string; title: string; body: string; updated: string };
type Habit = { id: string; name: string; days: boolean[] };
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }> };

const initialTasks: Task[] = [];
const initialHabits: Habit[] = [];
const nav = [
  ["Overview", "⌂"], ["My tasks", "✓"], ["Calendar", "▦"], ["Notes", "▤"],
  ["Habits", "✳"], ["Focus", "◷"], ["AI assistant", "✧"], ["Settings", "⚙"], ["About", "ⓘ"],
] as const;
const mobilePrimary = nav.filter(([name]) => ["Overview", "My tasks", "Calendar", "Focus"].includes(name));
const mobileMore = nav.filter(([name]) => ["Habits", "Notes", "AI assistant", "Settings", "About"].includes(name));

function uid() { return Math.random().toString(36).slice(2, 10); }
function DayflowMark() { return <svg className="dayflow-mark" viewBox="0 0 40 40" aria-hidden="true"><path d="M9 11.5c0-1.38 1.12-2.5 2.5-2.5H20c8.28 0 15 6.72 15 15S28.28 39 20 39H11.5C10.12 39 9 37.88 9 36.5v-25Z" transform="translate(0 -4)" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round"/><path d="M15 17.5h6.3a6.5 6.5 0 0 1 0 13H15m-2.5-6.5h13" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function todayLabel() { return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date()); }
function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
function dueDateFor(bucket: string) { const date = new Date(); if (bucket === "Tomorrow") date.setDate(date.getDate()+1); else if (bucket === "This week") date.setDate(date.getDate()+6); return dateKey(date); }
function dueLabel(due: string) {
  if (["Today","Tomorrow","This week"].includes(due)) return due;
  const parsed = new Date(`${due}T00:00:00`);
  if (!Number.isFinite(parsed.getTime())) return due;
  const today = new Date(); today.setHours(0,0,0,0);
  const delta = Math.round((parsed.getTime()-today.getTime())/86400000);
  if (delta < 0) return "Overdue"; if (delta === 0) return "Today"; if (delta === 1) return "Tomorrow"; if (delta < 7) return "This week";
  return new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric"}).format(parsed);
}
function weekKeyFor(date: Date) { const monday = new Date(date.getFullYear(),date.getMonth(),date.getDate()); monday.setDate(monday.getDate()-((monday.getDay()+6)%7)); return dateKey(monday); }

export default function Home() {
  const [section, setSection] = useState<string>("Overview");
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [notes, setNotes] = useState<Note[]>([]);
  const [habits, setHabits] = useState<Habit[]>(initialHabits);
  const [weekKey, setWeekKey] = useState("");
  const [ready, setReady] = useState(false);
  const [taskInput, setTaskInput] = useState("");
  const [taskPriority, setTaskPriority] = useState<Task["priority"]>("Medium");
  const [taskDue, setTaskDue] = useState("Today");
  const [taskFilter, setTaskFilter] = useState("All");
  const [habitInput, setHabitInput] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [query, setQuery] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chat, setChat] = useState<{role:"user"|"assistant"; content:string}[]>([
    { role: "assistant", content: "Hey! I'm your DAYFLOW assistant. Tell me what you want to organize, plan, or figure out today." }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [focusSeconds, setFocusSeconds] = useState(25 * 60);
  const [focusRunning, setFocusRunning] = useState(false);
  const [focusMode, setFocusMode] = useState("Focus");
  const [toast, setToast] = useState("");
  const [account, setAccount] = useState<{ id: string; label: string; isGuest: boolean } | null>(null);
  const [accountMessage, setAccountMessage] = useState("");
  const [syncState, setSyncState] = useState("Saved on this device");
  const [theme, setTheme] = useState("system");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<Array<{id:string; summary?:string; htmlLink?:string; start?:{dateTime?:string;date?:string};end?:{dateTime?:string;date?:string}}>>([]);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState("");
  const [calendarTitle, setCalendarTitle] = useState("");
  const [calendarStart, setCalendarStart] = useState("");
  const [calendarEnd, setCalendarEnd] = useState("");
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installPlatform, setInstallPlatform] = useState<"ios" | "other">("other");
  const [appInstalled, setAppInstalled] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const clientRef = useRef<ReturnType<typeof createSupabaseClient> | null>(null);
  const signingOutRef = useRef(false);
  const focusDeadlineRef = useRef<number | null>(null);

  useEffect(() => {
    const agent = window.navigator.userAgent;
    const isAppleMobile = /iPhone|iPad|iPod/i.test(agent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setInstallPlatform(isAppleMobile ? "ios" : "other");
    setAppInstalled(isStandalone);
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleInstallPrompt = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    const handleInstalled = () => { setAppInstalled(true); setInstallPrompt(null); setToast("Dayflow is ready on your Home Screen."); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then(() => setOfflineReady(true))
        .catch(() => setOfflineReady(false));
    }
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (!mobileMoreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileMoreOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileMoreOpen]);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    const authError = new URLSearchParams(window.location.search).get("auth_error");
    if (authError) {
      setAccountMessage(authError === "missing_code" ? "Google sign-in was cancelled or did not return an authorization code." : "Google sign-in could not be completed. Check the provider setup and try again.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    try {
      const saved = localStorage.getItem("dayflow-stage1");
      if (saved) {
        const data = JSON.parse(saved);
        if (data.tasks) setTasks(data.tasks);
        if (data.notes) setNotes(data.notes);
        if (data.habits) setHabits(data.weekKey === weekKeyFor(new Date()) ? data.habits : data.habits.map((habit:Habit) => ({...habit,days:Array(7).fill(false)})));
        if (data.chat) setChat(data.chat);
      }
    } catch {}
    setWeekKey(weekKeyFor(new Date()));
    try {
      const prefs = JSON.parse(localStorage.getItem("dayflow-prefs") || "{}");
      if (prefs.theme) setTheme(prefs.theme);
      setSoundEnabled(Boolean(prefs.soundEnabled)); setReducedMotion(Boolean(prefs.reducedMotion)); setLargeText(Boolean(prefs.largeText)); setHighContrast(Boolean(prefs.highContrast));
    } catch {}
    try {
      const client = createSupabaseClient();
      clientRef.current = client;
      void (async () => {
        const { data: { session } } = await client.auth.getSession();
        if (session && active) {
          setAccount({ id: session.user.id, label: session.user.is_anonymous ? "Guest account" : `Google · ${session.user.email || "account"}`, isGuest: Boolean(session.user.is_anonymous) });
          const userCacheKey = `dayflow-user-${session.user.id}`;
          try {
            const cached = localStorage.getItem(userCacheKey);
            if (cached) {
              const value = JSON.parse(cached) as { tasks?:Task[]; notes?:Note[]; habits?:Habit[]; chat?:{role:"user"|"assistant";content:string}[]; weekKey?:string };
              setTasks(value.tasks || []); setNotes(value.notes || []); setHabits(value.habits || []); setChat(value.chat || []);
            } else { setTasks([]); setNotes([]); setHabits([]); }
          } catch { setTasks([]); setNotes([]); setHabits([]); }
          if (!navigator.onLine) setSyncState("Offline · using this device’s copy");
          const { data, error } = await client.from("user_workspaces").select("data").eq("user_id", session.user.id).maybeSingle();
          if (error && active) setSyncState("Offline copy · sync will resume when connected");
          if (active && data?.data && typeof data.data === "object") {
            const value = data.data as { tasks?:Task[]; notes?:Note[]; habits?:Habit[]; chat?:{role:"user"|"assistant";content:string}[]; weekKey?:string };
            if (value.tasks) setTasks(value.tasks); if (value.notes) setNotes(value.notes); if (value.habits) setHabits(value.weekKey===weekKeyFor(new Date())?value.habits:value.habits.map(habit=>({...habit,days:Array(7).fill(false)}))); if (value.chat) setChat(value.chat);
            try { localStorage.setItem(userCacheKey, JSON.stringify(value)); } catch {}
          }
        }
        const { data: listener } = client.auth.onAuthStateChange((_event, sessionNow) => {
          if (!active) return;
          if (signingOutRef.current && !sessionNow) return;
          setAccount(sessionNow ? { id: sessionNow.user.id, label: sessionNow.user.is_anonymous ? "Guest account" : `Google · ${sessionNow.user.email || "account"}`, isGuest: Boolean(sessionNow.user.is_anonymous) } : null);
        });
        unsubscribe = () => listener.subscription.unsubscribe();
        if (active) setReady(true);
      })().catch(() => { if (active) setReady(true); });
    } catch { setReady(true); }
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const payload = { tasks, notes, habits, chat, weekKey };
    if (account && account.id !== "local-guest" && clientRef.current) {
      try { localStorage.setItem(`dayflow-user-${account.id}`, JSON.stringify(payload)); } catch { setSyncState("Cloud only · device storage is full"); }
      if (!isOnline) { setSyncState("Saved offline · waiting to sync"); return; }
      setSyncState("Syncing your workspace…");
      const timer = window.setTimeout(() => {
        void clientRef.current?.from("user_workspaces").upsert({ user_id: account.id, data: payload, updated_at: new Date().toISOString() }).then(({ error }) => setSyncState(error ? "Offline copy saved · sync needs attention" : "Synced to your account"));
      }, 500);
      return () => window.clearTimeout(timer);
    }
    try { localStorage.setItem("dayflow-stage1", JSON.stringify(payload)); } catch { setSyncState("Device storage is full"); }
    setSyncState("Saved on this device");
  }, [tasks, notes, habits, chat, weekKey, ready, account, isOnline]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => {
      const current = weekKeyFor(new Date());
      if (current !== weekKey) { setWeekKey(current); setHabits(previous=>previous.map(habit=>({...habit,days:Array(7).fill(false)}))); }
    }, 60000);
    return () => window.clearInterval(timer);
  }, [ready, weekKey]);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => { root.dataset.theme = theme === "system" ? (media.matches ? "dark" : "light") : theme; };
    applyTheme();
    if (theme === "system") media.addEventListener("change", applyTheme);
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
    document.documentElement.dataset.largeText = String(largeText);
    document.documentElement.dataset.highContrast = String(highContrast);
    if (ready) localStorage.setItem("dayflow-prefs", JSON.stringify({ theme, soundEnabled, reducedMotion, largeText, highContrast }));
    return () => { if (theme === "system") media.removeEventListener("change", applyTheme); };
  }, [theme, soundEnabled, reducedMotion, largeText, highContrast, ready]);

  useEffect(() => {
    if (section !== "Calendar" || !ready) return;
    let active = true;
    void fetch("/api/calendar", { cache: "no-store" }).then(async response => ({ response, data: await response.json() })).then(({ response, data }) => {
      if (!active) return;
      setCalendarConnected(Boolean(data.connected)); setCalendarEvents(data.events || []); setCalendarMessage(data.message || (response.ok ? "" : "Reconnect Google Calendar in Settings."));
    }).catch(() => { if (active) setCalendarMessage("Calendar events could not be loaded."); });
    return () => { active = false; };
  }, [section, ready]);

  useEffect(() => {
    if (!focusRunning) return;
    const update = () => {
      const deadline = focusDeadlineRef.current;
      if (!deadline) return;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setFocusSeconds(remaining);
      if (remaining === 0) { focusDeadlineRef.current = null; setFocusRunning(false); setToast("Focus session complete. Nice work!"); }
    };
    update();
    const timer = window.setInterval(update, 250);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [focusRunning]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const completed = tasks.filter(t => t.done).length;
  const progress = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  const filteredTasks = useMemo(() => tasks.filter(t => t.title.toLowerCase().includes(query.toLowerCase()) && (taskFilter === "All" || (taskFilter === "Done" ? t.done : taskFilter === "Today" ? ["Today","Overdue"].includes(dueLabel(t.due)) && !t.done : !["Today","Overdue"].includes(dueLabel(t.due)) && !t.done))), [tasks, query, taskFilter]);
  const pending = tasks.filter(t => !t.done);

  function playSound() {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine"; oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.035, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.11);
      oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.12);
      oscillator.onended = () => { void context.close(); };
    } catch {}
  }

  async function startGuest() {
    setAccountMessage("");
    if (account && !account.isGuest) { setAccountMessage("You are already signed in with Google. Sign out before starting a separate local guest workspace."); return; }
    if (!clientRef.current) {
      setAccount({ id: "local-guest", label: "Guest · this device", isGuest: true });
      setAccountMessage("Guest mode is ready. Data stays in this browser until cloud credentials are configured.");
      return;
    }
    const { data: { session: existingSession } } = await clientRef.current.auth.getSession();
    if (existingSession) {
      setAccount({ id: existingSession.user.id, label: existingSession.user.is_anonymous ? "Guest account" : `Google · ${existingSession.user.email || "account"}`, isGuest: Boolean(existingSession.user.is_anonymous) });
      setAccountMessage("An account is already connected in this browser."); return;
    }
    setAccountMessage("Starting a secure guest session…");
    const { data, error } = await clientRef.current.auth.signInAnonymously();
    if (error) { setAccountMessage(`Guest sign-in failed: ${error.message}. Enable anonymous sign-ins in Supabase Auth settings.`); return; }
    if (data.user) setAccount({ id: data.user.id, label: "Guest account", isGuest: true });
    setAccountMessage("Guest account connected. Your workspace will sync securely.");
  }

  async function signInWithGoogle() {
    setAccountMessage("");
    if (!clientRef.current) { setAccountMessage("Add the Supabase URL and anon key to .env.local, then configure Google as an Auth provider in Supabase to enable sign-in."); return; }
    const redirectTo = `${window.location.origin}/auth/callback`;
    const options = { redirectTo, scopes: "https://www.googleapis.com/auth/calendar.events", queryParams: { access_type: "offline", prompt: "consent" } };
    let { data: { session } } = await clientRef.current.auth.getSession();
    if (!session && account?.id === "local-guest") {
      const guest = await clientRef.current.auth.signInAnonymously();
      if (guest.error) { setAccountMessage(`To keep this workspace, enable anonymous sign-ins in Supabase first. ${guest.error.message}`); return; }
      session = guest.data.session;
    }
    const result = session?.user.is_anonymous
      ? await clientRef.current.auth.linkIdentity({ provider: "google", options })
      : await clientRef.current.auth.signInWithOAuth({ provider: "google", options });
    const { error } = result;
    if (error) setAccountMessage(`Google sign-in failed: ${error.message}`);
  }

  async function signOut() {
    if (account?.isGuest && account.id !== "local-guest") { setAccountMessage("Guest accounts cannot be recovered after sign-out. Link this guest workspace to Google first to keep it."); return; }
    signingOutRef.current = true;
    await fetch("/api/calendar/disconnect", { method: "POST" }).catch(() => {});
    if (account?.id !== "local-guest") await clientRef.current?.auth.signOut();
    setCalendarConnected(false); setCalendarEvents([]);
    if (account && account.id !== "local-guest") {
      try {
        const local = JSON.parse(localStorage.getItem("dayflow-stage1") || "{}");
        setTasks(local.tasks || []); setNotes(local.notes || []); setHabits(local.habits || []);
        setChat(local.chat || [{ role: "assistant", content: "Hey! I'm your DAYFLOW assistant. Tell me what you want to organize, plan, or figure out today." }]);
      } catch { setTasks([]); setNotes([]); setHabits([]); }
    }
    setAccount(null); setAccountMessage("Signed out. Your on-device copy remains available in this browser.");
    signingOutRef.current = false;
  }

  async function createCalendarEvent() {
    if (!calendarTitle.trim() || !calendarStart || !calendarEnd) { setCalendarMessage("Add a title, start, and end time."); return; }
    setCalendarBusy(true); setCalendarMessage("");
    try {
      const response = await fetch("/api/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: calendarTitle, start: new Date(calendarStart).toISOString(), end: new Date(calendarEnd).toISOString() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create calendar event.");
      setCalendarTitle(""); setCalendarMessage("Event added to Google Calendar.");
      const refresh = await fetch("/api/calendar", { cache: "no-store" }); const latest = await refresh.json(); setCalendarEvents(latest.events || []);
    } catch (error) { setCalendarMessage(error instanceof Error ? error.message : "Could not create calendar event."); }
    finally { setCalendarBusy(false); }
  }

  async function disconnectCalendar() {
    setCalendarBusy(true);
    await fetch("/api/calendar/disconnect", { method: "POST" }).catch(() => {});
    setCalendarConnected(false); setCalendarEvents([]); setCalendarMessage("Google Calendar disconnected."); setCalendarBusy(false);
  }

  function addTask() {
    if (!taskInput.trim()) return;
    setTasks(prev => [{ id: uid(), title: taskInput.trim(), done: false, priority: taskPriority, due: dueDateFor(taskDue), category: "Personal" }, ...prev]);
    playSound();
    setTaskInput(""); setTaskPriority("Medium"); setToast("Task added");
  }
  function toggleTask(id: string) {
    setTasks(prev => prev.map(task => task.id === id ? { ...task, done: !task.done } : task));
    playSound();
  }
  function addNote() {
    if (!noteTitle.trim() && !noteBody.trim()) return;
    setNotes(prev => [{ id: uid(), title: noteTitle.trim() || "Untitled note", body: noteBody.trim(), updated: new Date().toISOString() }, ...prev]);
    playSound();
    setNoteTitle(""); setNoteBody(""); setToast("Note saved");
  }
  async function sendChat() {
    const message = chatInput.trim();
    if (!message || chatLoading) return;
    const next = [...chat, { role: "user" as const, content: message }];
    setChat(next); setChatInput(""); setChatLoading(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, messages: [...next].slice(-20) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The assistant could not respond. Try again.");
      setChat([...next, { role: "assistant", content: data.reply || data.message || "I couldn't get a response just now. Try again." }]);
    } catch (error) {
      setChat([...next, { role: "assistant", content: error instanceof Error ? error.message : "I couldn't connect just now. Check that the Dayflow server is running, then try again." }]);
    } finally { setChatLoading(false); }
  }
  function toggleHabit(id: string, day: number) {
    setHabits(prev => prev.map(h => h.id === id ? { ...h, days: h.days.map((v, i) => i === day ? !v : v) } : h));
    playSound();
  }
  function addHabit() {
    if (!habitInput.trim()) return;
    setHabits(prev => [...prev, { id: uid(), name: habitInput.trim(), days: Array(7).fill(false) }]);
    playSound();
    setHabitInput(""); setToast("Habit added");
  }
  function toggleFocus() {
    if (focusRunning) {
      focusDeadlineRef.current = null;
      setFocusRunning(false);
      return;
    }
    const duration = focusSeconds > 0 ? focusSeconds : focusMode === "Focus" ? 1500 : focusMode === "Short break" ? 300 : 900;
    setFocusSeconds(duration);
    focusDeadlineRef.current = Date.now() + duration * 1000;
    setFocusRunning(true);
  }
  async function installDayflow() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") setToast("Dayflow is installing.");
    setInstallPrompt(null);
  }
  const mins = String(Math.floor(focusSeconds / 60)).padStart(2, "0");
  const secs = String(focusSeconds % 60).padStart(2, "0");
  const offlineStatus = offlineReady ? "Offline app shell ready" : process.env.NODE_ENV !== "production" ? "Offline support activates in a production build" : isOnline ? "Connect once to prepare offline use" : "Offline setup needs a connection";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><DayflowMark /></div><span>dayflow<span className="brand-period">.</span></span></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav">
          {nav.map(([name, icon]) => <button key={name} className={`nav-item ${section === name ? "active" : ""}`} onClick={() => setSection(name)}>
            <span className="nav-icon">{icon}</span><span>{name}</span>{name === "AI assistant" && <span className="new-dot" />}
          </button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="upgrade-card"><div className="sparkle">✦</div><strong>Make a little space.</strong><p>A focused 25-minute session can turn one small step into real momentum.</p><button onClick={() => setSection("Focus")}>Start a focus session&nbsp; ↗</button></div>
          <button className="profile-row profile-button" onClick={()=>setSection("Settings")} aria-label="Open account and settings"><div className="avatar">{account?.label.startsWith("Google")?"G":"J"}</div><div><strong>{account?.label||"My workspace"}</strong><small>{account?syncState:"Guest workspace"}</small></div><span className="profile-menu">⚙</span></button>
        </div>
      </aside>

      {mobileMoreOpen && <div className="mobile-more-scrim" onClick={() => setMobileMoreOpen(false)}>
        <section className="mobile-more-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-more-title" onClick={event => event.stopPropagation()}>
          <div className="mobile-more-heading"><div><span className="eyebrow">YOUR WORKSPACE</span><h2 id="mobile-more-title">More in Dayflow</h2></div><button className="mobile-more-close" aria-label="Close menu" onClick={() => setMobileMoreOpen(false)}>×</button></div>
          <nav className="mobile-more-links" aria-label="More sections">
            {mobileMore.map(([name, icon]) => <button key={name} className={`mobile-more-link ${section === name ? "active" : ""}`} onClick={() => { setSection(name); setMobileMoreOpen(false); }}><span>{icon}</span>{name}<span className="mobile-more-arrow">›</span></button>)}
          </nav>
          <div className="mobile-more-account">{account?.label || "Guest workspace"}<span>{syncState}</span></div>
        </section>
      </div>}
      <nav className="mobile-nav" aria-label="Primary navigation">
        {mobilePrimary.map(([name, icon]) => <button key={name} className={`mobile-nav-item ${section === name ? "active" : ""}`} aria-current={section === name ? "page" : undefined} onClick={() => { setSection(name); setMobileMoreOpen(false); }}><span className="mobile-nav-icon">{icon}</span><span>{name === "Overview" ? "Today" : name === "My tasks" ? "Tasks" : name}</span></button>)}
        <button className={`mobile-nav-item ${mobileMoreOpen || mobileMore.some(([name]) => name === section) ? "active" : ""}`} aria-expanded={mobileMoreOpen} aria-haspopup="dialog" onClick={() => setMobileMoreOpen(open => !open)}><span className="mobile-nav-icon more-dots">•••</span><span>More</span></button>
      </nav>

      <section className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><div className="brand-mark"><DayflowMark /></div>dayflow<span className="brand-period">.</span></div>
          <div className="breadcrumb">Workspace <span>/</span> <strong>{section}</strong></div>
          <div className="top-actions"><div className="today-pill" aria-live="polite"><span className={isOnline?"status-dot":"offline-dot"} /> {isOnline?(account?.label||"Your personal space"):"Offline mode · saved on this device"}</div><button className="icon-button" aria-label="Open settings" title="Settings" onClick={() => setSection("Settings")}>⚙</button><div className="avatar small-avatar">{account?.label.startsWith("Google")?"G":"J"}</div></div>
        </header>

        <div className="content-wrap">
          {section === "Overview" && <>
            <div className="welcome-row"><div><div className="eyebrow">{todayLabel().toUpperCase()}</div><h1>Make today <span>count.</span></h1><p className="subheading">A little progress every day adds up. Here&apos;s your space to make it happen.</p></div><button className="primary-button" onClick={() => setSection("My tasks")}>＋ Add a task</button></div>
            <div className="stats-grid">
              <div className="stat-card"><div className="stat-top"><span>Tasks completed</span><span className="stat-icon blue">✓</span></div><div className="stat-number">{completed}<small> / {tasks.length}</small></div><div className="progress-track"><div className="progress-fill" style={{width:`${progress}%`}} /></div><div className="stat-foot">{progress}% of your tasks completed</div></div>
              <div className="stat-card"><div className="stat-top"><span>Still to do</span><span className="stat-icon purple">◷</span></div><div className="stat-number">{pending.length}</div><div className="stat-foot">One step at a time</div><div className="mini-bars"><i/><i/><i/><i/><i/><i/><i/></div></div>
              <div className="stat-card"><div className="stat-top"><span>Notes saved</span><span className="stat-icon peach">▤</span></div><div className="stat-number">{notes.length}</div><div className="stat-foot">Ideas worth keeping</div><div className="stat-link" onClick={() => setSection("Notes")}>Open notes <span>↗</span></div></div>
            </div>
            <div className="dashboard-grid">
              <div className="panel tasks-panel"><div className="panel-heading"><div><h2>Today&apos;s priorities</h2><p>Keep your attention on what matters.</p></div><button className="text-button" onClick={() => setSection("My tasks")}>View all <span>→</span></button></div>
                <div className="quick-add"><span>＋</span><input aria-label="New task" value={taskInput} onChange={e=>setTaskInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTask()} placeholder="Add a task and press Enter..." /><select aria-label="Task priority" value={taskPriority} onChange={e=>setTaskPriority(e.target.value as Task["priority"])}><option>Low</option><option>Medium</option><option>High</option></select><select aria-label="Task due date" value={taskDue} onChange={e=>setTaskDue(e.target.value)}><option>Today</option><option>Tomorrow</option><option>This week</option></select><button onClick={addTask}>Add</button></div>
                <div className="task-list">{tasks.filter(t=>["Today","Overdue"].includes(dueLabel(t.due))).slice(0,5).map(t=><div className={`task-row ${t.done?"is-done":""}`} key={t.id}><button aria-label={t.done?"Mark task incomplete":"Complete task"} className="check-circle" onClick={()=>toggleTask(t.id)}>{t.done?"✓":""}</button><span className="task-title">{t.title}</span><span className={`priority ${t.priority.toLowerCase()}`}>{t.priority}</span></div>)}
                  {tasks.length===0&&<div className="empty-state">Your list is clear. Add your first task above.</div>}</div>
              </div>
              <div className="panel assistant-card"><div className="assistant-orb">✧</div><div className="eyebrow">YOUR DAYFLOW AI</div><h2>A little help goes a long way.</h2><p>Turn a messy to-do list into a plan, break big goals into steps, or get unstuck.</p><button className="dark-button" onClick={()=>setSection("AI assistant")}>Talk to your assistant <span>↗</span></button><div className="assistant-suggestions"><span>Try asking:</span><button onClick={()=>{setChatInput("Help me plan a productive day");setSection("AI assistant")}}>Plan my day</button><button onClick={()=>{setChatInput("Help me break a big task into small steps");setSection("AI assistant")}}>Break down a task</button></div></div>
              <div className="panel week-panel"><div className="panel-heading"><div><h2>This week</h2><p>Your habit check-ins at a glance.</p></div><button className="text-button" onClick={()=>setSection("Habits")}>View habits <span>→</span></button></div><div className="week-days">{["M","T","W","T","F","S","S"].map((d,i)=>{const done=habits.some(h=>h.days[i]);return <div className="week-day" key={i}><span>{d}</span><div className={`day-dot ${done?"filled":""}`}>{done?"✓":""}</div></div>})}</div><div className="week-caption"><span className="green-dot"/> {habits.some(h=>h.days.some(Boolean))?"Your real habit check-ins are adding up.":"Add a habit and log a check-in to start your weekly rhythm."}</div></div>
              <div className="panel quote-panel"><div className="quote-mark">“</div><blockquote>You don&apos;t have to see the whole staircase. Just take the first step.</blockquote><span>— A DAILY REMINDER</span></div>
            </div>
          </>}

          {section === "My tasks" && <div className="section-page"><div className="page-heading"><div className="eyebrow">GET THINGS DONE</div><h1>Your tasks<span>.</span></h1><p>Capture it, prioritize it, and take it one step at a time.</p></div><div className="panel"><div className="quick-add large-add"><span>＋</span><input aria-label="New task" value={taskInput} onChange={e=>setTaskInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTask()} placeholder="What needs to get done?" /><select aria-label="Task priority" value={taskPriority} onChange={e=>setTaskPriority(e.target.value as Task["priority"])}><option>Low</option><option>Medium</option><option>High</option></select><select aria-label="Task due date" value={taskDue} onChange={e=>setTaskDue(e.target.value)}><option>Today</option><option>Tomorrow</option><option>This week</option></select><button onClick={addTask}>Add task</button></div><div className="filter-row"><input className="search-input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="⌕  Search tasks..." /><span>{pending.length} remaining · {completed} completed</span></div><div className="task-filters">{["All","Today","Upcoming","Done"].map(f=><button key={f} className={taskFilter===f?"selected":""} onClick={()=>setTaskFilter(f)}>{f}</button>)}</div><div className="task-list full-task-list">{filteredTasks.map(t=><div className={`task-row ${t.done?"is-done":""}`} key={t.id}><button aria-label={t.done?"Mark task incomplete":"Complete task"} className="check-circle" onClick={()=>toggleTask(t.id)}>{t.done?"✓":""}</button><span className="task-title">{t.title}</span><span className="task-category">{dueLabel(t.due)}</span><span className={`priority ${t.priority.toLowerCase()}`}>{t.priority}</span><button aria-label="Delete task" className="delete-button" onClick={()=>setTasks(p=>p.filter(x=>x.id!==t.id))}>×</button></div>)}{filteredTasks.length===0&&<div className="empty-state">No tasks here yet. Add one above to get started.</div>}</div></div></div>}

          {section === "Calendar" && <div className="section-page"><div className="page-heading"><div className="eyebrow">SEE THE BIG PICTURE</div><h1>Your calendar<span>.</span></h1><p>Your Dayflow agenda with optional Google Calendar events.</p></div><div className="panel calendar-panel"><div className="calendar-head"><div><h2>{new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"}).format(new Date())}</h2><p>Your schedule at a glance</p></div><span className="week-badge">{calendarConnected?"GOOGLE CONNECTED":"DAYFLOW AGENDA"}</span></div><div className="calendar-grid">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div className="calendar-weekday" key={d}>{d}</div>)}{Array.from({length: new Date(new Date().getFullYear(),new Date().getMonth(),1).getDay()},(_,i)=><div key={"e"+i} className="calendar-cell muted-cell"/>)}{Array.from({length:new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate()},(_,i)=><div key={i} className={`calendar-cell ${i+1===new Date().getDate()?"current-day":""}`}><span>{i+1}</span>{i+1===new Date().getDate()&&<small>Today</small>}</div>)}</div><h3 className="agenda-title">Your task agenda</h3>{["Overdue","Today","Tomorrow","This week"].map(day=>{const items=tasks.filter(t=>dueLabel(t.due)===day&&!t.done);return <div className="agenda-row" key={day}><strong>{day}</strong><span>{items.length?items.map(t=>t.title).join(" · "):"Nothing planned"}</span></div>})}<h3 className="agenda-title">Google Calendar · next 14 days</h3>{calendarConnected&&<div className="event-composer"><input aria-label="Event title" value={calendarTitle} onChange={e=>setCalendarTitle(e.target.value)} placeholder="Event title"/><label>Starts<input type="datetime-local" value={calendarStart} onChange={e=>setCalendarStart(e.target.value)}/></label><label>Ends<input type="datetime-local" value={calendarEnd} onChange={e=>setCalendarEnd(e.target.value)}/></label><button className="primary-button" disabled={calendarBusy} onClick={createCalendarEvent}>{calendarBusy?"Saving…":"Add event"}</button></div>}{calendarEvents.map(event=><div className="agenda-row" key={event.id}><strong>{event.start?.dateTime?new Date(event.start.dateTime).toLocaleString():event.start?.date}</strong><span>{event.htmlLink?<a href={event.htmlLink} target="_blank" rel="noreferrer">{event.summary||"Untitled event"} ↗</a>:event.summary||"Untitled event"}</span></div>)}{calendarMessage&&<div className="calendar-note">{calendarMessage}</div>}{!calendarConnected&&!calendarMessage&&<div className="calendar-note">Connect Google from Settings to read and create events.</div>}</div></div>}

          {section === "Notes" && <div className="section-page"><div className="page-heading"><div className="eyebrow">SAVE YOUR IDEAS</div><h1>Your notes<span>.</span></h1><p>A home for thoughts, plans, and everything you don&apos;t want to forget.</p></div><div className="panel note-composer"><input aria-label="Note title" value={noteTitle} onChange={e=>setNoteTitle(e.target.value)} placeholder="Note title..." /><textarea aria-label="Note content" value={noteBody} onChange={e=>setNoteBody(e.target.value)} placeholder="Start writing something..." /><div className="composer-bottom"><span>{account&&account.id!=="local-guest"?syncState:"Saved in this browser"}</span><button className="primary-button" onClick={addNote}>Save note</button></div></div><div className="notes-grid">{notes.map(n=><article className="note-card" key={n.id}><div className="note-card-top"><span>▤ NOTE</span><button aria-label={`Delete note ${n.title}`} onClick={()=>setNotes(p=>p.filter(x=>x.id!==n.id))}>×</button></div><h3>{n.title}</h3><p>{n.body||"No additional text."}</p><small>{Number.isNaN(Date.parse(n.updated))?n.updated:new Date(n.updated).toLocaleString()}</small></article>)}{notes.length===0&&<div className="empty-state note-empty">Your notes will show up here after you save one.</div>}</div></div>}

          {section === "Habits" && <div className="section-page"><div className="page-heading"><div className="eyebrow">BUILD YOUR ROUTINE</div><h1>Little by little<span>.</span></h1><p>Consistency isn&apos;t about being perfect. It&apos;s about showing up.</p></div><div className="panel habit-panel"><div className="habit-head"><h2>Your weekly habits</h2><span className="week-badge">TAP TO CHECK OFF</span></div><div className="quick-add habit-add"><span>＋</span><input aria-label="New habit" value={habitInput} onChange={e=>setHabitInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addHabit()} placeholder="Add a small daily habit..."/><button onClick={addHabit}>Add habit</button></div><div className="habit-days-label"><span>HABIT</span>{["M","T","W","T","F","S","S"].map((d,i)=><span key={i}>{d}</span>)}</div>{habits.map(h=><div className="habit-row" key={h.id}><strong>{h.name}</strong>{h.days.map((v,i)=><button aria-label={`${h.name}, day ${i+1}`} key={i} className={`habit-check ${v?"checked":""}`} onClick={()=>toggleHabit(h.id,i)}>{v?"✓":""}</button>)}</div>)}</div><div className="tip-card"><span>✦</span><div><strong>Make it easy to begin.</strong><p>Choose a habit small enough that you can do it even on a busy day.</p></div></div></div>}

          {section === "Focus" && <div className="section-page focus-page"><div className="page-heading"><div className="eyebrow">ONE THING AT A TIME</div><h1>Find your focus<span>.</span></h1><p>Give one thing your attention. Everything else can wait.</p></div><div className="panel focus-card"><div className="focus-tabs">{["Focus","Short break","Long break"].map((m,i)=><button key={m} className={focusMode===m?"selected":""} onClick={()=>{focusDeadlineRef.current=null;setFocusMode(m);setFocusRunning(false);setFocusSeconds(i===0?1500:i===1?300:900)}}>{m}</button>)}</div><div className="timer-ring"><div><strong>{mins}:{secs}</strong><span>{focusRunning?"YOU'RE IN THE ZONE":"READY WHEN YOU ARE"}</span></div></div><div className="focus-controls"><button className="primary-button" onClick={toggleFocus}>{focusRunning?"Pause":"Start focus"}</button><button className="reset-button" onClick={()=>{focusDeadlineRef.current=null;setFocusRunning(false);setFocusSeconds(focusMode==="Focus"?1500:focusMode==="Short break"?300:900)}}>Reset</button></div><p className="focus-hint">Tip: Pick one small task before you start your timer.</p></div></div>}

          {section === "AI assistant" && <div className="section-page ai-page"><div className="page-heading"><div className="eyebrow">A CLEARER WAY FORWARD</div><h1>Ask DAYFLOW<span>.</span></h1><p>Your thinking partner for planning, organizing, and getting unstuck.</p></div><div className="panel chat-panel"><div className="chat-top"><div className="assistant-orb small-orb">✧</div><div><strong>DAYFLOW assistant</strong><small><span className="green-dot"/> Ready to help</small></div><span className="powered-label">AI ASSISTANT</span></div><div className="chat-messages">{chat.map((m,i)=><div key={i} className={`chat-message ${m.role}`}><div className="chat-avatar">{m.role==="assistant"?"✧":"J"}</div><div className="chat-bubble">{m.content}</div></div>)}{chatLoading&&<div className="chat-message assistant"><div className="chat-avatar">✧</div><div className="chat-bubble typing">Thinking<span>.</span><span>.</span><span>.</span></div></div>}</div><div className="chat-compose"><input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendChat()} placeholder="Ask me anything about your day..." /><button onClick={sendChat} disabled={chatLoading||!chatInput.trim()}>Send ↗</button></div><div className="chat-disclaimer">AI can make mistakes. Review important information before acting on it.</div></div></div>}

          {section === "Settings" && <div className="section-page"><div className="page-heading"><div className="eyebrow">MAKE IT YOURS</div><h1>Your settings<span>.</span></h1><p>Account, appearance, sound, and accessibility.</p></div>
            <div className="panel settings-panel">
              <div className="settings-row"><div><strong>Account</strong><p>{account?.label || "Not signed in"} · {syncState}</p></div><div className="setting-actions"><button className="reset-button" onClick={startGuest}>Continue as guest</button><button className="primary-button" onClick={signInWithGoogle}>{account?.label.includes("Google") ? "Reconnect Google + Calendar" : account?.isGuest ? "Link Google + Calendar" : "Continue with Google"}</button>{account&&!account.isGuest&&<button className="reset-button" onClick={signOut}>Sign out</button>}</div></div>
              <div className="settings-row"><div><strong>Google Calendar</strong><p>Read your upcoming events and create events in your primary calendar.</p></div>{calendarConnected?<button className="reset-button" disabled={calendarBusy} onClick={disconnectCalendar}>Disconnect calendar</button>:<button className="reset-button" onClick={signInWithGoogle}>Connect Google Calendar</button>}</div>
              <div className="settings-row install-row"><div><strong>Use Dayflow on iPhone</strong><p>{appInstalled ? "Dayflow is installed on this device." : installPlatform === "ios" ? "In Safari, tap Share, then Add to Home Screen. This needs Dayflow's secure HTTPS address." : "Add Dayflow to your Home Screen for a full-screen experience."}</p><span className={`saved-pill ${offlineReady?"offline-ready":"offline-pending"}`}>{offlineStatus}</span></div>{installPrompt&&<button className="primary-button" onClick={installDayflow}>Install Dayflow</button>}</div>
              {accountMessage&&<div className="settings-message" role="status">{accountMessage}</div>}
              <div className="settings-row"><div><strong>Appearance</strong><p>Choose a light, dark, or system-matched theme.</p></div><select className="settings-select" aria-label="Color theme" value={theme} onChange={e=>setTheme(e.target.value)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></div>
              <div className="settings-row"><div><strong>Subtle sounds</strong><p>Play a soft confirmation tone when you add or save an item.</p></div><label className="setting-toggle"><input aria-label="Enable subtle sounds" type="checkbox" checked={soundEnabled} onChange={e=>setSoundEnabled(e.target.checked)}/> On</label></div>
              <div className="settings-row"><div><strong>Reduce motion</strong><p>Limit animations and movement throughout Dayflow.</p></div><label className="setting-toggle"><input aria-label="Reduce motion" type="checkbox" checked={reducedMotion} onChange={e=>setReducedMotion(e.target.checked)}/> On</label></div>
              <div className="settings-row"><div><strong>Larger text</strong><p>Increase text size across the workspace.</p></div><label className="setting-toggle"><input aria-label="Use larger text" type="checkbox" checked={largeText} onChange={e=>setLargeText(e.target.checked)}/> On</label></div>
              <div className="settings-row"><div><strong>High contrast</strong><p>Strengthen text and control contrast.</p></div><label className="setting-toggle"><input aria-label="Enable high contrast" type="checkbox" checked={highContrast} onChange={e=>setHighContrast(e.target.checked)}/> On</label></div>
              <div className="settings-row"><div><strong>Reset workspace</strong><p>Clear all tasks, notes, habits, and saved assistant messages from this workspace.</p></div><button className="reset-button" onClick={()=>{setTasks(initialTasks);setNotes([]);setHabits(initialHabits);setChat([{role:"assistant",content:"Hey! I'm your DAYFLOW assistant. Tell me what you want to organize, plan, or figure out today."}]);setToast("Workspace cleared")}}>Clear workspace</button></div>
              <div className="settings-row"><div><strong>Privacy</strong><p>Guest mode without Supabase stores information only in this browser. Signed-in workspaces use Supabase row-level security.</p></div><span className="saved-pill">{account&&account.id!=="local-guest"?"Cloud account":"Local storage"}</span></div>
            </div></div>}

          {section === "About" && <div className="section-page about-page"><div className="page-heading"><div className="eyebrow">A LITTLE ABOUT DAYFLOW</div><h1>Make space for what matters<span>.</span></h1><p>A calmer home for the small steps that make a good day.</p></div><div className="panel about-card"><div className="about-mark"><DayflowMark /></div><div className="eyebrow">YOUR PERSONAL DAY PLANNER</div><h2>Built to help you find your flow.</h2><p>Dayflow brings tasks, notes, weekly habits, and focused work into one simple workspace. Choose local guest mode or connect an account to keep your workspace available across sessions.</p><div className="about-credit"><span>Created by</span><strong>Jryan Haymon</strong></div><button className="primary-button" onClick={()=>setSection("Overview")}>Back to your day</button></div></div>}
        </div>
        <footer className="footer"><span>dayflow<span className="brand-period">.</span></span><span>Make space for what matters.</span><button className="footer-about" onClick={()=>setSection("About")}>About · Jryan Haymon</button></footer>
      </section>
      {toast&&<div className="toast">✓ &nbsp;{toast}</div>}
    </main>
  );
}
