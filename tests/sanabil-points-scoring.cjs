'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=f=>fs.readFileSync(f,'utf8');
const quick=read('sanabil-quick-outcomes.js'),admin=read('sanabil-points-admin.js'),
 css=read('sanabil-quick-outcomes.css'),guardian=read('guardian.html'),
 edge=read('supabase/functions/sanabil-guardian/index.ts'),
 sql=read('supabase/migrations/20261019050000_student_daily_points_and_complex_scoring.sql'),
 live=read('sanabil-live-v12.js'),html=read('index.html');
const window={};vm.runInNewContext(quick,{window,document:{}});
const grade=window.SanabilQuickOutcomes.gradeFor;
for(const track of ['memorization','recentReview']){
 for(const [e,d,want] of [[0,0,'ممتاز'],[0,1,'لم يحفظ'],[0,4,'لم يحفظ'],[1,0,'لم يحفظ'],[1,4,'لم يحفظ']])
  assert.equal(grade(track,e,d),want,track+':'+e+','+d);
}
for(const [e,d,want] of [[0,0,'ممتاز'],[0,1,'ممتاز'],[0,2,'جيد جدًا'],[1,0,'جيد جدًا'],
 [1,1,'جيد'],[2,0,'جيد'],[1,4,'لم يحفظ'],[2,2,'لم يحفظ'],[3,0,'لم يحفظ']])
 assert.equal(grade('review:plan-a',e,d),want);
const profile={tracks:{
 memorization:{error_weight:2,doubt_weight:1,excellent_max:0,very_good_max:1,good_max:2},
 recentReview:{error_weight:3,doubt_weight:1,excellent_max:0,very_good_max:1,good_max:2},
 review:{error_weight:2,doubt_weight:1,excellent_max:1,very_good_max:2,good_max:5}
}};
assert.equal(grade('memorization',0,1,profile),'جيد جدًا','manager custom doubt threshold is used');
assert.equal(grade('memorization',1,0,profile),'جيد','manager custom error threshold is used');
assert.equal(grade('review:plan-b',2,2,profile),'لم يحفظ');
assert(css.includes('.sl-data:not(.sl-quick-mode) .sl-quick-outcomes > :not(.sl-quick-toolbar)'), 'hide quick cards in detailed mode');
assert(live.includes('complexId:circleMeta?.complex_id'), 'quick editor receives complex policy scope');
assert(live.includes('SanabilPointsAdmin?.mountDashboard'), 'supervisor can open scoring administration');
assert(admin.includes("set_student_scoring_policy")&&admin.includes("set_student_scoring_period"), 'supervisor writes use scoped guarded RPCs');
assert(html.includes('sanabil-points-admin.js')&&html.includes('/sanabil-quick-outcomes.js?v=20261019-v2'),'scripts loaded');
assert(sql.includes('student_daily_points')&&sql.includes('student_scoring_policies'));
assert(sql.includes('guardian_student_points_report')&&sql.includes('revoke execute on function public.guardian_student_points_report'));
assert(sql.includes("when 'late' then 3 when 'excused' then 3"),'same penalty regardless excuse');
assert(sql.includes("when 'present' then 5"), 'attendance is 5');
assert(sql.includes("when 'ممتاز' then 10"),'major review maximum is 10');
assert(sql.includes("when 'ممتاز' then 5"),'new memorization maximum is 5');
assert(edge.includes('guardian_student_points_report')&&edge.includes('student_scoring_periods'),'guardian edge uses private RPC & configured periods');
assert(guardian.includes('scoreData=d.scorecard')&&guardian.includes('guardian-score-period'),'portal displays range selector and student ranking');
console.log('PASS: strict Quran zero-error/zero-doubt, customizable supervisor thresholds, exclusive quick/detailed UI, scoring security and private guardian rankings');
