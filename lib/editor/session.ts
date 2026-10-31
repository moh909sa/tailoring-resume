import type { EditorAnalysis, EditorDocument, EditorSave, JsonObject } from "./types";

export type SaveState = "saved" | "saving" | "local" | "error" | "conflict";
export type EditorState = {
  document: EditorDocument | null;
  resume: JsonObject | null;
  confirmedSkills: string[];
  loading: boolean;
  error: string | null;
  saveState: SaveState;
  problem: string | null;
  analysis: EditorAnalysis | null;
  analysisLoading: boolean;
};
export const emptyEditorState = (): EditorState => ({document: null, resume: null, confirmedSkills: [], loading: true, error: null, saveState: "saved", problem: null, analysis: null, analysisLoading: false});
type Backup = {version: 1; document: EditorDocument; resume: JsonObject; confirmedSkills: string[]; pending: EditorSave | null; dirty: boolean};
type Dependencies = {
  read: () => Promise<string | null>;
  write: (raw: string) => Promise<unknown>;
  uuid: () => string;
  parseDocument: (value: unknown) => EditorDocument;
  load: (signal: AbortSignal) => Promise<EditorDocument>;
  save: (body: EditorSave, signal: AbortSignal) => Promise<EditorDocument>;
  analyze: (revision: number, signal: AbortSignal) => Promise<EditorAnalysis>;
  onState: (value: EditorState) => void;
};
export const editorStorageKey = (ownerId: string, id: string) => "cv-editor-v1:" + ownerId + ":" + id;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const errorMessage = (e: unknown) => e instanceof Error ? e.message : "Couldn’t sync your edits. Please try again.";
const statusOf = (e: unknown) => typeof e === "object" && e !== null && "status" in e ? e.status : null;

// One serialized writer per open document. A persisted mutation is replayed with
// its original UUID, while edits made during the request remain a separate draft.
export class CvEditorSession {
  private state = emptyEditorState();
  private dirty = false;
  private pending: EditorSave | null = null;
  private writes: Promise<unknown> = Promise.resolve();
  private saving: Promise<EditorDocument | null> | null = null;
  private reading: AbortController | null = null;
  private analyzing: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private firstEdit: number | null = null;
  private initialized = false;
  private disposed = false;
  private active = true;
  private refreshing = false;
  private retries = 0;
  constructor(private readonly deps: Dependencies) {}
  get snapshot() { return this.state; }
  private change(patch: Partial<EditorState>) {
    this.state = {...this.state, ...patch};
    if (!this.disposed) this.deps.onState(this.state);
  }
  private async persist() {
    const {document, resume, confirmedSkills} = this.state;
    if (!document || !resume) return;
    const raw = JSON.stringify({version: 1, document, resume, confirmedSkills, pending: this.pending, dirty: this.dirty} satisfies Backup);
    const write = this.writes.catch(() => undefined).then(() => this.deps.write(raw));
    this.writes = write;
    await write;
  }
  private stopTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  private schedule(delay?: number) {
    this.stopTimer();
    if (!this.active || this.disposed || !this.dirty || this.state.saveState === "conflict") return;
    const wait = delay ?? Math.max(500, Math.min(1800, 10000 - (Date.now() - (this.firstEdit ?? Date.now()))));
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, wait);
  }
  private accept(doc: EditorDocument, keepDraft: boolean) {
    const analysis = keepDraft && doc.analysis ? {...doc.analysis, status: doc.analysis.score ? "stale" as const : "unavailable" as const} : doc.analysis;
    this.change({document: doc, ...(keepDraft ? {} : {resume: doc.resume, confirmedSkills: doc.confirmed_skills}), analysis, loading: false, error: null});
  }
  async restore() {
    try {
      const raw = await this.deps.read();
      if (this.disposed) return;
      if (raw) {
        const data = JSON.parse(raw) as Backup;
        const doc = this.deps.parseDocument(data.document);
        const candidate = this.deps.parseDocument({...doc, resume: data.resume, confirmed_skills: data.confirmedSkills});
        if (data.version === 1) {
          const dirty = data.dirty === true;
          const p = data.pending;
          const pending = p && typeof p.mutation_id === "string" && Number.isSafeInteger(p.expected_revision) && same(p.resume, this.deps.parseDocument({...doc, resume:p.resume, confirmed_skills:p.confirmed_skills}).resume) ? p : null;
          this.dirty = dirty;
          this.pending = pending;
          this.accept(doc, false);
          this.change({resume: candidate.resume, confirmedSkills: candidate.confirmed_skills, saveState: this.dirty ? "local" : "saved", analysis:this.dirty && doc.analysis ? {...doc.analysis,status:doc.analysis.score ? "stale":"unavailable"} : doc.analysis});
        }
      }
    } catch {
      // A damaged cache must never become a replacement server document.
      this.dirty = false;
      this.pending = null;
    }
    this.initialized = true;
    if (!this.disposed) await this.refresh();
  }
  async refresh() {
    if (!this.initialized || this.disposed || !this.active || this.refreshing || this.saving) return;
    this.refreshing = true;
    const controller = new AbortController();
    this.reading = controller;
    try {
      const latest = await this.deps.load(controller.signal);
      if (this.disposed || controller.signal.aborted) return;
      const oldRevision = this.state.document?.revision;
      if (this.dirty && same(latest.resume, this.state.resume) && same(latest.confirmed_skills, this.state.confirmedSkills)) {
        this.dirty = false; this.pending = null;
        this.accept(latest, false);
        this.change({saveState: "saved", problem: null});
      } else if (this.dirty && oldRevision !== latest.revision && !this.pending) {
        this.accept(latest, true);
        this.change({saveState: "conflict", problem: "A newer version was saved elsewhere. Your edits are safe here. Choose which version to keep."});
      } else {
        this.accept(latest, this.dirty);
        if (!this.dirty) this.change({saveState: "saved", problem: null});
      }
      await this.persist();
    } catch (e) {
      if (this.disposed || controller.signal.aborted) return;
      this.change({loading:false, error:this.state.document ? null : errorMessage(e), ...(this.state.document ? {problem:"You’re offline or the service is unavailable. Your saved device copy is open.", saveState:this.dirty ? "local" : this.state.saveState} : {})});
    } finally {
      this.refreshing = false;
      if (this.reading === controller) this.reading = null;
    }
    if (this.dirty && this.state.saveState !== "conflict") this.schedule();
  }
  update(resume: JsonObject, skills = this.state.confirmedSkills) {
    if (!this.state.document || this.disposed || (same(resume, this.state.resume) && same(skills,this.state.confirmedSkills))) return;
    this.dirty = true;
    this.firstEdit ??= Date.now();
    this.retries = 0;
    this.analyzing?.abort();
    this.change({resume,confirmedSkills:skills, saveState:this.state.saveState === "conflict" ? "conflict" : "saving", problem:this.state.saveState === "conflict" ? this.state.problem : null, analysisLoading:false, analysis:this.state.analysis ? {...this.state.analysis,status:this.state.analysis.score ? "stale":"unavailable"} : null});
    void this.persist().catch(() => this.change({saveState:"error",problem:"Device storage is unavailable. Keep this screen open and try saving again."}));
    this.schedule();
  }
  async flush(): Promise<EditorDocument | null> {
    this.stopTimer();
    if (this.saving) { await this.saving; return this.dirty && this.state.saveState === "saving" ? this.flush() : this.state.saveState === "saved" ? this.state.document : null; }
    if (!this.dirty) return this.state.document;
    if (!this.state.document || !this.state.resume || this.disposed || this.refreshing || this.state.saveState === "conflict") return null;
    const run = this.savePending();
    this.saving = run;
    let result: EditorDocument | null;
    try { result = await run; }
    finally { this.saving = null; }
    return !result && this.dirty && this.state.saveState === "saving" && !this.disposed ? this.flush() : result;
  }
  private async savePending(): Promise<EditorDocument | null> {
    const document = this.state.document!;
    const payload = this.pending ?? {expected_revision: document.revision,mutation_id:this.deps.uuid(),resume:this.state.resume!,confirmed_skills:this.state.confirmedSkills};
    this.pending = payload;
    this.firstEdit = Date.now();
    this.change({saveState:"saving",problem:null});
    try {
      await this.persist();
      const saved = await this.deps.save(payload, new AbortController().signal);
      if (saved.revision < document.revision) {
        this.pending = null;
        this.change({saveState:"conflict",problem:"A newer version was saved elsewhere. Your edits are safe here. Choose which version to keep."});
        await this.persist();
        return null;
      }
      const stillSame = same(this.state.resume,payload.resume) && same(this.state.confirmedSkills,payload.confirmed_skills);
      this.pending = null;
      this.dirty = !stillSame;
      this.accept(saved,!stillSame);
      this.retries = 0;
      this.change({saveState:stillSame ? "saved":"saving",problem:null});
      if (stillSame) this.firstEdit = null;
      await this.persist();
      return stillSame ? saved : null;
    } catch (e) {
      if (statusOf(e) === 409) {
        this.pending = null;
        this.change({saveState:"conflict",problem:"A newer version was saved elsewhere. Your edits are safe here. Choose which version to keep."});
      } else if (statusOf(e) === 422 || statusOf(e) === 413) {
        this.pending = null;
        this.change({saveState:"error",problem:errorMessage(e)});
      } else {
        this.change({saveState:"local",problem:"Your edits are kept on this device. We couldn’t sync them yet. Try again when connected."});
        if (this.retries++ < 2) this.schedule(Math.min(30000,5000 * this.retries));
      }
      await this.persist().catch(() => this.change({saveState:"error",problem:"Couldn’t save to this device or the server. Keep this screen open and try again."}));
      return null;
    }
  }
  async resolveConflict(mode: "local" | "server") {
    if (this.saving || this.disposed) return;
    const controller = new AbortController();
    try {
      const latest = await this.deps.load(controller.signal);
      if (this.disposed) return;
      this.pending = null;
      this.dirty = mode === "local";
      this.accept(latest, mode === "local");
      this.change({saveState:mode === "local" ? "saving":"saved",problem:null});
      await this.persist();
      if (mode === "local") await this.flush();
    } catch (e) { this.change({problem:errorMessage(e)}); }
  }
  async refreshAnalysis() {
    if (this.analyzing || this.disposed) return;
    let doc = await this.flush();
    if (!doc && this.dirty && this.state.saveState === "saving") doc = await this.flush();
    if (!doc || this.disposed || this.dirty) return;
    const controller = new AbortController();
    this.analyzing = controller;
    this.change({analysisLoading:true,problem:null});
    try {
      const analysis = await this.deps.analyze(doc.revision,controller.signal);
      if (this.disposed || controller.signal.aborted) return;
      const current = this.state.document;
      if (current && !this.dirty && current.revision === analysis.revision) {
        this.change({analysis,document:{...current,analysis}});
        await this.persist();
      }
    } catch (e) { if (!controller.signal.aborted && !this.disposed) this.change({problem:errorMessage(e)}); }
    finally { if (this.analyzing === controller) { this.analyzing = null; this.change({analysisLoading:false}); } }
  }
  setActive(active: boolean) {
    this.active = active;
    if (!active) {this.stopTimer();this.reading?.abort();void this.persist().catch(() => undefined);}
    else if (this.initialized) void this.refresh();
  }
  dispose() {
    this.disposed = true;
    this.stopTimer();this.reading?.abort();this.analyzing?.abort();
    // Transport cancellation cannot roll back a server save. Keep the mutation
    // receipt and device backup so the next session can safely reconcile it.
    void this.persist().catch(() => undefined);
  }
}
