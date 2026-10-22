'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const monitor=fs.readFileSync('sanabil-activity-monitor.js','utf8');
const perf=fs.readFileSync('sanabil-performance.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const sql=fs.readFileSync('supabase/migrations/20261023223000_admin_activity_reports.sql','utf8');
new vm.Script(monitor,{filename:'sanabil-activity-monitor.js'});
new vm.Script(perf,{filename:'sanabil-performance.js'});
assert(index.includes('/sanabil-activity-monitor.js?v=20261023-adminreport1'),'dashboard loads new central monitor');
assert(index.includes('/sanabil-performance.js?v=20261023-adminreport1'),'true device timings published');
for(const marker of [
 "get_platform_activity_report","p_period:period",
 "data-activity-period=\"live\"","data-activity-period=\"today\"","data-activity-period=\"week\"",
 "data-activity-csv","data-activity-json","data-activity-auto",
 "payload.byActor","payload.byView","payload.byAction","payload.recentFailures",
 "new Blob([content]","quoteCSV","box.dataset.centralMounted='1'"
])assert(monitor.includes(marker),'missing central-report feature '+marker);
for(const marker of [
 "private.has_role('admin'::public.app_role)","private.active_user()",
 "p_period = 'live'","p_period = 'today'","p_period = 'week'",
 "count(distinct actor_uid)","count(distinct session_id)",
 "percentile_disc(0.95)","count(*) filter(where succeeded=false)",
 "from public.platform_activity_events","to authenticated"
])assert(sql.includes(marker),'missing database/report guard '+marker);
assert(!/p_student_id|raw_password|password|input_value|student_name/i.test(sql),'no student or secret payloads');
assert(perf.includes("window.SanabilActivity?.record('operation','actual:'+kind,ms,true)"),
 'real action timing must flow into the same central report');
const begin=monitor.indexOf('const targetName=el=>'),end=monitor.indexOf("document.addEventListener('click'",begin);
assert(begin>=0&&end>begin,'stable selector helper present');
const helper=monitor.slice(begin,end);
const safe=(value,max=100)=>String(value||'').replace(/[^a-zA-Z0-9_:#./-]/g,'_').slice(0,max)||'unknown';
const target=new Function('safe',helper+'return targetName;')(safe);
const button=(data={},id='',classes=['sl-outcome-primary'])=>({
 dataset:data,id,classList:classes,tagName:'BUTTON',getAttribute:key=>key==='type'?'button':key==='aria-label'?'اسم شخص حساس':null
});
assert.equal(target({closest:()=>button({action:'save-student-42'})}),'save-student-#','student index normalized for grouping');
assert.equal(target({closest:()=>button({},'save-all')}),'id:save-all','stable id takes precedence over generic type');
const fallback=target({closest:()=>button({},'',['sl-outcome-primary'])});
assert.equal(fallback,'class:sl-outcome-primary');
assert(!fallback.includes('حساس'),'never log accessible labels with personal content');
console.log('PASS: admin reporting periods, privacy, exports, live action metrics, stable action identity and no recursive panels');
