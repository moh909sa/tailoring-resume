const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
function load(file) {
  const source = fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
  assert.equal((compiled.diagnostics || []).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
  const module={exports:{}};
  new Function('require','module','exports',compiled.outputText)(require,module,module.exports);
  return module.exports;
}
const {CvEditorSession,editorStorageKey}=load('lib/editor/session.ts');
const pdf=load('lib/editor/pdfTypes.ts');
const copy=v=>JSON.parse(JSON.stringify(v));
const doc=(revision=1,summary='Original')=>({tailoring_id:'cv-a',revision,updated_at:'2026-10-31T12:00:00Z',resume:{summary,additional:{technicalSkills:[]}},confirmed_skills:[],job:{title:'Engineer',company:null,description:'Job description'},analysis:null});
const pause=()=>new Promise(resolve=>setImmediate(resolve));
function harness({raw=null,server=doc(),save,load:loadDocument}={}) {
  let stored=raw, remote=server, counter=0;
  const writes=[], mutations=[],states=[];
  const session=new CvEditorSession({
    read:async()=>stored,
    write:async value=>{stored=value;writes.push(JSON.parse(value));},
    uuid:()=> 'mutation-'+ ++counter,
    parseDocument:value=>{if(!value?.resume || typeof value.resume!=='object' || !Array.isArray(value.confirmed_skills)) throw Error('bad document');return value;},
    load:async signal=>loadDocument ? loadDocument(signal):copy(remote),
    save:async (body,signal)=>{
      assert.ok(writes.some(w=>w.pending?.mutation_id===body.mutation_id),'receipt persisted before PATCH');
      mutations.push(copy(body));
      if(save) return save(body,signal);
      if(body.expected_revision!==remote.revision) throw Object.assign(Error('conflict'),{status:409});
      remote={...remote,revision:remote.revision+1,resume:copy(body.resume),confirmed_skills:copy(body.confirmed_skills)};
      return copy(remote);
    },
    analyze:async revision=>({status:'current',revision,score:{overall_score:72},total_keywords:10,matched_count:7}),
    onState:value=>states.push(value),
  });
  return {session,writes,mutations,states,get stored(){return stored;},set remote(value){remote=value;},get remote(){return remote;}};
}
test('owner and document recovery keys cannot collide',()=>{
  assert.notEqual(editorStorageKey('owner-a','cv-a'),editorStorageKey('owner-b','cv-a'));
  assert.notEqual(editorStorageKey('owner-a','cv-a'),editorStorageKey('owner-a','cv-b'));
});
test('save persists mutation before transport and accepts canonical acknowledgement',async()=>{
  const h=harness();await h.session.restore();h.session.update({...h.session.snapshot.resume,summary:'My changes'});
  const saved=await h.session.flush();assert.equal(saved.revision,2);assert.equal(saved.resume.summary,'My changes');
  assert.equal(h.session.snapshot.saveState,'saved');assert.equal(JSON.parse(h.stored).pending,null);h.session.dispose();
});
test('edits during in-flight save are saved separately and flush waits for latest',async()=>{
  let release;let remote=doc();let calls=0;
  const h=harness({save:async body=>{if(++calls===1)await new Promise(r=>release=r);remote={...remote,revision:remote.revision+1,resume:copy(body.resume)};return copy(remote);}});
  await h.session.restore();h.session.update({...remote.resume,summary:'First'});
  const saving=h.session.flush();await pause();h.session.update({...remote.resume,summary:'Latest'});release();
  const result=await saving;assert.equal(result.resume.summary,'Latest');assert.equal(result.revision,3);assert.equal(h.mutations.length,2);
  assert.notEqual(h.mutations[0].mutation_id,h.mutations[1].mutation_id);h.session.dispose();
});
test('uncertain save retains exact mutation for safe retry',async()=>{
  let accepted=null,calls=0;
  const h=harness({save:async body=>{if(++calls===1){accepted=copy(body);throw Error('response lost');}assert.deepEqual(body,accepted);return doc(2,'Local');}});
  await h.session.restore();h.session.update({...h.session.snapshot.resume,summary:'Local'});assert.equal(await h.session.flush(),null);
  assert.equal(h.session.snapshot.saveState,'local');assert.equal(JSON.parse(h.stored).pending.mutation_id,accepted.mutation_id);
  assert.equal((await h.session.flush()).resume.summary,'Local');h.session.dispose();
});
test('restart with dirty copy detects newer server version without losing local edits',async()=>{
  const raw=JSON.stringify({version:1,document:doc(),resume:{summary:'Unsynced'},confirmedSkills:['TypeScript'],pending:null,dirty:true});
  const h=harness({raw,server:doc(2,'Elsewhere')});await h.session.restore();
  assert.equal(h.session.snapshot.saveState,'conflict');assert.equal(h.session.snapshot.resume.summary,'Unsynced');
  assert.equal(await h.session.flush(),null);assert.equal(h.mutations.length,0);
  await h.session.resolveConflict('local');assert.equal(h.remote.resume.summary,'Unsynced');assert.equal(h.remote.revision,3);h.session.dispose();
});
test('restored pending replay cannot replace a newer server revision',async()=>{
  const raw=JSON.stringify({version:1,document:doc(),resume:{summary:'My next edit'},confirmedSkills:[],pending:{expected_revision:1,mutation_id:'old',resume:{summary:'Old accepted edit'},confirmed_skills:[]},dirty:true});
  const h=harness({raw,server:doc(3,'Other device'),save:async()=>doc(2,'Old accepted edit')});await h.session.restore();await h.session.flush();
  assert.equal(h.session.snapshot.saveState,'conflict');assert.equal(h.session.snapshot.document.revision,3);assert.equal(h.session.snapshot.resume.summary,'My next edit');h.session.dispose();
});
test('corrupt pending backup cannot leave a loaded server document without editable content',async()=>{
  const raw=JSON.stringify({version:1,document:doc(),resume:{summary:'Unsynced'},confirmedSkills:[],pending:{expected_revision:1,mutation_id:'broken',resume:null,confirmed_skills:null},dirty:true});
  const h=harness({raw});await h.session.restore();assert.equal(h.session.snapshot.resume.summary,'Original');assert.equal(h.session.snapshot.saveState,'saved');h.session.dispose();
});
test('account disposal keeps uncertain receipt and ignores late UI updates',async()=>{
  let release;const h=harness({save:async()=>new Promise(r=>release=r)});await h.session.restore();h.session.update({summary:'Draft'});
  const saving=h.session.flush();await pause();h.session.dispose();const states=h.states.length;release(doc(2,'Draft'));await saving;
  assert.equal(h.states.length,states);assert.equal(JSON.parse(h.stored).resume.summary,'Draft');
});
test('stale scoring response cannot mark later unsaved edits current',async()=>{
  const h=harness();await h.session.restore();await h.session.refreshAnalysis();assert.equal(h.session.snapshot.analysis.status,'current');
  h.session.update({summary:'Changed after calculation'});assert.equal(h.session.snapshot.analysis.status,'stale');h.session.dispose();
});
test('PDF validation rejects mismatched revision, auth failures and non-PDF bodies',()=>{
  assert.throws(()=>pdf.pdfPath('cv',0,'A4'));
  assert.throws(()=>pdf.validatePdfResponse(200,'text/html','1',1));
  assert.throws(()=>pdf.validatePdfResponse(200,'application/pdf','2',1));
  assert.throws(()=>pdf.validatePdfResponse(401,'application/pdf','1',1));
  assert.doesNotThrow(()=>pdf.validatePdfResponse(200,'application/pdf','1',1));
});
