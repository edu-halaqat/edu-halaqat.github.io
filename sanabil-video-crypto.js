/* Per-student encrypted invitations. Secrets stay in URL fragments and memory. */
(()=>{'use strict';
const enc=new TextEncoder(),dec=new TextDecoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const bytes=text=>Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const random=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
const importKey=secret=>crypto.subtle.importKey('raw',bytes(secret),'AES-GCM',false,['encrypt','decrypt']);
async function pack(key,room,event,payload){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const body=enc.encode(JSON.stringify({time:Date.now(),nonce:random(),payload}));
 const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(room+':'+event)},key,body);
 return {iv:b64(iv),data:b64(new Uint8Array(data))};
}
async function unpack(key,room,event,envelope,seen,expires){
 if(Date.now()>expires||!envelope||typeof envelope.data!=='string'||envelope.data.length>64000)return null;
 try{
 const iv=bytes(envelope.iv);if(iv.length!==12)return null;
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:enc.encode(room+':'+event)},key,bytes(envelope.data));
 const message=JSON.parse(dec.decode(plain));
 if(Math.abs(Date.now()-message.time)>60000||typeof message.nonce!=='string'||seen.has(message.nonce))return null;
 seen.add(message.nonce);if(seen.size>500)seen.delete(seen.values().next().value);
 return message.payload;
 }catch{return null}
}
window.SanabilVideoCrypto={random,importKey,pack,unpack};
})();