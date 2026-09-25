import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Sparkles, ArrowUp, Plus, SlidersHorizontal, ArrowUpRight, Square, ChevronDown, ShieldCheck, MessageCircle, Cpu, Zap, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './style.css';

const providers = {openai:'OpenAI', anthropic:'Anthropic', google:'Google Gemini', ollama:'Ollama'};
const initialConfig = {provider:'openai',model:'',api_key:'',base_url:'http://host.docker.internal:11434',system_prompt:'You are a helpful, clear assistant.'};
const starters = [ ['Create something', 'Write three creative names for a sustainable clothing brand.'], ['Make it simple', 'Explain how a language model works using a simple everyday analogy.'], ['Find a fresh angle', 'Give me five unusual ideas for a weekend creative project.'] ];
const STORAGE_KEY = 'glasschat_config';
const PROVIDERS_KEY = 'glasschat_providers';

function getInitialConfig(){
 try{
  const saved = localStorage.getItem(STORAGE_KEY);
  if(saved){
   const parsed = JSON.parse(saved);
   return {...initialConfig,...parsed};
  }
 }catch(e){}
 return initialConfig;
}

async function copyToClipboard(text) {
 try {
  if (navigator?.clipboard?.writeText) {
   await navigator.clipboard.writeText(text);
  } else {
   const ta = document.createElement('textarea');
   ta.value = text;
   ta.style.position = 'fixed';
   ta.style.opacity = '0';
   document.body.appendChild(ta);
   ta.select();
   document.execCommand('copy');
   document.body.removeChild(ta);
  }
  return true;
 } catch (e) {
  return false;
 }
}

function CodeBlock({ children, ...props }){
 const [copied, setCopied] = useState(false);
 const extractText = (elem) => {
  if (!elem) return '';
  if (typeof elem === 'string') return elem;
  if (typeof elem === 'number') return String(elem);
  if (Array.isArray(elem)) return elem.map(extractText).join('');
  if (elem.props?.children) return extractText(elem.props.children);
  return '';
 };

 const codeText = extractText(children).replace(/\n$/, '');
 let lang = '';
 if (React.isValidElement(children)) {
  const match = /language-([a-zA-Z0-9_-]+)/.exec(children.props?.className || '');
  if (match) lang = match[1];
 }

 const copy = async () => {
  const ok = await copyToClipboard(codeText);
  if (ok) {
   setCopied(true);
   setTimeout(() => setCopied(false), 2000);
  }
 };

 return (
  <div className="code-block">
   <div className="code-header">
    <span className="code-lang">{lang || 'code'}</span>
    <button type="button" className={`copy-btn ${copied ? 'copied' : ''}`} onClick={copy} aria-label="Copy code">
     {copied ? <><Check size={12} /><span>Copied</span></> : <><Copy size={12} /><span>Copy</span></>}
    </button>
   </div>
   <pre {...props}>{children}</pre>
  </div>
 );
}

function ChatMessage({ m }){
 const [copied, setCopied] = useState(false);
 const copy = async () => {
  if (!m.content) return;
  const ok = await copyToClipboard(m.content);
  if (ok) {
   setCopied(true);
   setTimeout(() => setCopied(false), 2000);
  }
 };

 return (
  <article className={`message ${m.role} ${m.failed ? 'failed' : ''}`}>
   <div className="message-meta">
    {m.role === 'user' ? (
     <>
      {m.content && (
       <button
        type="button"
        className={`message-copy-btn ${copied ? 'copied' : ''}`}
        onClick={copy}
        aria-label="Copy message"
        title="Copy message"
       >
        {copied ? <><Check size={11} /><span>Copied</span></> : <><Copy size={11} /><span>Copy</span></>}
       </button>
      )}
      <span>You</span>
     </>
    ) : (
     <span className="message-author">
      <Sparkles size={13} /> {m.label || 'Assistant'}
      {m.failed && <span> · incomplete</span>}
     </span>
    )}
   </div>
   <div className="message-body">
    {m.content ? (
     <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: CodeBlock }}>
      {m.content}
     </ReactMarkdown>
    ) : (
     <span className="thinking">Thinking<span>...</span></span>
    )}
   </div>
   {m.role === 'assistant' && m.content && (
    <div className="message-actions">
     <button
      type="button"
      className={`reply-copy-btn ${copied ? 'copied' : ''}`}
      onClick={copy}
      aria-label="Copy reply"
      title="Copy reply"
     >
      {copied ? <><Check size={12} /><span>Copied</span></> : <><Copy size={12} /><span>Copy</span></>}
     </button>
    </div>
   )}
  </article>
 );
}

function App(){
 const [config,setConfig]=useState(getInitialConfig), [messages,setMessages]=useState([]), [input,setInput]=useState('');
 const [busy,setBusy]=useState(false), [error,setError]=useState(''), [settings,setSettings]=useState(false);
 const controller=useRef(null), chatScroll=useRef(null), sending=useRef(false);
 const ready=Boolean(config.model.trim() && (config.provider==='ollama' ? config.base_url.trim() : config.api_key.trim()));
 useEffect(()=>{
  if(chatScroll.current){
   chatScroll.current.scrollTo({top:chatScroll.current.scrollHeight,behavior:'smooth'});
  }
 },[messages,busy]);
 useEffect(()=>()=>controller.current?.abort(),[]);
 useEffect(()=>{
  try{
   localStorage.setItem(STORAGE_KEY,JSON.stringify(config));
   const savedProviders = JSON.parse(localStorage.getItem(PROVIDERS_KEY)||'{}');
   savedProviders[config.provider] = {
    model: config.model,
    api_key: config.api_key,
    base_url: config.base_url
   };
   localStorage.setItem(PROVIDERS_KEY,JSON.stringify(savedProviders));
  }catch(e){}
 },[config]);
 function change(field,value){setConfig(c=>({...c,[field]:value}));}
 function switchProvider(value){
  setConfig(c=>{
   try{
    const savedProviders = JSON.parse(localStorage.getItem(PROVIDERS_KEY)||'{}');
    const prev = savedProviders[value]||{};
    return {
     ...c,
     provider: value,
     model: prev.model||'',
     api_key: prev.api_key||'',
     base_url: prev.base_url||(value==='ollama'?'http://host.docker.internal:11434':c.base_url)
    };
   }catch(e){
    return {...c,provider:value,model:'',api_key:''};
   }
  });
  setError('');
 }
 function newChat(){if(busy)return;setMessages([]);setError('');setInput('');}
 async function send(e){
  e?.preventDefault(); if(sending.current || !input.trim())return;
  if(!ready){setSettings(true);setError('Add a model name and your connection details first.');return;}
  const history=[...messages.filter(m=>!m.failed && m.content),{role:'user',content:input.trim()}];
  if(history.length>100){setError('This conversation is full. Start a new chat.');return;}
  sending.current=true;setBusy(true);setError('');setInput('');
  setMessages([...history,{role:'assistant',content:'',label:`${providers[config.provider]} / ${config.model}`}]);
  controller.current=new AbortController();
  let completed=false;
  const handleEvent=(event)=>{
   if(event.type==='error')throw new Error(event.message);
   if(event.type==='done')completed=true;
   if(event.type==='token')setMessages(ms=>ms.map((m,i)=>i===ms.length-1?{...m,content:m.content+event.text}:m));
  };
  try{
   const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.current.signal,body:JSON.stringify({...config,model:config.model.trim(),messages:history.map(({role,content})=>({role,content}))})});
   if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(typeof data.detail==='string'?data.detail:'Unable to send message. Please try again.');}
   const reader=response.body.getReader(), decoder=new TextDecoder();let buffer='';
   while(true){const {value,done}=await reader.read();if(done){buffer+=decoder.decode();break;}buffer+=decoder.decode(value,{stream:true});let split;
    while((split=buffer.indexOf('\n'))!==-1){const line=buffer.slice(0,split);buffer=buffer.slice(split+1);if(line.trim())handleEvent(JSON.parse(line));}
   }
   if(buffer.trim())handleEvent(JSON.parse(buffer));
   if(!completed)throw new Error('The response ended unexpectedly. Please try again.');
  }catch(err){
   controller.current?.abort();
   const stopped=err.name==='AbortError';setError(stopped?'Response stopped. You can send another message.':err.message);
   setMessages(ms=>ms.map((m,i)=>i===ms.length-1?{...m,failed:true,content:m.content||(stopped?'Response stopped.':err.message)}:m));
  }finally{sending.current=false;setBusy(false);controller.current=null;}
 }
 return <div className="app"><div className="orb orb-one"/><div className="orb orb-two"/><div className="orb orb-three"/>
  <header><a className="brand" href="/" aria-label="Glasschat home"><span className="brand-icon"><Sparkles size={21}/></span>glasschat<span className="beta">PLAYGROUND</span></a><div className="header-right"><span className="private"><ShieldCheck size={14}/> Keys saved locally</span><button className="icon-button mobile-toggle" onClick={()=>setSettings(!settings)} aria-label="Toggle model settings"><SlidersHorizontal size={20}/></button></div></header>
  <main><aside className={`glass sidebar ${settings?'open':''}`}><div className="panel-heading"><span className="eyebrow">YOUR WORKSPACE</span><SlidersHorizontal size={16}/></div><h2>Make it yours.</h2><p className="muted intro">Your model. Your conversation.</p>
   <button className="new-chat" onClick={newChat} disabled={busy}><Plus size={17}/> New conversation <span>↗</span></button>
   <div className="divider"/><div className="section-label"><Cpu size={15}/> MODEL CONNECTION</div>
   <fieldset disabled={busy}><label htmlFor="provider">Provider</label><div className="select-wrap"><select id="provider" value={config.provider} onChange={e=>switchProvider(e.target.value)}>{Object.entries(providers).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select><ChevronDown size={16}/></div>
   <label htmlFor="model">Model name</label><input id="model" value={config.model} onChange={e=>change('model',e.target.value)} placeholder={config.provider==='ollama'?'e.g. qwen2.5-coder:1.5b':'Enter an available model ID'} autoComplete="off"/>
   {config.provider==='ollama'?<><label htmlFor="url">Ollama server URL</label><input id="url" type="url" value={config.base_url} onChange={e=>change('base_url',e.target.value)}/><p className="field-hint">For Docker, use host.docker.internal to reach Ollama on your computer.</p></>:<><label htmlFor="key">API key <span>SAVED LOCALLY</span></label><input id="key" type="password" value={config.api_key} onChange={e=>change('api_key',e.target.value)} placeholder="Paste your API key" autoComplete="off"/><p className="field-hint">Stored in browser local storage and sent to the backend for your requests.</p></>}
   <details><summary>Assistant instructions</summary><textarea aria-label="Assistant instructions" value={config.system_prompt} onChange={e=>change('system_prompt',e.target.value)} rows={4} maxLength={4000}/></details></fieldset>
   <div className="sidebar-footer"><span className={`status-dot ${ready?'ready':''}`}/><span>{ready?'Configured · not yet verified':'Waiting for connection details'}</span></div>
  </aside>
  <section className="glass chat-panel"><div className="chat-header"><div className="chat-title"><MessageCircle size={17}/><span>Conversation</span></div><span className="model-badge"><span className="status-dot"/>{providers[config.provider]}</span></div>
     <div className="chat-scroll" ref={chatScroll} aria-live="polite" aria-busy={busy}>{messages.length===0?<div className="welcome"><div className="hero-symbol"><Sparkles size={34}/></div><div className="eyebrow hero-eyebrow">A LITTLE SPACE FOR BIG IDEAS</div><h1>A clearer<br/><span>conversation.</span></h1><p>Think out loud. Follow your curiosity.<br/>Bring your favorite model along.</p><div className="starters">{starters.map(([title,prompt],i)=><button key={title} onClick={()=>setInput(prompt)}><span className="starter-icon">{i===0?<Sparkles size={17}/>:i===1?<Zap size={17}/>:<MessageCircle size={17}/>}</span><strong>{title}</strong><ArrowUpRight size={15}/></button>)}</div></div>:<div className="messages">{messages.map((m,i)=><ChatMessage key={i} m={m}/>)}</div>}</div>
   <div className="composer-area">{error&&<div className="error" role="alert">{error}</div>}<form onSubmit={send} className="composer"><textarea aria-label="Message" placeholder="Where should we begin?" value={input} onChange={e=>setInput(e.target.value)} rows={2} maxLength={32000} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/><div className="composer-bottom"><span><Sparkles size={13}/> {config.model||'Choose a model to get started'}</span>{busy?<button type="button" className="send" aria-label="Stop response" onClick={()=>controller.current?.abort()}><Square size={16}/></button>:<button type="submit" className="send" aria-label="Send message" disabled={!input.trim()}><ArrowUp size={20}/></button>}</div></form><div className="composer-note">Enter to send · Shift + Enter for a new line <span>AI can make mistakes. Stay curious.</span></div></div>
  </section></main><footer><span>BUILT FOR YOUR TRAIN OF THOUGHT</span><span>LangChain <b>·</b> FastAPI <b>·</b> React</span></footer>
 </div>
}
createRoot(document.getElementById('root')).render(<App/>);
