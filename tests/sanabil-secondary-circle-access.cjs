'use strict';
/* Static regression protects the scope boundaries of the deployed SQL fix.
 * A signed-in PostgREST/RLS integration test is also performed separately. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const sql=fs.readFileSync('db/maintenance/fix_teacher_secondary_circle_access.sql','utf8');
assert.match(sql,/CREATE OR REPLACE FUNCTION private\.can_access\(/);
assert.match(sql,/STABLE SECURITY DEFINER/);
assert.match(sql,/SET search_path TO ''/);
assert.match(sql,/p\.active\s+AND m\.active/);
assert.match(sql,/m\.role = ANY\(p_roles\)/);
assert.match(sql,/m\.role = 'teacher'/);
assert.match(sql,/t\.user_id = p\.id/);
assert.match(sql,/t\.org_id = p_org_id/);
assert.match(sql,/t\.complex_id = p_complex_id/);
assert.match(sql,/private\.teacher_assigned_to_circle\(/);
assert.match(sql,/m\.org_id = p_org_id/);
assert.match(sql,/m\.complex_id IS NULL OR m\.complex_id = p_complex_id/);
assert.ok(!/\bGRANT\s+.*\bPUBLIC\b/i.test(sql));
assert.ok(!/ALTER TABLE public\.memberships/i.test(sql));
console.log('PASS: secondary-circle access requires active same-user teacher, same complex, membership and official assignment.');
