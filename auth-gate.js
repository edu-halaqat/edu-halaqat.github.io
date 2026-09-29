/* One authentication owner: the Supabase SDK bundled with the app. */
(()=>{'use strict';
const S='sanabil-auth-session-v2', A='sanabil-auth-access-v2';
const clear=()=>{for(const storage of [localStorage,sessionStorage]){storage.removeItem(S);storage.removeItem(A)}};
window.SanabilAuthSync=session=>{if(!session){clear()}else{const storage=localStorage.getItem('sanabil:trusted-device')==='true'?localStorage:sessionStorage;const other=storage===localStorage?sessionStorage:localStorage;other.removeItem(S);other.removeItem(A);storage.setItem(S,JSON.stringify({...session,user_id:session.user.id}));}window.dispatchEvent(new Event('sanabil-session-changed'));};
window.SanabilAccessSync=access=>{localStorage.removeItem(A);sessionStorage.removeItem(A);const storage=localStorage.getItem('sanabil:trusted-device')==='true'?localStorage:sessionStorage;storage.setItem(A,JSON.stringify(access||{}));window.dispatchEvent(new Event('sanabil-access-changed'));};
})();
