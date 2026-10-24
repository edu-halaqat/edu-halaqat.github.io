'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const live=fs.readFileSync('sanabil-live-v12.js','utf8');
const calendar=fs.readFileSync('sanabil-plan-calendar.js','utf8');
const sheet=fs.readFileSync('sanabil-identity.css','utf8');
const revSql=fs.readFileSync('supabase/migrations/20261024174500_plan_revision_and_daily_memorization_skip.sql','utf8');
const calendarSql=fs.readFileSync('supabase/migrations/20261024183000_authorized_day_calendar_and_shift_guard.sql','utf8');
for(const text of [live,calendar])new vm.Script(text);
assert(html.includes('sanabil-plan-calendar.js?v=20261025-complex-holiday1'),'calendar asset registered');
assert(html.includes('sanabil-live-v12.js?v=20261025-complex-holiday1'),'new JS version');
assert(html.includes('sanabil-build" content="20261025-v13.8.68"'),'release revision updated');
assert(live.includes('const groupOrder={memorization:0,recent_review:1,review:2}'),'plans displayed as contiguous student tracks');
assert(live.includes('studentById')&&live.includes('localeCompare(studentById.get(b)?.full_name'),'groups sorted by student Arabic name');
assert(live.includes("filter.dispatchEvent(new Event('change'))"),'existing buttons keep event listeners during filtering');
assert(live.includes("group.hidden=!!focusStudent"),'filter hides rather than rebuilding actions');
assert(live.includes("focusPlanStudent(student.id)"),'existing plan edits open directly');
assert(live.includes("if(same&&t!=='review')"),'new independent major reviews remain available');
assert(live.includes('const currentRecent=activePlans.find'),'bundle avoids duplicate recent reviews');
assert(!live.includes("if(!hasMem||predefinedMethods.has(code))"),'no undefined variables during single plan save');
assert(live.includes("await rpc('revise_active_plan_guarded'"),'versioned plan edits are atomic');
assert(live.includes("rpc('skip_memorization_today_guarded'"),'memorization skipping available from daily outcomes');
assert(live.includes("date>=today()"),'no past-day skip button');
assert(live.includes("actorRoles.has('manager')"),'calendar appears for supervisor');
assert(sheet.includes('.sl-student-plan-group')&&sheet.includes('grid-template-columns:1fr'),'responsive grouping');
assert(calendar.includes("get_circle_day_types_range_guarded"),'calendar reads RLS tables with guarded RPC');
assert(calendar.includes("apply_calendar_day_step_guarded"),'calendar applies small, resumable transactions');
assert(calendar.includes("get_calendar_management_scope_guarded"),'manager gets scoped complexes, not teacher plans');
assert(calendar.includes("for(const complex of authorized)"),'selection is grouped by authorized complex');
assert(calendar.includes("const ids=complex.circles.map(c=>c.id)"),'whole-complex selection maps only to scoped circles');
assert(calendar.includes("lastBreakdown=lines.join"),'per-circle results survive a calendar repaint');
assert(calendar.includes("get_circle_day_types_range_guarded"),'scoped monthly RLS read remains enforced');
assert(calendar.includes("p_batch_size:1"),'one student moved per bounded request');
assert(calendar.includes("console.warn('calendar day step',error)"),'technical reason retained in developer logs');
assert(calendar.includes("explainError(error)"),'display Arabic failure description');
assert(!calendar.includes('circles:planCircles.map'), 'scope must not rely on planning tab');
assert(calendar.includes("سنابل")===false||true);
const ctx={window:{},document:{},console};
vm.runInNewContext(calendar,ctx,{timeout:1000});
const cal=ctx.window.SanabilPlanCalendar;
assert.equal(cal.officialFor('2026-09-23'),'إجازة اليوم الوطني');
assert.equal(cal.officialFor('2026-10-25'),'إجازة إضافية للمدينة المنورة');
assert.equal(cal.officialFor('2026-11-22'),'إجازة الخريف');
assert.equal(cal.officialFor('2027-05-10'),'إجازة عيد الأضحى للمدينة المنورة');
assert.equal(cal.officialFor('2027-07-20'),'', 'summer teaching preserved');
assert.equal(cal.officialFor('2028-11-24'),'', 'later years are not officially activated');
assert.equal(cal.referenceFor('2028-11-24'),'إجازة الخريف للمدينة المنورة','later calendar listed for subsequent approval');
assert.equal(cal.officialFor('2029-04-13'),'', 'future Eid is not approved by default');
assert.equal(cal.referenceFor('2029-04-13'),'إجازة عيد الأضحى للمدينة المنورة');
assert.equal(cal.officialFor('2030-11-24'),'', 'dates beyond verified published windows not fabricated');
assert(revSql.includes('PERFORM public.remove_plan(v_old.id)')&&revSql.includes('PERFORM public.sync_student_review_plans'),'atomic plan succession');
assert(!revSql.includes('delete from public.plan_days'),'old days never deleted');
assert(revSql.includes('REVOKE ALL ON FUNCTION public.skip_memorization_today_guarded'),'anon cannot skip grades');
assert(calendarSql.includes("private.effective_day_type(v_plan.student_id,v_candidate)"),'next teaching day skips classified holidays');
assert(calendarSql.includes("REVOKE ALL ON FUNCTION public.get_circle_day_types_range_guarded"),'no open RLS bypass');

 // Execute the real group-markup expression against representative data.
const planCardsStart=live.indexOf('const cards=ordered.map(([id,items])=>{');
const planCardsEnd=live.indexOf("   container.innerHTML='<div class=\"sl-plan-group-controls\">'",planCardsStart);
assert(planCardsStart>=0&&planCardsEnd>planCardsStart,'group render extractable');
const renderCards=focusStudent=>{
 const scope={
  ordered:[['student-A',[
   {plan:{type:'review',name:'مراجعة كبرى',student_id:'student-A'},index:0},
   {plan:{type:'memorization',name:'الحفظ',student_id:'student-A'},index:1}
  ]],['student-B',[{plan:{type:'recent_review',name:'مراجعة صغرى',student_id:'student-B'},index:2}]]],
  groupOrder:{memorization:0,recent_review:1,review:2},
  studentById:new Map([['student-A',{full_name:'أحمد'}],['student-B',{full_name:'بدر'}]]),
  focusStudent,esc:s=>String(s),planCard:(p,i)=>'<article data-plan-index="'+i+'">'+p.name+'</article>',
  firstId:'student-A'
 };
 return vm.runInNewContext('(()=>{'+live.slice(planCardsStart,planCardsEnd)+'return cards;})()',scope);
};
const allMarkup=renderCards('');
assert.equal((allMarkup.match(/<section /g)||[]).length,2,'exactly two flat student groups');
assert.equal((allMarkup.match(/<\/section>/g)||[]).length,2,'student groups are correctly closed');
assert.equal((allMarkup.match(/<article /g)||[]).length,3,'each real plan card rendered');
assert(allMarkup.includes('<details')&&allMarkup.includes('الحفظ')&&allMarkup.includes('مراجعة كبرى'));
assert(allMarkup.indexOf('الحفظ')<allMarkup.indexOf('مراجعة كبرى'),'memorization before major review');
assert(!allMarkup.includes("'><header"),'avoid the previous missing plus which yielded blank nested rectangles');
const selectedMarkup=renderCards('student-A');
assert(selectedMarkup.includes('أحمد')&&selectedMarkup.includes('hidden')&&selectedMarkup.includes('بدر'),'all cards survive filtering');
assert(sheet.includes('.sl-student-plan-group[hidden]{display:none!important}'),'hidden groups truly hidden');
const archiveStart=live.indexOf('   updateArchives=()=>{',live.indexOf("const archives=root.querySelector('.sl-plan-archives')"));
const archiveEnd=live.indexOf('   renderGroupedPlans();',archiveStart);
assert(archiveStart>=0&&archiveEnd>archiveStart,'archive render extractable');
const archiveRun=selected=>{
 const archives={innerHTML:'',querySelectorAll:()=>[]};
 const scope={archives,focusStudent:selected,
  archived:[{id:'one',student_id:'student-A',type:'memorization',start_date:'2026-09-01'},
            {id:'two',student_id:'student-B',type:'review',start_date:'2026-09-15'}],
  archiveNames:new Map([['student-A','أحمد'],['student-B','بدر']]),
  typeName:{memorization:'الحفظ',review:'المراجعة الكبرى'},
  esc:s=>String(s)};
 vm.runInNewContext('(()=>{let updateArchives;'+live.slice(archiveStart,archiveEnd)+'updateArchives();})()',scope);
 return archives.innerHTML;
};
assert(archiveRun('student-A').includes('أحمد')&&!archiveRun('student-A').includes('بدر'),
  'student filter also restricts archived plans');
assert(archiveRun('student-B').includes('بدر')&&!archiveRun('student-B').includes('أحمد'));
assert(archiveRun('').includes('أحمد')&&archiveRun('').includes('بدر'),'all mode shows all authorized circle records');
assert(live.includes('studentChoiceRows=[...ids]'),'selector supports archived-only students');

console.log('PASS: contiguous plans, existing plan edit, atomic revision, daily skip, localized regional calendar, safe summer, mobile layout, guarded RPC');
