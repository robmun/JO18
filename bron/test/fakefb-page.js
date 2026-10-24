(()=>{
const be=(op,p)=>window.__be(op,p).then(r=>{if(r&&r.__err){const e=new Error(r.__err);e.code=r.__err;throw e}return r});
class Timestamp{constructor(ms){this.ms=ms}toMillis(){return this.ms}static fromMillis(ms){return new Timestamp(ms)}}
const rev=v=>{if(v&&typeof v==="object"){if("__ts" in v)return new Timestamp(v.__ts);if(Array.isArray(v))return v.map(rev);const o={};for(const k in v)o[k]=rev(v[k]);return o}return v};
const enc=v=>{if(v instanceof Timestamp)return{__ts:v.ms};if(v&&typeof v==="object"){if(v.__st)return v;if(Array.isArray(v))return v.map(enc);const o={};for(const k in v)if(v[k]!==undefined)o[k]=enc(v[k]);return o}return v};
const snap=(id,r)=>({id,exists:()=>!!(r&&r.exists),data:()=>r&&r.exists?rev(r.data):undefined,metadata:{hasPendingWrites:false}});
const authL=[];let cur=null;try{cur=JSON.parse(localStorage.getItem("__fakeauth")||"null")}catch(e){}
const fire=()=>authL.forEach(f=>setTimeout(()=>f(cur),0));
window.__FAKE_FB={
  getAI:()=>({}),GoogleAIBackend:function(){},getGenerativeModel:(ai,o)=>({generateContent:async parts=>{window.__aiCalls=(window.__aiCalls||0)+1;window.__aiModel=o.model;window.__aiParts=parts.length;window.__aiPrompt=(parts[0]&&parts[0].text)||'';await new Promise(r=>setTimeout(r,300));if(/Instagram of TikTok/.test(window.__aiPrompt))return{response:{text:()=>JSON.stringify({is_recept:true,titel:'Gnocchi met pompoen en salie',porties:2,tijd_minuten:20,type:'Hoofdgerecht',bron:'@keukenliefde',ingredienten:[{hoeveelheid:'500',eenheid:'g',naam:'gnocchi'},{hoeveelheid:'400',eenheid:'g',naam:'pompoenblokjes'},{hoeveelheid:'',eenheid:'een handje',naam:'salieblaadjes'},{hoeveelheid:'50',eenheid:'g',naam:'parmezaan'}],stappen:['Rooster de pompoen 15 minuten op 200 graden.','Bak de gnocchi goudbruin in boter.','Bak de salie kort mee en schep alles door elkaar.'],benodigdheden:['ovenschaal']})}};return{response:{text:()=>'```json\n'+JSON.stringify({is_recept:true,titel:'Shakshuka met feta',porties:2,tijd_minuten:25,type:'Lunch',bron:'Ottolenghi – Simple',ingredienten:[{hoeveelheid:'4',eenheid:'',naam:'eieren'},{hoeveelheid:'400',eenheid:'g',naam:'tomatenblokjes'},{hoeveelheid:'1/2',eenheid:'tl',naam:'komijn'},{hoeveelheid:'',eenheid:'',naam:'peper en zout'}],stappen:['1. Fruit de ui.','Voeg de tomaten toe en laat 10 min pruttelen.','Breek de eieren erin.'],benodigdheden:['koekenpan met deksel']})+'\n```'}}}}),
  initializeApp:c=>({c}),getAuth:()=>({}),initializeFirestore:(app,o)=>{window.__fsOpts=o;return{}},
  persistentLocalCache:o=>({__cache:o}),persistentMultipleTabManager:()=>({__tabs:1}),waitForPendingWrites:async()=>{},
  onAuthStateChanged:(a,f)=>{authL.push(f);setTimeout(()=>f(cur),30);return()=>{}},
  signInWithEmailAndPassword:async(a,email,pw)=>{const r=await be("signIn",{email,pw});cur={uid:r.uid,email};localStorage.setItem("__fakeauth",JSON.stringify(cur));fire();return{user:cur}},
  sendPasswordResetEmail:async()=>({}),signOut:async()=>{cur=null;localStorage.removeItem("__fakeauth");fire()},
  doc:(db,...p)=>({path:p.join("/"),id:p[p.length-1]}),collection:(db,...p)=>({path:p.join("/")}),
  where:(f,op,v)=>({f,op,v:enc(v)}),query:(c,w)=>({path:c.path,w}),
  serverTimestamp:()=>({__st:1}),Timestamp,
  getDoc:async ref=>snap(ref.id,await be("get",{path:ref.path,uid:cur&&cur.uid})),
  getDocs:async c=>{const rows=await be("list",{path:c.path,w:c.w,uid:cur&&cur.uid});const docs=rows.map(r=>snap(r.id,{exists:true,data:r.data}));return{docs,forEach:f=>docs.forEach(f),size:docs.length}},
  setDoc:async(ref,d,o)=>be("set",{path:ref.path,data:enc(d),merge:!!(o&&o.merge),uid:cur&&cur.uid}),
  deleteDoc:async ref=>be("del",{path:ref.path,uid:cur&&cur.uid}),updateDoc:async(ref,d)=>be("update",{path:ref.path,data:enc(d),uid:cur&&cur.uid}),
  writeBatch:()=>{const ops=[];return{set:(ref,d,o)=>ops.push({path:ref.path,data:enc(d),merge:!!(o&&o.merge)}),commit:()=>be("batch",{ops,uid:cur&&cur.uid})}},
  runTransaction:async(db,fn)=>{const w=[];const tx={get:async ref=>snap(ref.id,await be("get",{path:ref.path,uid:cur&&cur.uid})),set:(ref,d)=>w.push(["set",ref,d]),update:(ref,d)=>w.push(["update",ref,d])};
    const r=await fn(tx);for(const [op,ref,d] of w){if(op==="set")await be("set",{path:ref.path,data:enc(d),uid:cur&&cur.uid});else await be("update",{path:ref.path,data:enc(d),uid:cur&&cur.uid})}return r},
  onSnapshot:(q,next,err)=>{let since=0,first=true,stop=false,lastDoc;
    if(q.id!==undefined){ // losse doc-listener
      const tick2=async()=>{if(stop)return;try{const r=await be("get",{path:q.path,uid:cur&&cur.uid});const j=JSON.stringify(r);
        if(j!==lastDoc){lastDoc=j;next(snap(q.id,r))}}catch(e){err&&err(e)}
        if(!stop)setTimeout(tick2,200)};tick2();return()=>{stop=true}}
    
    const tick=async()=>{if(stop)return;try{const r=await be("query",{path:q.path,w:q.w,since,uid:cur&&cur.uid});
      if(r.rows.length||first){first=false;since=r.max;next({docChanges:()=>r.rows.map(x=>({type:"modified",doc:snap(x.id,{exists:true,data:x.data})}))})}}catch(e){err&&err(e)}
      if(!stop)setTimeout(tick,250)};tick();return()=>{stop=true}}
};
})();
