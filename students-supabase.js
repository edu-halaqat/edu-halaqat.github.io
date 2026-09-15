(function () {
  'use strict';
  const ORG_ID = 'org_main';

  function getClient() {
    if (window.supabaseClient) return window.supabaseClient;
    if (window.supabase) return window.supabase;
    throw new Error('Supabase client غير موجود');
  }

  function getCurrentUserId() {
    return window.currentUser?.id || JSON.parse(localStorage.getItem('sanabil-auth-session-v2'))?.user_id || null;
  }

  async function getAccess() {
    const roleKey = localStorage.getItem('sanabil-auth-access-v2');
    if (roleKey) return JSON.parse(roleKey);
    throw new Error('تعذر قراءة صلاحيات المستخدم');
  }

  function normalizeArabicName(name) {
    return String(name || '').trim().replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').toLowerCase();
  }

  async function loadComplexes() {
    const sb = getClient();
    const { data, error } = await sb.from('complexes').select('id,name').eq('org_id', ORG_ID).eq('active', true).order('name');
    if (error) throw error;
    return data || [];
  }

  async function loadCircles(options = {}) {
    const sb = getClient();
    const access = await getAccess();
    let query = sb.from('circles').select('id,complex_id,name').eq('org_id', ORG_ID).eq('active', true);

    if (options.complexId) query = query.eq('complex_id', options.complexId);
    
    // تطبيق النطاق
    if (access?.roles?.includes('supervisor') && access?.complex_id) {
      query = query.eq('complex_id', access.complex_id);
    }
    const { data, error } = await query.order('name');
    if (error) throw error;
    return data || [];
  }

  async function loadStudents(options = {}) {
    const sb = getClient();
    const access = await getAccess();
    let query = sb.from('students').select(`id, full_name, identity_number, stage, circle_name, active`).eq('org_id', ORG_ID);

    query = query.eq('active', options.active !== undefined ? options.active : true);

    if (options.search) query = query.ilike('full_name', `%${options.search}%`);
    if (options.complexId) query = query.eq('complex_id', options.complexId);
    if (options.circleId) query = query.eq('circle_id', options.circleId);

    // تطبيق النطاق الأمني في الواجهة (رديف لـ RLS)
    if (access?.roles?.includes('supervisor') && access?.complex_id) {
      query = query.eq('complex_id', access.complex_id);
    }

    const { data, error } = await query.order('full_name', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function createStudent(form) {
    const sb = getClient();
    const userId = getCurrentUserId();
    const now = new Date().toISOString();

    const row = {
      id: crypto.randomUUID(),
      org_id: ORG_ID,
      complex_id: form.complex_id,
      circle_id: form.circle_id,
      full_name: form.full_name.trim(),
      full_name_normalized: normalizeArabicName(form.full_name),
      identity_number: form.identity_number || null,
      student_phone: form.student_phone || null,
      stage: form.stage || null,
      active: true,
      created_at: now,
      updated_at: now,
      created_by: userId,
      updated_by: userId
    };

    const { data, error } = await sb.from('students').insert(row).select('*').single();
    if (error) throw error;
    return data;
  }

  async function setStudentActive(studentId, active) {
    const sb = getClient();
    const { data, error } = await sb.from('students').update({ active: Boolean(active), updated_at: new Date().toISOString() }).eq('id', studentId).eq('org_id', ORG_ID).select('*').single();
    if (error) throw error;
    return data;
  }

  window.SanabilStudents = { loadComplexes, loadCircles, loadStudents, createStudent, setStudentActive, normalizeArabicName };
})();
