'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const js=fs.readFileSync('sanabil-live-v12.js','utf8');
const css=fs.readFileSync('sanabil-identity.css','utf8');
const html=fs.readFileSync('index.html','utf8');

const prefix='const scopeStudentsToPlanCircle=';
const pos=js.indexOf(prefix);
assert.ok(pos>=0,'scoped-plan student filter helper must exist');
const end=js.indexOf(';',pos);
assert.ok(end>pos,'filter expression must terminate');
const expression=js.slice(pos+prefix.length,end);
const match=[null,expression];
assert.ok(match,'scoped-plan student filter helper must exist');
const scopeStudentsToPlanCircle=Function('return '+match[1])();
const students=[
 {id:'a',circle_id:'abdullah'},
 {id:'b',circle_id:'othman'},
 {id:'c',circle_id:'abdullah'},
 {id:'d',circle_id:'othman'}
];
assert.deepEqual(scopeStudentsToPlanCircle(students,'abdullah').map(x=>x.id),['a','c']);
assert.deepEqual(scopeStudentsToPlanCircle(students,'othman').map(x=>x.id),['b','d']);
assert.deepEqual(scopeStudentsToPlanCircle(students,'not-authorized'),[]);
assert.equal(students.length,4,'original data stays untouched');

assert.ok(js.includes('const students=scopeStudentsToPlanCircle(allStudents,selectedPlanCircle)'),
  'plan creation student selector must be filtered to the chosen circle');
assert.ok(js.includes('scopeStudentsToPlanCircle(archiveStudents,selectedPlanCircle)'),
  'archived plan list must also use the exact circle scope');
// Both the independent-track and bundled-plan save routes reject stale IDs
// whose student belongs to a different circle, even if the same teacher teaches both.
assert.equal(js.split("students.find(s=>s.id===val(form,'student')&&s.circle_id===selectedPlanCircle)").length-1,2,
  'both plan save routes must verify circle identity at submission');
assert.ok(js.includes('const quranStudentIds=new Set(students.map(s=>s.id))'),
  'active plans must use the same selected-circle student IDs');
assert.ok(js.includes("select('الحلقة الحالية','planCircle',planCircles,selectedPlanCircle)"),
  'user must be able to choose an explicit circle');
assert.ok(js.includes("const teacherOnly=actorRoles.has('teacher')"),
  'teacher may not list arbitrary circles in the scope selector');
assert.ok(js.includes('assignedCircleIds.has(c.id)'),
  'teacher circle choices must respect official teacher assignments');
assert.ok(js.includes('localStorage.setItem(outcomeCircleKey,chosen)'),
  'the chosen planning circle must stay in sync with daily outcomes');
assert.ok(js.includes('if(!planCircles.some(c=>c.id===chosen))return;'),
  'reject stale or injected unassigned circle selections');

assert.match(css,/html\[data-sanabil-theme="dark"\] body > \.sl-dialog \.sl-body form :is\(\s*fieldset\.sl-plan-builder/);
assert.match(css,/fieldset\.sl-review-builder/);
assert.match(css,/html\[data-sanabil-theme="dark"\] body > \.sl-dialog \.sl-body form select option/);
assert.match(css,/\.sl-plan-circle-filter label/);
assert.match(html,/\/sanabil-live-v12\.js\?v=2026102[234]-[a-z0-9-]+/);
assert.ok(html.includes('/sanabil-identity.css?v=36'));
console.log('PASS: plan lists are circle-specific, teacher choices are assigned, archived plans stay scoped, and dark modal styles are versioned.');
