const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('sanabil-teacher-fast-path.js','utf8');
(async()=>{
 // Exercise the real shared loader, including its implicit pagination order.
 const liveSource=fs.readFileSync('sanabil-live-v12.js','utf8');
 const rowsSource=liveSource.slice(liveSource.indexOf('const rows=async('),liveSource.indexOf('let accessCached='));
 const modeSource=liveSource.match(/async function teacherViewModes\(\)\{[^\n]+/)[0];
 const records=Array.from({length:501},(_,i)=>({complex_id:'complex-'+i,mode:'general'}));
 const orders=[],ranges=[];
 const sdk={from(table){assert.equal(table,'complex_teacher_views');return{
  select(fields){assert.equal(fields,'complex_id,mode');return this},
  order(key){orders.push(key);if(key!=='complex_id')throw Error('column complex_teacher_views.'+key+' does not exist');return this},
  range(from,to){ranges.push([from,to]);return Promise.resolve({data:records.slice(from,to+1),error:null})}
 }}};
 const loadModes=new Function('sb','result','window',rowsSource+modeSource+';return teacherViewModes;')(()=>sdk,async q=>(await q).data,{});
 assert.equal((await loadModes()).length,501);
 assert.deepEqual(orders,['complex_id','complex_id']);assert.deepEqual(ranges,[[0,499],[500,999]]);

 for(const mode of ['general','fast','both']){
  const dom=new JSDOM('<main id="root"><p>old home</p></main>',{url:'https://example.test',runScripts:'outside-only'}),w=dom.window;
  w.eval(source);let renders=0;
  const root=w.document.querySelector('main');
  w.SanabilTeacherFastPath.choose('u','fast');
  await w.SanabilTeacherFastPath.mountDashboard({root,access:{roles:['teacher']},user:'u',loadCircles:async()=>({circles:[{id:'c',complex_id:'g'}]}),loadModes:async()=>[{complex_id:'g',mode}],renderGeneral:async el=>{renders++;el.innerHTML='<input value="draft">'},navigate:()=>{}});
  assert.equal(root.querySelector('.sl-fast-entry').hidden,mode==='general');
  assert.equal(root.querySelector('.sl-fast-general').hidden,mode!=='general');
  assert.equal(renders,mode==='general'?1:0,'general data loads only on opening');
  const buttons=root.querySelector('.sl-fast-switcher').children;
  assert.equal(buttons[0].hidden,mode==='general');assert.equal(buttons[1].hidden,mode==='fast');
  buttons[1].click();await Promise.resolve();
  assert.equal(root.querySelector('.sl-fast-general').hidden,mode==='fast','stored preference cannot override complex setting');
  if(mode==='both'){buttons[0].click();buttons[1].click();assert.equal(renders,1,'reopening preserves form');assert.equal(root.querySelector('input').value,'draft')}
  dom.window.close();
 }
 const dom=new JSDOM('<main><form><input value="unsaved"></form></main>',{url:'https://example.test',runScripts:'outside-only'}),w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=function(){};
 let reads=0,renders=0;
 w.rpcDirect=async()=>{reads++;return[{enabled:true,mayManage:false}]};
 for(const name of ['plansPage','testsPage','studentsPage'])w[name]=async body=>{renders++;body.textContent='ready'};
 w.button=(label,id)=>`<button type="button" data-action="${id}">${label}</button>`;
 w.action=(root,b,fn)=>b.addEventListener('click',fn);
 const live=fs.readFileSync('sanabil-live-v12.js','utf8');
 w.eval(live.slice(live.indexOf('async function mountTeacherTools('),live.indexOf('async function teacherViewModes('))+';window.mountTools=mountTeacherTools;');
 const root=w.document.querySelector('main');await w.mountTools(root,{roles:['teacher']});
 assert.equal(reads,0);assert.equal(renders,0);assert.equal(root.querySelector('details').open,false);
 await root._openTeacherTool('students');assert.equal(reads,1);assert.equal(renders,1);
 assert.equal(root.querySelector('input').value,'unsaved');assert.equal(root.querySelectorAll('form form').length,0);
 dom.window.close();console.log('PASS: three complex modes, lazy tools, fresh delegation, preserved drafts and no nested forms');
})().catch(e=>{console.error(e);process.exitCode=1});
