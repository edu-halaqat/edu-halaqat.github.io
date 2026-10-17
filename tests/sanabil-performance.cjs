const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(process.argv[2]||'sanabil-live-v12.js','utf8');
const helper=src.slice(src.indexOf('async function loadCircleSessionData'),src.indexOf('async function outcomesPage'));
(async()=>{
 let started=[],finish=[];
 const context={loadSessionAbsences:()=>Promise.resolve([]),rpc:(name,args)=>new Promise((resolve,reject)=>{started.push(name);finish.push(()=>resolve(name))})};
 vm.createContext(context);vm.runInContext(helper,context);
 const pending=context.loadCircleSessionData('test-circle','2026-10-17',false);
 assert.equal(started.length,3,'independent reads must start before any completes');
 finish.forEach(f=>f());const data=await pending;assert.equal(data.assignments,'get_daily_assignments');
 started=[];finish=[];const tl=context.loadCircleSessionData('test-circle','2026-10-17',true);
 assert.equal(started.length,2,'talaqqin must not fetch Quran assignments');finish.forEach(f=>f());assert.equal((await tl).assignments,null);
 context.rpc=name=>name==='get_guardian_excuses_for_circle_guarded'?Promise.reject(Error('network')):Promise.resolve(name);
 assert.equal((await context.loadCircleSessionData('test','date',false)).familyRequests.length,0);
 context.rpc=()=>Promise.reject(Error('denied'));await assert.rejects(context.loadCircleSessionData('test','date',false));
 const listeners={},w={addEventListener:(n,f)=>listeners[n]=f};
 vm.runInNewContext(fs.readFileSync(process.argv[3]||'sanabil-performance.js','utf8'),{window:w,performance,AbortController,setTimeout,clearTimeout});
 const perf=w.SanabilPerformance;assert.equal(await perf.track('test',async()=>42),42);
 await assert.rejects(perf.track('failed',async()=>{throw Error('failure')}));
 assert.equal(perf.summary().find(x=>x.name==='failed').errors,1);
 listeners['sanabil-session-changed']();assert.equal(perf.summary().length,0);
 let calls=0,last;
 await perf.runProbes([{name:'ok',run:async()=>{calls++;return 'data'}},{name:'bad',run:async()=>{calls++;throw Error('denied')}}],{onUpdate:r=>{last=r}});
 assert.equal(calls,6);assert.equal(last[0].count,3);assert.equal(last[1].errors,3);
 await perf.runProbes([{name:'timeout',run:()=>new Promise(()=>{})}],{rounds:1,timeout:5,onUpdate:r=>{last=r}});
 assert.equal(last[0].errors,1);
 const stop=new AbortController();stop.abort();await perf.runProbes([{name:'cancel',run:()=>{throw Error('must not run')}}],{signal:stop.signal});
 const start=src.indexOf('  // Each data RPC enforces'),end=src.indexOf('  const reloadDay=',start);
 let permissionDone,dataDone,writes=0,reads=[];
 const parallel={l:{circles:[{id:'circle',circle_type:'قرآن'}]},circle:'circle',date:'2026-10-17',navigator:{onLine:true},measure:(n,f)=>f(),
 rpc:()=>{reads.push('permission');return new Promise(r=>permissionDone=r)},
 loadCircleSessionData:()=>{reads.push('data');return new Promise(r=>dataDone=r)},
 localStorage:{setItem:()=>writes++},activeSessionKey:'test'};
 vm.createContext(parallel);
 const opening=vm.runInContext('(async()=>{'+src.slice(start,end)+'return readOnly})()',parallel);
 assert.deepEqual(reads,['permission','data']);dataDone({dayData:{},familyRequests:[],assignments:[],absences:[]});
 permissionDone({allowed:false});assert.equal(await opening,true);assert.equal(writes,0,'denied sessions must not become editable');
 console.log('PASS: concurrent reads, talaqqin isolation, critical error propagation, timing results and session isolation');
})().catch(e=>{console.error(e);process.exit(1)});
