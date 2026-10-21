const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const old=fs.readFileSync('sanabil-live-v12.js','utf8');
const unified=fs.readFileSync('sanabil-complex-staff.js','utf8');
const backend=fs.readFileSync('supabase/functions/sanabil-user-admin/index.ts','utf8');

// Previous entry points still have a safe, reusable invitation builder.
const oldCode=old.slice(old.indexOf('const userWhatsAppPhone='),old.indexOf('function userWhatsAppDialog'));
assert.ok(oldCode.includes('userWelcomeMessage'));
const oldScope={waPhone:p=>{let d=String(p||'').replace(/\\D/g,'');if(d.startsWith('00'))d=d.slice(2);if(d.startsWith('0')&&d.length===10)d='966'+d.slice(1);return d;}};
vm.createContext(oldScope);
vm.runInContext(oldCode+';this.phone=userWhatsAppPhone;this.message=userWelcomeMessage;',oldScope);
assert.equal(oldScope.phone('٠٥٥١٢٣٤٥٦٧'),'966551234567');
assert.equal(oldScope.phone('+966 55 123 4567'),'966551234567');
assert.throws(()=>oldScope.phone('966123'));

// The new single panel must support the exact create -> one-time invitation workflow.
const start=unified.indexOf('function accessText('),end=unified.indexOf('function showCredentials(');
assert.ok(start>=0&&end>start);
const scope={LABELS:{teacher:'معلم',staff:'إداري مجمع',examiner:'مختبر',supervisor:'مشرف مجمع',manager:'مدير مؤسسة',admin:'مدير النظام'}};
vm.createContext(scope);
vm.runInContext(unified.slice(start,end)+';this.makeMessage=accessText;this.toNumber=whatsappNumber;',scope);
assert.equal(scope.toNumber('٠٥٥١٢٣٤٥٦٧'),'966551234567');
assert.equal(scope.toNumber('۰۵۵۱۲۳۴۵۶۷'),'966551234567');
assert.equal(scope.toNumber('05 5123 4567'),'966551234567');
assert.equal(scope.toNumber('+966 55 123 4567'),'966551234567');
assert.equal(scope.toNumber('00966551234567'),'966551234567');
assert.equal(scope.toNumber('invalid'),'');
const c={display_name:'معلم تجريبي',email:'teacher@example.invalid',role:'teacher',password:'GeneratedOnly123!'};const msg=scope.makeMessage(c);
assert.ok(msg.includes(c.email));
assert.ok(msg.includes(c.password));
assert.ok(msg.includes('https://snabilalwahy.com'));
assert.ok(msg.includes('كلمة المرور الأولية'));
assert.equal(decodeURIComponent(encodeURIComponent(msg)),msg);
assert.ok(unified.includes("api('users_create'"));
assert.ok(unified.includes("api('users_list'"));
assert.ok(unified.includes("api('users_policy_update'"));
assert.ok(unified.includes("api('users_update'"));
assert.ok(unified.includes("data-whatsapp"));
assert.ok(unified.includes("window.open(url,'_blank'"));
assert.ok(backend.includes('crypto.getRandomValues(bytes)'));
assert.ok(backend.includes('role,display_name:name,email,phone,password'));
assert.ok(!unified.includes('localStorage.setItem')); // initial credentials never persisted on device
console.log('PASS: unified user onboarding, role policy, server-created password, phone normalization and WhatsApp invitation');
