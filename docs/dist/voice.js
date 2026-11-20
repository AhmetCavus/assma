'use strict';
const dictation = {phase:"idle", message:"", interim:"", session:null, localWhisper:false, packLang:""};
const speechLocale = () => S.lang === "de" ? "de-DE" : "en-US";
const recognizer = () => window.SpeechRecognition || window.webkitSpeechRecognition;
function voiceStatus(phase, message="") {
  dictation.phase=phase;
  dictation.message=message;
  renderAssistant();
}
function stopTracks(session) {
  session.stream?.getTracks().forEach(track=>track.stop());
}
function clearAudio(session, abort=false) {
  if (!session) return;
  clearTimeout(session.timeout);
  if (abort) {
    session.controller.abort();
    try { session.engine?.abort(); } catch {}
    if (session.recorder?.state==="recording") session.recorder.stop();
  }
  stopTracks(session);
}
function cancelDictation() {
  const session=dictation.session;
  dictation.session=null;
  dictation.packLang="";
  dictation.interim="";
  dictation.message="";
  dictation.phase="idle";
  clearAudio(session,true);
}
function failVoice(session, message, phase="error") {
  if (dictation.session !== session) return;
  cancelDictation();
  if(phase==="pack") dictation.packLang=speechLocale();
  voiceStatus(phase,message);
}
function finishTranscript(session,text) {
  if(dictation.session!==session) return;
  clearAudio(session);
  dictation.session=null;
  dictation.interim="";
  const question=text.trim().slice(0,1500);
  if(!question){voiceStatus("error",L("Ich habe keine Worte erkannt. Versuche es noch einmal.","I couldn’t hear any words. Try again."));return}
  dictation.phase="idle";
  dictation.message="";
  ask(question,null);
}
function noLocalVoice() {
  return L("Hier ist keine lokale Spracherkennung verfügbar. Du kannst mit / schreiben oder in der lokalen Installation Whisper verwenden.","On-device recognition is unavailable here. Type with / or use Whisper in your local installation.");
}
function voiceError(error) {
  if(["not-allowed","service-not-allowed","NotAllowedError","SecurityError"].includes(error)) return L("Der Mikrofonzugriff ist gesperrt. Erlaube ihn in den Website-Einstellungen deines Browsers.","Microphone access is blocked. Allow it in this site’s browser settings.");
  if(["audio-capture","NotFoundError","NotReadableError"].includes(error)) return L("Kein Mikrofon erreichbar. Prüfe das gewählte Eingabegerät.","Microphone unavailable. Check your selected input device.");
  if(error==="no-speech") return L("Ich habe keine Worte erkannt. Halte die Leertaste beim Sprechen gedrückt.","I couldn’t hear any words. Hold Space while speaking.");
  if(error==="language-not-supported") return noLocalVoice();
  return L("Die Spracheingabe wurde unterbrochen. Versuche es erneut oder schreibe mit /.","Voice input was interrupted. Try again or type with /.");
}
function stopNative(session) {
  clearTimeout(session.timeout);
  session.timeout=setTimeout(()=>{if(session.text)finishTranscript(session,session.text);else failVoice(session,voiceError("no-speech"))},6500);
  try {session.engine.stop()} catch {}
}
function beginNative(session, engine) {
  session.engine=engine;
  engine.processLocally=true;
  engine.lang=session.lang;
  engine.interimResults=true;
  engine.continuous=session.mode==="hold";
  engine.onstart=()=>{
    if(dictation.session!==session)return;
    if(session.released){stopNative(session);return}
    voiceStatus("listening");
  };
  engine.onresult=event=>{
    if(dictation.session!==session)return;
    const parts=Array.from(event.results);
    session.text=parts.filter(p=>p.isFinal).map(p=>p[0].transcript).join(" ").trim();
    dictation.interim=parts.map(p=>p[0].transcript).join(" ").trim();
    const heard=document.querySelector("#dock-transcript");
    if(heard)heard.textContent=dictation.interim;
  };
  engine.onerror=event=>failVoice(session,voiceError(event.error));
  engine.onend=()=>{
    if(dictation.session!==session)return;
    session.ended=true;
    if(session.mode==="toggle"||session.released)finishTranscript(session,session.text);
    else voiceStatus("held");
  };
  engine.start();
}
async function beginRecorder(session) {
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){
    failVoice(session,noLocalVoice());return;
  }
  const type=["audio/webm;codecs=opus","audio/mp4","audio/ogg;codecs=opus"].find(t=>MediaRecorder.isTypeSupported(t));
  if(!type){failVoice(session,noLocalVoice());return}
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  if(dictation.session!==session){stream.getTracks().forEach(t=>t.stop());return}
  session.stream=stream;
  const recorder=new MediaRecorder(stream,{mimeType:type});
  session.recorder=recorder;
  const chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  recorder.onerror=()=>failVoice(session,voiceError("audio-capture"));
  recorder.onstop=async()=>{
    stopTracks(session);
    if(dictation.session!==session)return;
    const audio=new Blob(chunks,{type});
    if(!audio.size){failVoice(session,voiceError("no-speech"));return}
    voiceStatus("processing");
    try{
      const res=await fetch("./api/assma/transcribe",{method:"POST",headers:{"Content-Type":type,"X-Assma-Language":session.lang},body:audio,signal:session.controller.signal});
      if(!res.ok)throw Error();
      const data=await res.json();
      finishTranscript(session,String(data.text||""));
    }catch{failVoice(session,L("Die lokale Transkription ist fehlgeschlagen. Prüfe Whisper oder schreibe mit /.","Local transcription failed. Check Whisper or type with /."))}
  };
  recorder.start();
  voiceStatus("listening");
}
async function startDictation(mode="toggle") {
  if(dictation.session||dictation.phase==="installing")return;
  stopReply();
  cancelDictation();
  S.chatOpen=true; dock.writing=false; dock.history=false;
  const session={mode,lang:speechLocale(),text:"",released:false,ended:false,controller:new AbortController()};
  dictation.session=session;
  voiceStatus("starting");
  session.timeout=setTimeout(()=>{if(dictation.session===session)releaseDictation()},60000);
  try{
    if(dictation.localWhisper){await beginRecorder(session);return}
    const Rec=recognizer(), engine=Rec?new Rec():null;
    if(!engine||!("processLocally" in engine)){failVoice(session,noLocalVoice());return}
    if(typeof Rec.available==="function"){
      const availability=await Rec.available({langs:[session.lang],processLocally:true});
      if(dictation.session!==session)return;
      if(availability==="downloadable"||availability==="downloading"){
        failVoice(session,L("Für die lokale Spracherkennung braucht dein Browser das deutsche Sprachpaket.","Your browser needs the English language pack for on-device recognition."),"pack");return;
      }
      if(availability!=="available"){failVoice(session,noLocalVoice());return}
    }
    beginNative(session,engine);
  }catch(e){failVoice(session,voiceError(e.name))}
}
function releaseDictation() {
  const s=dictation.session;
  if(!s||s.released)return;
  s.released=true;
  clearTimeout(s.timeout);
  if(s.ended){finishTranscript(s,s.text);return}
  if(s.recorder?.state==="recording"){voiceStatus("processing");s.recorder.stop();return}
  if(s.engine){voiceStatus("processing");stopNative(s);return}
  cancelDictation();renderAssistant();
}
async function installVoicePack() {
  const Rec=recognizer(),lang=dictation.packLang;
  if(!lang||typeof Rec?.install!=="function")return;
  voiceStatus("installing",L("Das Sprachpaket wird installiert …","Installing the language pack …"));
  try{
    const ok=await Rec.install({langs:[lang],processLocally:true});
    if(dictation.phase!=="installing"||dictation.packLang!==lang)return;
    dictation.packLang="";
    voiceStatus(ok?"notice":"error",ok?L("Das Sprachpaket ist bereit. Halte die Leertaste zum Sprechen.","Language pack ready. Hold Space to speak."):noLocalVoice());
  }catch{if(dictation.phase==="installing"&&dictation.packLang===lang)voiceStatus("error",noLocalVoice())}
}
function toggleDictation(){if(dictation.session)releaseDictation();else startDictation("toggle")}
function localReadingVoice(){
  const voices=window.speechSynthesis?.getVoices()||[];
  return voices.find(v=>v.localService&&v.lang.toLowerCase()===speechLocale().toLowerCase())||voices.find(v=>v.localService&&v.lang.toLowerCase().startsWith(S.lang));
}
function toggleReading() {
  if(!dock.readAloud&&!localReadingVoice()){toast(L("Für das Vorlesen fehlt eine lokale Stimme in dieser Sprache.","A local voice for this language is unavailable."));return}
  dock.readAloud=!dock.readAloud;
  try{localStorage.setItem("assma.read",dock.readAloud?"yes":"no")}catch{}
  if(!dock.readAloud)window.speechSynthesis?.cancel();
  toast(dock.readAloud?L("Vorlesen eingeschaltet.","Read-aloud enabled."):L("Vorlesen ausgeschaltet.","Read-aloud disabled."));
}
function readReply(text){
  const voice=localReadingVoice();
  if(!dock.readAloud||!voice||!window.SpeechSynthesisUtterance)return;
  const utterance=new SpeechSynthesisUtterance(text);
  utterance.lang=speechLocale();utterance.voice=voice;
  window.speechSynthesis.cancel();window.speechSynthesis.speak(utterance);
}

