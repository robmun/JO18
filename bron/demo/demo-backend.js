/* Recepten — demo-backend (komt vóór de app in demo/index.html).
 *
 * De demo draait op precies dezelfde app-code als het echte kookboek, maar praat niet met
 * Firebase. In plaats daarvan:
 *   1. Alle opslag in de browser krijgt het voorvoegsel "demo_" (localStorage én IndexedDB).
 *      De demo staat op hetzelfde adres (robmun.github.io) als de echte app; zonder dit zou
 *      een gezinslid dat de demo opent zijn eigen bewaarde recepten en toestel-id overschrijven.
 *   2. window.__be is een kleine database in het geheugen met de voorbeeldrecepten
 *      (window.__DEMO_DOCS, gevuld door build_demo.py). De nagemaakte Firebase uit bron/test
 *      (fakefb-page.js) roept deze aan, net als in de tests.
 *   3. Het kookboek zelf is alleen-lezen: recepten, foto's en de gezinslijst wijzigen wordt
 *      geweigerd. Wat van de bezoeker zelf is (favorieten, boodschappenlijst, eigen notities,
 *      duimen, cijfers) mag wel, en blijft alleen in deze browser.
 */
(()=>{
  "use strict";
  const P="demo_";

  // ── 1. Eigen opslag voor de demo ──
  try{
    const S=Storage.prototype,g=S.getItem,s=S.setItem,r=S.removeItem,k=S.key;
    S.getItem=function(x){return g.call(this,P+x)};
    S.setItem=function(x,v){return s.call(this,P+x,v)};
    S.removeItem=function(x){return r.call(this,P+x)};
    // clear() mag nooit de gegevens van de echte app wissen: alleen de demo-sleutels
    S.clear=function(){const weg=[];for(let i=0;i<this.length;i++){const n=k.call(this,i);if(n&&n.startsWith(P))weg.push(n)}weg.forEach(n=>r.call(this,n))};
  }catch(e){}
  try{
    const F=IDBFactory.prototype,o=F.open,d=F.deleteDatabase;
    F.open=function(n,v){return v===undefined?o.call(this,P+n):o.call(this,P+n,v)};
    F.deleteDatabase=function(n){return d.call(this,P+n)};
  }catch(e){}

  // ── 2. De gast ──
  const UID="U_gast",EMAIL="gast@demo.recepten";
  const lees=(x,def)=>{try{const v=localStorage.getItem(x);return v==null?def:JSON.parse(v)}catch(e){return def}};
  const schrijf=(x,v)=>{try{localStorage.setItem(x,JSON.stringify(v))}catch(e){}};
  let dev=lees("rb_device","");
  if(!dev){dev="demo-"+Date.now().toString(36)+Math.random().toString(36).slice(2,8);schrijf("rb_device",dev)}
  schrijf("__fakeauth",{uid:UID,email:EMAIL});

  // ── 3. De database ──
  const docs=new Map();let ver=0;
  const zet=(path,data)=>docs.set(path,{data,ver:++ver});
  Object.entries(window.__DEMO_DOCS||{}).forEach(([p,d])=>zet(p,d));
  // wat de gast zelf bewaarde (favorieten, boodschappen, notities) terugzetten
  const EIGEN=p=>p==="users/"+UID||p.startsWith("users/"+UID+"/")||p==="gedeeld/"+UID;
  Object.entries(lees("be_eigen",{})).forEach(([p,d])=>zet(p,d));
  if(!docs.has("users/"+UID))zet("users/"+UID,{naam:"Gast",email:EMAIL,deviceId:dev});
  else{const u=docs.get("users/"+UID).data;u.deviceId=dev}
  const bewaar=()=>{const o={};docs.forEach((v,p)=>{if(EIGEN(p))o[p]=v.data});schrijf("be_eigen",o)};

  const resolve=(v,now)=>{if(v&&typeof v==="object"){if(v.__st)return{__ts:now};if(Array.isArray(v))return v.map(x=>resolve(x,now));const o={};for(const k in v)o[k]=resolve(v[k],now);return o}return v};
  const diep=(o,n)=>{const uit={...o};for(const k in n){const v=n[k];
    uit[k]=(v&&typeof v==="object"&&!Array.isArray(v)&&!v.__ts&&o&&o[k]&&typeof o[k]==="object"&&!Array.isArray(o[k]))?diep(o[k],v):v}return uit};
  const NEE={__err:"permission-denied"};
  function write(path,data,merge,mustExist){
    // de eigen naam in de gezinslijst mag (dat doet de app bij elke start), verder niets daar
    const eigenNaam=path==="gezin/leden"&&Object.keys(data||{}).every(k=>k===UID);
    if(!EIGEN(path)&&!eigenNaam)return NEE;   // het kookboek zelf: alleen bekijken
    const old=docs.get(path);if(mustExist&&!old)return{__err:"not-found"};
    const d=resolve(data,Date.now());
    zet(path,(merge||mustExist)&&old?diep(old.data,d):d);bewaar();return{ok:1};
  }
  const kinderen=path=>{const n=path.split("/").length+1;return[...docs].filter(([k])=>k.startsWith(path+"/")&&k.split("/").length===n)};
  const api={
    signIn:()=>({uid:UID}),
    get:({path})=>{const d=docs.get(path);return{exists:!!d,data:d&&d.data}},
    list:({path,w})=>kinderen(path).filter(([k,v])=>!w||w.op!=="=="||v.data[w.f]===w.v).map(([k,v])=>({id:k.split("/").pop(),data:v.data})),
    del:()=>NEE,
    set:({path,data,merge})=>write(path,data,merge,false),
    update:({path,data})=>write(path,data,true,true),
    batch:({ops})=>{for(const o of ops)if(!EIGEN(o.path))return NEE;for(const o of ops)write(o.path,o.data,o.merge,false);return{ok:1}},
    query:({path,w,since})=>{let max=since;
      const rows=kinderen(path).filter(([k,v])=>v.ver>since&&(!w||((v.data[w.f]||{}).__ts||0)>((w.v&&w.v.__ts)||0)))
        .map(([k,v])=>{if(v.ver>max)max=v.ver;return{id:k.split("/").pop(),data:v.data}});return{rows,max}},
  };
  // JSON heen en terug, zodat de app nooit een verwijzing naar de interne gegevens krijgt (zoals bij een echte server)
  window.__be=(op,p)=>new Promise(res=>setTimeout(()=>res(JSON.parse(JSON.stringify(api[op](JSON.parse(JSON.stringify(p||{})))||null))),15));
})();
