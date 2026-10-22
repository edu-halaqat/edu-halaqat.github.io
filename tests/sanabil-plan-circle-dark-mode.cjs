'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const live=fs.readFileSync('sanabil-live-v12.js','utf8');
const css=fs.readFileSync('sanabil-identity.css','utf8');
const html=fs.readFileSync('index.html','utf8');

// Execute the exact selection helper from the shipped bundle with realistic
// fixture data: same teacher assigned to two different teaching circles.
const helper=live.match(/const scopePlanStudents=(\(list,circleId\)=>list\.filter\(student=>student\.circle_id===circleId\));/);
assert.ok(helper,'plan students must be filtered by selected circle ID');
const scoped=vm.runInNewContext(helper[1]);
const all=[
 {id:'a1',teacher_id:'teacher-A',circle_id:'abdullah',full_name:'اختبار عبدالله 1'},
 {id:'a2',teacher_id:'teacher-A',circle_id:'uthman',full_name:'اختبار عثمان 1'},
 {id:'a3',teacher_id:'teacher-A',circle_id:'abdullah',full_name:'اختبار عبدالله 2'},
 {id:'a4',teacher_id:'teacher-B',circle_id:'othman',full_name:'اختبار غير مصرح'}
];
assert.deepEqual(Array.from(scoped(all,'abdullah'),x=>x.id),['a1','a3']);
assert.deepEqual(Array.from(scoped(all,'uthman'),x=>x.id),['a2']);
assert.deepEqual(Array.from(scoped(all,'no-students'),x=>x.id),[]);

// Both single-track and bundled plan save paths must reject stale selections
// from a different circle (not only hide them in the dropdown).
assert.equal((live.match(/students\.find\(s=>s\.id===val\(form,'student'\)&&s\.circle_id===activePlanCircle\.id\)/g)||[]).length,2);
assert.match(live,/const quranStudentIds=new Set\(students\.map\(s=>s\.id\)\)/);
assert.match(live,/quranStudentIds\.has\(p\.student_id\)/);
assert.match(live,/rows\('students','id,full_name,circle_id',\{circle_id:activePlanCircle\.id\}\)/);
assert.match(live,/archivedIds\.has\(p\.student_id\)/);
assert.match(live,/sanabil_outcome_selected_circle_v1:/);
assert.match(live,/planCirclePicker\?\.addEventListener\('change'/);
assert.ok(live.indexOf('const planCirclePicker=')>live.indexOf('if(talaqqinCircles.size)'), 'picker event must bind after mixed plan-tabs rebuild');
assert.match(live,/if\(!activePlanCircle\)/);
assert.match(live,/emptyPlanCircle\?'<p class="sl-empty"/);

// Explicit dialog fieldsets now follow night mode. Unrelated print pages and
// normal light appearance must remain unchanged.
assert.match(css,/html\[data-sanabil-theme="dark"\] \.sl-dialog :is\(\s*fieldset\.sl-plan-builder,fieldset\.sl-review-builder/);
assert.match(css,/\.sl-plan-builder legend label/);
assert.match(css,/\.sl-review-builder legend label/);
assert.match(css,/background:#1d3a32!important/);
assert.match(css,/color:#f2fbf5!important/);
assert.match(css,/color-scheme:dark/);
assert.match(html,/sanabil-live-v12\.js\?v=20261022-plan-circle3/);
assert.match(html,/sanabil-identity\.css\?v=20261022-plan-dark34/);
assert.match(live,/__SanabilLiveBuild='20261022-v13\.8\.58-circle-scoped-plans'/);
console.log('PASS: multi-circle student scoping, two save guards, per-circle active/archive plans, dark plan dialog.');
