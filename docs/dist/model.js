'use strict';
const GITHUB_URL="https://github.com/AhmetCavus";
const markURL="assets/assma.svg";
const nowDate=new Date();
const initialTitle="Senior Android Engineer";
const profileBase={name:"Mara Linden",email:"mara@linden.example",location:"Düsseldorf",role:"Android Engineer",summary:["Ich entwickle barrierearme Android-Oberflächen und Offline-Abläufe für Gesundheit und Mobilität.","I build accessible Android interfaces and offline workflows for healthcare and transport."]};
const sampleRefs=[
 {id:"E01",org:"Juniper Health",years:"2023–2025",role:"Mobile Engineer",skills:"Kotlin · Jetpack Compose · Offline-first",body:["Patienten-Check-in mit Kotlin und Compose entwickelt. Eine lokale Warteschlange puffert Eingaben ohne Netz.","Built a Kotlin and Compose patient check-in flow with a local queue for offline submissions."]},
 {id:"E02",org:"Kite Transit",years:"2021–2023",role:"Android Engineer",skills:"Accessibility · TalkBack",body:["TalkBack-Semantik implementiert und den Ticketkauf mit dem Screenreader getestet.","Implemented TalkBack semantics and tested ticket purchasing with a screen reader."]},
 {id:"E03",org:"Atelier Tools",years:"2019–2021",role:"Integration Engineer",skills:"CI · REST",body:["Release-Prüfungen in der CI ergänzt und REST-Endpunkte angebunden.","Added release checks to CI and integrated REST endpoints."]}
];
const brief=["Entwickle eine Android-App für den Patienten-Check-in. Gesucht werden Kotlin und Jetpack Compose, Offline-first-Abläufe und mit TalkBack getestete Oberflächen. Release-Verantwortung und FHIR R4 sind wünschenswert. Düsseldorf, 80 % remote, sechs Monate.","Build an Android patient check-in app. Kotlin and Jetpack Compose, offline-first workflows and TalkBack-tested interfaces are required. Release ownership and FHIR R4 are preferred. Düsseldorf, 80% remote, six months."];
const examples=[
 {id:"aster",title:initialTitle,company:"Aster Care",agency:"Northline Talent",contact:"Jonas Klein",email:"jonas@northline.example",tech:"Kotlin · Compose",url:"https://aster.example/projects/android",status:"review",when:"2026-11-18T10:24",due:"2026-11-20",score:8,channel:"email",archived:false},
 {id:"grove",title:"Kotlin Platform Engineer",company:"Grove Ledger",tech:"Kotlin · Spring",contact:"Eli Park",email:"eli@grove.example",status:"sent",when:"2026-11-12T14:05",due:"2026-11-19",score:7,channel:"portal",archived:false},
 {id:"morrow",title:"Mobile Tech Lead",company:"Morrow Rail",tech:"Android · CI",status:"interview",when:"2026-11-17T15:20",due:"2026-11-24",score:7,channel:"email",archived:false},
 {id:"oriel",title:"Full-stack Engineer",company:"Oriel Labs",tech:"TypeScript · React",status:"captured",when:"2026-11-19T09:10",due:"",score:0,archived:false},
 {id:"cedar",title:"Backend Engineer",company:"Cedar Works",tech:"Node.js · SQL",status:"closed",when:"2026-11-06T17:20",due:"",score:6,channel:"portal",archived:true}
];
const demoDay="2026-11-20";
const names={captured:["Erfasst","Captured"],sent:["Beworben","Submitted"],review:["In Prüfung","In review"],interview:["Interview","Interview"],closed:["Abgeschlossen","Closed"]};
const S={lang:"de",theme:"dark",selected:"aster",view:"home",scene:0,activeFilter:"all",archived:false,search:"",channel:"email",captureMode:"link",captureSuggested:false,savedBrief:"",fields:null,projects:structuredClone(examples),profile:structuredClone(profileBase),refs:structuredClone(sampleRefs),included:["E01","E02"],cvSummary:null,imported:[true,true,true],chat:[],chatOpen:false,chatBusy:false,localModel:"",drawer:false,portalFile:"sample",customFile:null,portalTime:"2026-11-18T10:24",entrySelection:null,snapshots:{},notes:{aster:[{date:"2026-11-19",body:["Jonas hat das Profil an den Endkunden weitergegeben.","Jonas passed the profile to the end client."]}]},mdFile:null,captureNeedsPaste:false,assistantRequest:0};
try{S.lang=localStorage.getItem("assma.lang")==="en"?"en":"de";S.theme=localStorage.getItem("assma.theme")==="light"?"light":"dark"}catch{}
function L(de,en){return S.lang==="de"?de:en}
function T(v){return Array.isArray(v)?v[S.lang==="de"?0:1]:v??""}
function h(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
const project=()=>S.projects.find(p=>p.id===S.selected)||S.projects[0];
function formatDate(v,time=false){if(!v)return "–";const d=new Date(v.length===10?v+'T12:00:00':v);if(Number.isNaN(d.getTime()))return v;return new Intl.DateTimeFormat(S.lang==="de"?"de-DE":"en-GB",time?{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}:{day:"2-digit",month:"short",year:"numeric"}).format(d)}
function captureDefaults(){return {title:"",company:"",agency:"",contact:"",email:"",tech:"",url:"",text:"",required:"",preferred:"",terms:""}}
function fillExample(){S.fields={...captureDefaults(),...examples[0],text:T(brief),tech:"Kotlin, Jetpack Compose, Android",required:L("Kotlin und Compose, Offline-first-Android, Barrierefreiheit mit TalkBack","Kotlin and Compose, offline-first Android, TalkBack accessibility"),preferred:L("Release-Verantwortung, FHIR R4","Release ownership, FHIR R4"),terms:L("Düsseldorf · 80 % remote · 6 Monate","Düsseldorf · 80% remote · six months")};S.captureSuggested=true;S.captureNeedsPaste=false}
function snapshotData(p,channel,when){const evidence=S.refs.filter(r=>S.included.includes(r.id)).sort((a,b)=>S.included.indexOf(a.id)-S.included.indexOf(b.id));return {project:structuredClone(p),channel,when,name:S.profile.name,email:S.profile.email,location:S.profile.location,role:S.profile.role,summary:S.cvSummary||T(S.profile.summary),refs:structuredClone(evidence.map(r=>({...r,body:T(r.body)}))),assessment:structuredClone(assess(p)),score:getScore(assess(p)),source:p.text||(p.id==="aster"?T(brief):p.title),fileName:null,fileBytes:null,recipient:p.email||"",message:""}}
function cvText(s){return ["# "+s.name,s.role+" · "+s.location+" · "+s.email,s.summary,...s.refs.map(r=>"## "+r.org+" · "+r.years+"\n"+r.role+"\n\n"+r.body+"\n\n"+r.skills)].join("\n\n")+"\n"}
async function cvBytes(s){const {PDFDocument,StandardFonts,rgb}=PDFLib;const pdf=await PDFDocument.create(),normal=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);let page=pdf.addPage([595,842]),y=775;
function draw(text,size,weight=false){const font=weight?bold:normal;const sanitized=String(text).replace(/[\u2010-\u2014]/g,"-").replace(/[^\x20-\x7e\xa0-\xff]/g," ");let row="";for(const word of sanitized.split(/\s+/)){if(row&&font.widthOfTextAtSize(row+" "+word,size)>486){line(row);row=word}else row+=(row?" ":"")+word}if(row)line(row);function line(r){if(y<58){page=pdf.addPage([595,842]);y=775}page.drawText(r,{x:52,y,size,font,color:weight?rgb(.21,.14,.29):rgb(.15,.13,.13)});y-=size*1.5}}
pdf.setTitle(s.name+" · "+s.project.title);pdf.setAuthor(s.name);draw(s.name,29,true);draw(s.role,16,true);draw(s.location+" · "+s.email,11);y-=20;draw(s.summary,13);y-=25;
for(const r of s.refs){draw(r.org+"   "+r.years,16,true);draw(r.role,11);draw(r.body,13);draw(r.skills,11);y-=19}
return await pdf.save()}
function blobDownload(data,type,name){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2500)}
function cvName(p){return (S.profile.name+"_"+p.company).replace(/[^a-zA-Z0-9_\-]/g,"-")+".pdf"}
let seedReady;
async function seedSnapshots(){const seeded=Object.fromEntries(Object.entries(S.snapshots));for(const p of S.projects.filter(x=>x.channel)){if(seeded[p.id])continue;const s=snapshotData(p,p.channel,p.when);s.message=p.id==="aster"?L("Anbei mein Profil für das Android-Projekt.","Please find my profile for the Android project attached."):"";if(p.channel==="email"){s.fileName=cvName(p);s.fileBytes=await cvBytes(s)}S.snapshots[p.id]??=s}}

