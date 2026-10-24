// In-memory Firestore/Auth-nabootsing met een paar regels uit firestore.rules
module.exports=function(){
  // De testaccounts staan hier op de code van hun e-mailadres (dezelfde FNV-hash die de app
  // gebruikt), zodat er geen echte adressen in deze openbare repository staan.
  const code=s=>{s=String(s||"").trim().toLowerCase();let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}return h.toString(36)};
  const users={"g7inej":{pw:"geheim1",uid:"U_rob"},"1s0bet7":{pw:"geheim2",uid:"U_hel"},"ayspfp":{pw:"geheim3",uid:"U_jas"},"867uht":{pw:"geheim4",uid:"U_mau"}};
  const docs=new Map();let ver=0;const ADMIN="U_rob";
  const resolve=(v,now)=>{if(v&&typeof v==="object"){if(v.__st)return{__ts:now};if(Array.isArray(v))return v.map(x=>resolve(x,now));const o={};for(const k in v)o[k]=resolve(v[k],now);return o}return v};
  const member=uid=>uid&&docs.has("users/"+uid);
  function check(op,path,uid,newData,old){
    const p=path.split("/");
    if(!uid)return "permission-denied";
    if(p[0]==="recipes"||p[0]==="photos"||p[0]==="thumbs"){if(op==="read")return member(uid)?null:"permission-denied";
      if(!member(uid))return "permission-denied";if(p[0]==="recipes"&&newData.updatedBy!==uid)return "permission-denied";return null}
    if(p[0]==="gedeeld"){if(op==="read")return member(uid)?null:"permission-denied";
      return (uid===ADMIN||p[1]===uid)?null:"permission-denied"}
    if(p[0]==="gezin"&&p[1]==="menu"){return member(uid)?null:"permission-denied"}
    if(p[0]==="gezin"){if(op==="read")return member(uid)?null:"permission-denied";
      if(uid===ADMIN)return null;if(!member(uid))return "permission-denied";
      if(!old)return "permission-denied";
      const keys=Object.keys(newData).filter(k=>JSON.stringify(newData[k])!==JSON.stringify(old[k]));
      return keys.every(k=>k===uid)?null:"permission-denied"}
    if(p[0]==="users"){
      if(p.length===2){const own=p[1]===uid;
        if(op==="read")return own||uid===ADMIN?null:"permission-denied";
        if(op==="list")return uid===ADMIN?null:"permission-denied";
        if(uid===ADMIN)return null;if(!own)return "permission-denied";
        if(!old)return null;
        if(old.deviceId&&newData.deviceId!==old.deviceId)return "permission-denied";return null}
      return p[1]===uid?null:"permission-denied";
    }
    return "permission-denied";
  }
  function write(path,data,merge,uid,mustExist){
    const old=docs.get(path);if(mustExist&&!old)return{__err:"not-found"};
    const now=Date.now()+(++ver)/1000;const d=resolve(data,now);
    const diep=(o,n)=>{const uit={...o};for(const k in n){const v=n[k];
      uit[k]=(v&&typeof v==="object"&&!Array.isArray(v)&&!v.__ts&&o&&o[k]&&typeof o[k]==="object"&&!Array.isArray(o[k]))?diep(o[k],v):v}return uit};
    const nd=(merge||mustExist)&&old?diep(old.data,d):d;
    const e=check("write",path,uid,nd,old&&old.data);if(e)return{__err:e};
    docs.set(path,{data:nd,ver:++ver});return{ok:1};
  }
  const api={
    signIn:({email,pw})=>{const u=users[code(email)];if(!u||u.pw!==pw)return{__err:"auth/invalid-credential"};return{uid:u.uid}},
    get:({path,uid})=>{const e=check("read",path,uid);if(e)return{__err:e};const d=docs.get(path);return{exists:!!d,data:d&&d.data}},
    list:({path,w,uid})=>{const e=check(path==="users"?"list":"read",path+"/x",uid);if(e)return{__err:e};const n=path.split("/").length+1;return[...docs].filter(([k,v])=>k.startsWith(path+"/")&&k.split("/").length===n&&(!w||w.op!=="=="||v.data[w.f]===w.v)).map(([k,v])=>({id:k.split("/").pop(),data:v.data}))},
    del:({path,uid})=>{if(uid!==ADMIN)return{__err:"permission-denied"};docs.delete(path);return{ok:1}},
    set:({path,data,merge,uid})=>write(path,data,merge,uid,false),
    update:({path,data,uid})=>write(path,data,true,uid,true),
    batch:({ops,uid})=>{for(const o of ops){const r=write(o.path,o.data,o.merge,uid,false);if(r.__err)return r}return{ok:1}},
    query:({path,w,since,uid})=>{const e=check("read",path+"/x",uid);if(e)return{__err:e};const n=path.split("/").length+1;let max=since;
      const rows=[...docs].filter(([k,v])=>k.startsWith(path+"/")&&k.split("/").length===n&&v.ver>since&&(!w||((v.data[w.f]||{}).__ts||0)>(w.v.__ts||0)))
        .map(([k,v])=>{if(v.ver>max)max=v.ver;return{id:k.split("/").pop(),data:v.data}});return{rows,max}},
  };
  return {api,docs};
};
