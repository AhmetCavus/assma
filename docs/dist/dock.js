'use strict';
const dock={tucked:false,writing:false,history:false,draft:"",readAloud:false,request:null,routeKey:null,context:null};
try{dock.tucked=localStorage.getItem("assma.dock")==="tucked";dock.readAloud=localStorage.getItem("assma.read")==="yes"}catch{}
Object.assign(shapes,{
  keyboard:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5.5 9h.1m3.6 0h.1m3.6 0h.1m3.6 0h.1M6 12h.1m3 0h.1m3 0h.1m3 0h.1M8 15h8"/>',
  chat:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-6 5z"/>',
  down:'<path d="m5 9 7 7 7-7"/>',mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5.5 10a6.5 6.5 0 0 0 13 0M12 17v5m-4 0h8"/>',
  bars:'<path d="M4 20V11m7 9V4m7 16v-7"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'
});
function setTucked(value){dock.tucked=value;try{localStorage.setItem("assma.dock",value?"tucked":"open")}catch{}}
function stopReply(){
  if(dock.request){dock.request.abort();dock.request=null}
  if(S.chatBusy){S.chatBusy=false;S.assistantRequest++}
  window.speechSynthesis?.cancel();
}
function resetDockContext(){
  cancelDictation();stopReply();dock.draft="";dock.writing=false;dock.history=false;S.chat=[];
}
function syncDockRoute(){
  const view=navRequest(), key=location.hash, context=`${S.lang}|${S.selected}`;
  if(key!==dock.routeKey){
    const previous=dock.routeKey;
    resetDockContext();
    dock.routeKey=key;
    const requested=new URLSearchParams(key.split("?")[1]||"").get("assma");
    S.chatOpen=requested==="chat"||requested==="shortcuts"||(view!=="home"&&!dock.tucked);
    if(requested==="shortcuts")queueMicrotask(()=>{if(location.hash===key&&!document.querySelector("dialog[open]"))showShortcuts()});
    if(previous!==null)document.querySelector("dialog[open]")?.close();
  }else if(dock.context!==context){resetDockContext()}
  dock.context=context;
}
function openDock(write=false){
  setTucked(false);S.chatOpen=true;
  if(write){cancelDictation();dock.writing=true;dock.history=false}
  renderAssistant();
  document.querySelector(write?"#chat-message":"#guide-panel")?.focus({preventScroll:true});
}
function tuckDock(){
  cancelDictation();stopReply();dock.writing=false;dock.history=false;S.chatOpen=false;setTucked(true);
  renderAssistant();document.querySelector(".dock-launch")?.focus({preventScroll:true});
}
function dockSuggestion(){
  let p=project();
  const view=S.view;
  if(view==="dashboard"){
    const due=S.projects.filter(x=>!x.archived&&x.channel&&x.status!=="closed"&&x.due&&x.due<=demoDay).sort((a,b)=>a.due.localeCompare(b.due))[0];
    if(due){
      const company=due.company;
      return {line:L(`Bei ${company} steht die Rückmeldung zu „${due.title}“ an. Möchtest du bei ${due.contact||company} nachhaken?`,`A follow-up is due for “${due.title}” at ${company}. Ready to check in with ${due.contact||company}?`),actions:btn(L("Nachfassen","Follow up"),"pick-note","primary","mail",due.id)+btn(L("Bewerbung ansehen","View application"),"pick-record","","",due.id)};
    }
    return {line:L("Deine Wiedervorlagen sind erledigt. Sollen wir ein neues Projekt erfassen?","Your follow-ups are up to date. Shall we capture a new opportunity?"),actions:btn(L("Projekt erfassen","Capture project"),"new-opportunity","primary","plus")};
  }
  if(view==="progress")return {line:L("Hier siehst du, wann du Bewerbungen verschickt hast und über welchen Kanal. Soll ich den gewählten Zeitraum zusammenfassen?","See when you submitted applications and which channel you used. Shall I summarise this period?"),actions:btn(L("Zeitraum zusammenfassen","Summarise period"),"ask","primary","spark","stats")};
  const question=contextPrompts()[0];
  let label=L("Mit assma prüfen","Review with assma"),line=question[0];
  if((view==="home"||view==="fit")&&p){line=L(`Welche deiner Erfahrungen passen zu „${p.title}“ bei ${p.company}?`,`Which of your experiences match “${p.title}” at ${p.company}?`);label=L("Passung erklären","Explain fit")}
  else if(view==="cv"){label=L("Referenzen vorschlagen","Suggest references")}
  else if(view==="snapshot"||view==="application"){label=L("Fassung prüfen","Check submission")}
  return {line,actions:btn(label,"ask","primary","spark",question[1])+btn(L("Frage schreiben","Write a question"),"write")};
}
function toolButton(action,label,icon,extra=""){return `<button type="button" class="dock-tool" data-act="${action}" aria-label="${h(label)}" title="${h(label)}" ${extra}>${ic(icon)}</button>`}
function keyHint(action,key,label,ariaKeys=""){return `<button type="button" class="key-hint" data-act="${action}" ${ariaKeys?`aria-keyshortcuts="${ariaKeys}"`:""}><kbd>${h(key)}</kbd><span>${h(label)}</span></button>`}
function dockHistory(){
  if(!dock.history)return "";
  return `<section id="dock-history" class="dock-history"><div class="history-title"><h2>${L("Gespräch mit assma","Conversation with assma")}</h2><small>${h(S.localModel||L("Beispieldemo","Sample demo"))}</small></div><div class="history-messages" role="log">${S.chat.length?S.chat.map(m=>`<div class="history-message ${m.who==="user"?"mine":""}"><b>${m.who==="user"?L("Du","You"):"assma"}</b><p>${h(m.text)}</p></div>`).join(""):`<p class="hint">${L("Hier erscheinen deine Fragen und assmas Antworten.","Your questions and assma’s replies appear here.")}</p>`}</div></section>`;
}
function dockBody(){
  const phase=dictation.phase;
  if(["starting","listening","held","processing"].includes(phase)){
    const line=phase==="starting"?L("Mikrofon wird vorbereitet …","Preparing the microphone …"):phase==="processing"?L("assma transkribiert …","assma is transcribing …"):phase==="held"?L("Leertaste loslassen, um die Frage zu stellen.","Release Space to ask your question."):L("assma hört zu …","assma is listening …");
    const help=dictation.session?.mode==="hold"?L("Zum Abschließen die Leertaste loslassen.","Release Space to finish."):L("Tippe erneut auf die Traube, wenn du fertig bist.","Tap the grapes again when you are finished.");
    return `<p class="dock-line" role="status">${h(line)}</p><p id="dock-transcript">${h(dictation.interim)}</p><p class="dock-tip">${h(help)}</p>`;
  }
  if(dictation.message&&!dock.writing)return `<p class="dock-line" role="status">${h(dictation.message)}</p><div class="dock-actions">${phase==="pack"&&typeof recognizer()?.install==="function"?btn(L("Sprachpaket laden","Install language pack"),"voice-pack","primary","download"):""}${btn(L("Frage schreiben","Write a question"),"write")}</div>`;
  if(dock.writing)return `<label class="dock-line" for="chat-message">${L("Was möchtest du assma fragen?","What would you like to ask assma?")}</label><form class="dock-compose" id="chat-form"><input id="chat-message" name="message" class="in" maxlength="1500" required autocomplete="off" placeholder="${L("Deine Frage …","Your question …")}" value="${h(dock.draft)}"><button class="btn primary" type="submit" aria-label="${L("Frage senden","Send question")}">${ic("send")}</button></form>`;
  const last=S.chat.at(-1),question=S.chat.at(-2);
  if(S.chatBusy)return `<p class="dock-small">${h(last?.text)}</p><p class="dock-line" role="status">${L("assma prüft …","assma is checking …")}</p>`;
  if(last?.who==="assistant"){
    return `<p class="dock-small"><b>${L("DU","YOU")}</b> ${h(question?.text||"")}</p><p class="dock-line answer" aria-live="polite">${h(last.text)}</p><div class="dock-actions">${last.to?linkBtn(routeNames()[last.to]||L("Ansehen","View"),last.to,"primary"):""}${btn(L("Weiterfragen","Ask another question"),"write")}</div>`;
  }
  const n=dockSuggestion();return `<p class="dock-line">${h(n.line)}</p><div class="dock-actions">${n.actions}</div>`;
}
const dockSize=typeof ResizeObserver!=="undefined"?new ResizeObserver(entries=>{
  document.documentElement.style.setProperty("--dock-height",Math.ceil(entries[0].target.getBoundingClientRect().height)+"px");
}):null;
function renderAssistant(){
  const host=document.getElementById("assistant"),active=document.activeElement;
  const focusInside=host.contains(active),act=focusInside?active.closest("[data-act]")?.dataset.act:null;
  const editing=active.id==="chat-message",caret=editing?[active.selectionStart,active.selectionEnd]:null;
  dockSize?.disconnect();
  document.body.dataset.dock=S.chatOpen?"open":"closed";
  if(!S.chatOpen){
    const label=L("assma öffnen","Open assma");
    host.innerHTML=`<button class="dock-launch" type="button" data-act="guide" aria-controls="guide-panel" aria-expanded="false" aria-label="${label}" title="${label}">${mark(34)}<span aria-hidden="true"></span></button>`;return;
  }
  const speakLabel=dictation.session?L("Spracheingabe beenden","Finish voice input"):L("Mit assma sprechen","Speak to assma");
  const prompts=contextPrompts().slice(0,2);
  const busy=S.chatBusy||!!dictation.session;
  host.innerHTML=`<aside id="guide-panel" tabindex="-1" class="assma-dock" aria-label="${L("assma-Chat","assma chat")}" data-phase="${dictation.phase}">
    ${dockHistory()}<div class="dock-bar"><button type="button" class="grape-orb" data-act="voice" aria-label="${h(speakLabel)}" aria-pressed="${!!dictation.session}" title="${h(speakLabel)}">${mark(42)}<span aria-hidden="true" class="orb-ring"></span></button>
    <div class="dock-content">${dockBody()}</div><div class="dock-tools">
    ${toolButton("write",L("assma schreiben","Write to assma"),"keyboard",`aria-pressed="${dock.writing}" aria-keyshortcuts="/"`)}
    ${toolButton("history",L("Gesprächsverlauf","Conversation history"),"chat",`aria-expanded="${dock.history}"`)}
    ${toolButton("minimize",L("assma einklappen","Minimise assma"),"down")}</div></div>
    <div class="dock-bottom"><div class="dock-keys">${keyHint("voice",L("Leertaste","Space"),L("halten zum Sprechen","hold to speak"),"Space")}${keyHint("write","/",L("schreiben","type"),"/")}${keyHint("shortcuts","?",L("alle Kürzel","all shortcuts"),"?")}</div>
    <div class="dock-prompts">${prompts.map(q=>`<button type="button" class="chip" data-act="ask" data-id="${q[1]}" ${busy?"disabled":""}>${h(q[0])}</button>`).join("")}<button type="button" class="chip" data-act="brief" ${busy?"disabled":""}>${ic("spark")}${L("Kurzes Briefing","Quick briefing")}</button></div></div></aside>`;
  const panel=host.querySelector(".assma-dock");
  dockSize?.observe(panel);
  if(editing&&dock.writing){const input=host.querySelector("#chat-message");input?.focus({preventScroll:true});input?.setSelectionRange(...caret)}
  else if(focusInside)(act?host.querySelector(`[data-act="${CSS.escape(act)}"]`):panel)?.focus({preventScroll:true});
  const hist=host.querySelector(".history-messages");if(hist)hist.scrollTop=hist.scrollHeight;
}
function showShortcuts() {
  if(document.querySelector("dialog[open]"))return;
  const rows=(data)=>data.map(([key,label])=>`<div class="shortcut-row"><kbd>${h(key)}</kbd><span>${h(label)}</span></div>`).join("");
  const group=(name,data)=>`<section><h3>${h(name)}</h3>${rows(data)}</section>`;
  const groups=[
    group("assma",[[L("Leertaste","Space"),L("Gedrückt halten zum Sprechen","Hold to talk to assma")],[L("⌘ / Strg J","⌘ / Ctrl J"),L("Zuhören starten oder beenden","Start or finish listening")],["/",L("assma schreiben","Write to assma")],["V",L("Antworten vorlesen ein / aus","Toggle spoken replies")],["Esc",L("Sprache oder Antwort stoppen, Chat einklappen","Stop speech or reply, minimise chat")]]),
    group(L("Navigieren","Navigation"),[["1",L("Dashboard öffnen","Open dashboard")],["2",L("Projekte öffnen","Open projects")],["3",L("Erfahrung öffnen","Open experience")],["4",L("Fortschritt öffnen","Open progress")],["?",L("Tastenkürzel anzeigen","Show keyboard shortcuts")],["D",L("Hell / Dunkel wechseln","Toggle light / dark")]]),
    group(L("Akquise","Acquisition"),[["N",L("Neues Projekt erfassen","Capture a new project")],["F",L("Passung des gewählten Projekts","Fit of the selected project")],["C",L("CV zum Projekt öffnen","Open the CV for this project")]])
  ];
  modal(L("Tastenkürzel","Keyboard shortcuts"),`<div class="shortcut-grid">${groups.join("")}</div><p class="shortcut-foot">${L("Beim Schreiben bleiben Leertaste und Buchstaben im Textfeld.","While typing, spaces and letters stay in the text field.")}</p>`);
  document.querySelector("dialog[open]")?.classList.add("shortcut-dialog");
}
function newOpportunity(){S.fields=captureDefaults();S.captureNeedsPaste=false;S.captureSuggested=false;go("capture")}
function endDockInteraction(){
  if(dictation.session||dictation.phase!=="idle"||S.chatBusy||window.speechSynthesis?.speaking){cancelDictation();stopReply();renderAssistant();return}
  if(dock.writing||dock.history){dock.writing=false;dock.history=false;renderAssistant();document.querySelector("#guide-panel")?.focus({preventScroll:true});return}
  if(S.chatOpen)tuckDock();
}
function performDockAction(action){
  switch(action){
    case "guide":case "meet":openDock();return true;
    case "write":if(dock.writing){dock.writing=false;renderAssistant();document.querySelector("#guide-panel")?.focus({preventScroll:true})}else openDock(true);return true;
    case "history":dock.history=!dock.history;dock.writing=false;renderAssistant();return true;
    case "minimize":tuckDock();return true;
    case "shortcuts":showShortcuts();return true;
    case "voice":toggleDictation();return true;
    case "voice-pack":installVoicePack();return true;
    case "brief":ask(L("Gib mir ein kurzes Briefing.","Give me a quick briefing."),"brief");return true;
    case "new-opportunity":newOpportunity();return true;
    default:return false;
  }
}
let spaceHeld=false;
document.addEventListener("keydown",event=>{
  if(event.defaultPrevented||event.isComposing||event.keyCode===229||document.querySelector("dialog[open]"))return;
  const target=event.target,key=event.key.toLowerCase();
  if(key==="escape"&&(S.chatOpen||dictation.session)){event.preventDefault();endDockInteraction();return}
  if((event.metaKey||event.ctrlKey)&&!event.shiftKey&&!event.altKey&&key==="j"){event.preventDefault();if(!event.repeat)toggleDictation();return}
  if(event.metaKey||event.ctrlKey||event.altKey||target.closest?.("input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=textbox]"))return;
  if(event.code==="Space"||key===" "){
    if(target.closest?.("button,a,summary,video,audio,[role=button],[role=option],[role=slider]")||event.shiftKey)return;
    event.preventDefault();if(!event.repeat&&!spaceHeld&&!dictation.session){spaceHeld=true;startDictation("hold")}return;
  }
  if(event.repeat)return;
  const actions={"?":showShortcuts,"/":()=>openDock(true),v:toggleReading,d:()=>clickAction("theme"),n:newOpportunity,f:()=>project()&&go("fit"),c:()=>project()&&go("cv"),"1":()=>go("dashboard"),"2":()=>go("opportunities"),"3":()=>go("experience"),"4":()=>go("progress")};
  if(actions[key]){event.preventDefault();actions[key]()}
});
window.addEventListener("keyup",event=>{
  if((event.code==="Space"||event.key===" ")&&spaceHeld){event.preventDefault();spaceHeld=false;if(dictation.session?.mode==="hold")releaseDictation()}
});
function interruptSpeech(){spaceHeld=false;if(dictation.session){cancelDictation();renderAssistant()}window.speechSynthesis?.cancel()}
window.addEventListener("blur",interruptSpeech);window.addEventListener("pagehide",interruptSpeech);
document.addEventListener("visibilitychange",()=>{if(document.hidden)interruptSpeech()});
document.addEventListener("input",e=>{if(e.target.id==="chat-message")dock.draft=e.target.value});

