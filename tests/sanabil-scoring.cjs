'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const quick=fs.readFileSync('sanabil-quick-outcomes.js','utf8'),
scoring=fs.readFileSync('sanabil-scoring-ui.js','utf8'),
guardian=fs.readFileSync('guardian.html','utf8'),
home=fs.readFileSync('sanabil-live-v12.js','utf8'),
html=fs.readFileSync('index.html','utf8'),
sql=fs.readFileSync('supabase/migrations/20261019050000_complex_score_policies_and_secure_ranks.sql','utf8');
new vm.Script(quick,{filename:'quick.js'});new vm.Script(scoring,{filename:'score-ui.js'});
const client=guardian.slice(guardian.indexOf('<script>')+8,guardian.lastIndexOf('</script>'));
new vm.Script(client,{filename:'guardian.html inline JS'});
const win={};vm.runInNewContext(quick,{window:win,document:{}});
const grade=win.SanabilQuickOutcomes.gradeFor;
assert.equal(grade('memorization',0,0),'ممتاز');
assert.equal(grade('memorization',0,1),'لم يحفظ','one doubt disqualifies memorization');
assert.equal(grade('memorization',1,0),'لم يحفظ');
assert.equal(grade('recentReview',0,1),'لم يحفظ','one doubt disqualifies short review');
assert.equal(grade('review:a',0,1),'ممتاز');
assert.equal(grade('review:a',1,0),'جيد جدًا');
assert.equal(grade('review:a',0,2),'جيد جدًا');
assert.equal(grade('review:a',1,1),'جيد');
assert.equal(grade('review:a',1,4),'لم يحفظ');
assert.equal(grade('review:a',3,0),'لم يحفظ');
const custom={memorization:{perfect_errors:0,perfect_doubts:0,very_good_errors:0,very_good_doubts:1},
 recentReview:{perfect_errors:0,perfect_doubts:0,very_good_errors:0,very_good_doubts:1},
 major:{error_weight:3,perfect_max:0,very_good_max:3,good_max:5}};
assert.equal(grade('memorization',0,1,custom),'جيد جدًا','supervisor may permit one doubt');
assert.equal(grade('recentReview',0,1,custom),'جيد جدًا');
assert.equal(grade('review:a',1,0,custom),'جيد جدًا','supervisor may alter error weight');
assert(html.includes('sanabil-scoring-ui.js?v=20261019-v1'));
assert(html.includes('sanabil-scoring-ui.css?v=20261019-v1'));
assert(home.includes("data.action='score-policy'")||home.includes("dataset.action='score-policy'"));
assert(home.includes('complexId:l.circles.find(c=>c.id===circle)?.complex_id'));
assert(guardian.includes('score.month.daily')&&guardian.includes('score.period?.complexRank'));
assert(guardian.includes('score.period?.circleRank'));
assert(sql.includes("date_key between p_start and p_end"));
assert(sql.includes('dense_rank() over(partition by circle_id order by total desc)'));
assert(sql.includes("coalesce((b.rules#>>array['attendance'"));
assert(sql.includes('on conflict(complex_id,valid_from) do update'));
assert(sql.includes("where pd.student_id=b.student_id and pd.date_key=b.date_key"));
assert(sql.includes("public.snabil_score_grade_points(b.rules,'major',pd.rating)"));
console.log('PASS: strict memorization, supervisor-adjustable categories, date-versioned points, group-safe ranking, guardian numbers and frontend syntax');
