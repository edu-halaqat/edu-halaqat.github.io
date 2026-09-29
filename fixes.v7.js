/* Small accessibility helpers; operations belong to their actual modules. */
(()=>{'use strict';
const style=document.createElement('style');style.textContent='.brand img{object-fit:contain!important;height:auto!important;max-height:180px!important}.brand-compact img{max-height:74px!important}.tabs button[title]{min-width:44px}.sl-live h1{color:#006b55}';document.head.append(style);
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const label=b.textContent.trim(),aria=b.getAttribute('aria-label');
if(aria==='تحديث البيانات'){location.reload();return}
if(aria==='التنبيهات'){alert('تظهر الحسابات التي تحتاج إسنادًا في إدارة المستخدمين. راجع التقارير للاطلاع على السجلات الحديثة.');return}
if(label==='الاستعلام عن نتيجة'&&document.getElementById('login-email')){const code=prompt('أدخل رمز الاستعلام عن النتيجة');if(!code)return;b.disabled=true;try{const {data,error}=await window.supabaseClient.rpc('lookup_public_profile',{p_code:code.trim()});if(error)throw error;const d=Array.isArray(data)?data[0]:data;if(!d)throw Error('الرمز غير صحيح أو انتهت صلاحيته');const r=d.result_summary||{},scores=r.scores||r;alert((d.student_display_name||'نتيجة الطالب')+'\nالحفظ: '+(scores.memorization??'—')+' / 80\nالتجويد: '+(scores.tajweed??'—')+' / 20\nالمجموع: '+(scores.total??'—')+' / 100');}catch(err){alert(err.message||'تعذر الاستعلام')}finally{b.disabled=false}}
if(label==='طلب اختبار طالب'&&document.getElementById('login-email'))alert('سجّل الدخول بحسابك، ثم افتح الاختبارات لتقديم الطلب ضمن حلقتك.');
});
})();
