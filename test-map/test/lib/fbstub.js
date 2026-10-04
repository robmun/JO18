// Een nagebootste Firebase die zich gedraagt als firebase-compat 10.12.2, voor zover
// de app hem gebruikt. Twee vensters op hetzelfde adres delen de gegevens via een
// BroadcastChannel, dus het is echt twee toestellen die elkaar zien — met dezelfde
// onSnapshot-stroom, dezelfde transacties en dezelfde rev-telling.
module.exports = function(uid){ return function(UID){
  const KAN='ghc-nep-firestore';
  const winkel={};                 // pad -> document
  const luisteraars={};            // pad -> [cb]
  // Twee gescheiden browseromgevingen (elk met een eigen opslag, dus een eigen
  // toestel-id) kunnen geen BroadcastChannel delen. De koppeling loopt daarom via
  // Node: __fbSend gaat naar buiten, __fbRecv komt binnen.
  const kanaal={ postMessage:m=>{ try{ window.__fbSend(JSON.stringify(m)); }catch(e){} } };

  const kopie=o=>JSON.parse(JSON.stringify(o===undefined?null:o));
  // Slecht bereik nabootsen: een vertraging op elke bewerking, en een storing waarin
  // schrijven mislukt en er niets meer binnenkomt — zoals op een sportpark.
  window.__fbVertraging=0;
  window.__fbStoring=false;
  const wacht=()=>new Promise(r=>setTimeout(r,window.__fbVertraging?Math.round(window.__fbVertraging*(0.4+Math.random())):0));
  const storing=()=>Object.assign(new Error('Failed to get document because the client is offline.'),{code:'unavailable'});
  const INC='__inc__', UNION='__union__';

  function pasToe(doel,data,merge){
    if(!merge){ for(const k of Object.keys(doel))delete doel[k]; }
    for(const sleutel of Object.keys(data)){
      const w=data[sleutel];
      // puntpad, zoals 'coaches.<uid>'
      if(sleutel.includes('.')){
        const delen=sleutel.split('.');
        let n=doel;
        for(let i=0;i<delen.length-1;i++){ if(typeof n[delen[i]]!=='object'||!n[delen[i]])n[delen[i]]={}; n=n[delen[i]]; }
        n[delen[delen.length-1]]=kopie(w); continue;
      }
      if(w&&w.__type===INC){ doel[sleutel]=(Number(doel[sleutel])||0)+w.n; continue; }
      if(w&&w.__type===UNION){ const a=Array.isArray(doel[sleutel])?doel[sleutel].slice():[];
        w.waarden.forEach(x=>{ if(!a.includes(x))a.push(x); }); doel[sleutel]=a; continue; }
      if(merge && w && typeof w==='object' && !Array.isArray(w)
         && doel[sleutel] && typeof doel[sleutel]==='object' && !Array.isArray(doel[sleutel])){
        pasToe(doel[sleutel],w,true); continue;
      }
      doel[sleutel]=kopie(w);
    }
  }
  function snap(pad){
    const d=winkel[pad];
    return { exists:!!d, id:pad.split('/').pop(),
             data:()=>d?kopie(d):undefined,
             metadata:{fromCache:false,hasPendingWrites:false} };
  }
  function meld(pad,vanBuiten){
    if(window.__fbStoring)return;        // geen bereik: er komt niets door
    (luisteraars[pad]||[]).forEach(cb=>{ try{ cb(snap(pad)); }catch(e){ console.error('luisteraar',e); } });
    if(!vanBuiten&&kanaal)try{ kanaal.postMessage({pad,doc:winkel[pad]||null}); }catch(e){}
  }
  window.__fbRecv=tekst=>{
    let m; try{ m=JSON.parse(tekst); }catch(e){ return; }
    const {pad,doc}=m||{};
    if(!pad)return;
    if(doc===null)delete winkel[pad]; else winkel[pad]=kopie(doc);
    meld(pad,true);
  };

  function doc(pad){
    return {
      _pad:pad,
      async get(){ await wacht(); if(window.__fbStoring)throw storing(); return snap(pad); },
      async set(data,opt){ await wacht(); if(window.__fbStoring)throw storing();
        if(!winkel[pad])winkel[pad]={}; pasToe(winkel[pad],data,!!(opt&&opt.merge)); meld(pad); },
      async update(data){ await wacht(); if(window.__fbStoring)throw storing();
        if(!winkel[pad])throw Object.assign(new Error('No document to update'),{code:'not-found'});
        pasToe(winkel[pad],data,true); meld(pad); },
      onSnapshot(a,b,c){
        const cb = typeof a==='function'?a:b;
        const fout = typeof a==='function'?b:c;
        (luisteraars[pad]=luisteraars[pad]||[]).push(cb);
        setTimeout(()=>{ try{ cb(snap(pad)); }catch(e){ if(fout)fout(e); } },0);
        return ()=>{ luisteraars[pad]=(luisteraars[pad]||[]).filter(x=>x!==cb); };
      }
    };
  }
  const fs=()=>({
    collection:c=>({ doc:d=>doc(c+'/'+d) }),
    runTransaction:async fn=>{
      await wacht(); if(window.__fbStoring)throw storing();
      const t={ get:r=>Promise.resolve(snap(r._pad)),
                set:(r,data,opt)=>{ if(!winkel[r._pad])winkel[r._pad]={}; pasToe(winkel[r._pad],data,!!(opt&&opt.merge)); meld(r._pad); },
                update:(r,data)=>{ pasToe(winkel[r._pad],data,true); meld(r._pad); } };
      return await fn(t);
    }
  });
  fs.FieldValue={ increment:n=>({__type:INC,n}), arrayUnion:(...w)=>({__type:UNION,waarden:w}) };

  const gebruiker={uid:UID};
  window.firebase={
    apps:[], initializeApp(){ this.apps.push({}); return {}; },
    auth:()=>({ currentUser:gebruiker, signInAnonymously:()=>Promise.resolve({user:gebruiker}) }),
    firestore:fs
  };
  window.firebase.firestore.FieldValue=fs.FieldValue;

  // Een script-element dat naar gstatic wijst wordt hier meteen 'geladen' gemeld, zodat
  // de app niet op een echte download hoeft te wachten (die is in deze omgeving geblokkeerd).
  const maakOrigineel=document.createElement.bind(document);
  document.createElement=function(naam){
    const el=maakOrigineel(naam);
    if(String(naam).toLowerCase()==='script'){
      let bron='';
      Object.defineProperty(el,'src',{configurable:true,
        get:()=>bron,
        set:v=>{ bron=v;
          if(/gstatic\.com\/firebasejs/.test(v)){ setTimeout(()=>{ try{ el.onload&&el.onload(); }catch(e){} },0); }
          else el.setAttribute('src',v); }});
    }
    return el;
  };
  // loadScript() kijkt alleen of het script er al staat; dan hoeft er niets opgehaald.
  const zet=()=>{ ['app','auth','firestore'].forEach(n=>{
      const s=document.createElement('script');
      s.src='https://www.gstatic.com/firebasejs/10.12.2/firebase-'+n+'-compat.js';
      s.dataset.nep='1'; s.type='text/plain';      // text/plain: de browser haalt niets op
      document.head.appendChild(s); }); };
  if(document.head)zet(); else document.addEventListener('DOMContentLoaded',zet);
};};
