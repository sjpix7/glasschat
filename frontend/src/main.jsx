import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Sparkles, ArrowUp, Plus, SlidersHorizontal, ArrowUpRight, 
  Square, ChevronDown, ShieldCheck, MessageCircle, Cpu, Zap, 
  Copy, Check, Palette, X, Waves, Grid, Activity, TrendingUp, Clock 
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './style.css';

const providers = {openai:'OpenAI', anthropic:'Anthropic', google:'Google Gemini', ollama:'Ollama'};
const initialConfig = {provider:'openai',model:'',api_key:'',base_url:'http://host.docker.internal:11434',system_prompt:'You are a helpful, clear assistant.'};
const starters = [ ['Create something', 'Write three creative names for a sustainable clothing brand.'], ['Make it simple', 'Explain how a language model works using a simple everyday analogy.'], ['Find a fresh angle', 'Give me five unusual ideas for a weekend creative project.'] ];
const STORAGE_KEY = 'glasschat_config';
const PROVIDERS_KEY = 'glasschat_providers';
const THEME_KEY = 'glasschat_theme';
const BG_KEY = 'glasschat_bg';

const THEMES = [
  { id: 'amethyst', name: 'Amethyst Nebula', mood: 'Signature Violet', previewGradient: 'linear-gradient(135deg, #a855f7, #6366f1)' },
  { id: 'aurora', name: 'Emerald Aurora', mood: 'Cybernetic Teal', previewGradient: 'linear-gradient(135deg, #10b981, #06b6d4)' },
  { id: 'sapphire', name: 'Midnight Sapphire', mood: 'Abyss Azure', previewGradient: 'linear-gradient(135deg, #3b82f6, #0ea5e9)' },
  { id: 'crimson', name: 'Cosmic Crimson', mood: 'Radiant Rose', previewGradient: 'linear-gradient(135deg, #f43f5e, #c026d3)' },
  { id: 'amber', name: 'Solar Amber', mood: 'Golden Topaz', previewGradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
  { id: 'obsidian', name: 'OLED Obsidian', mood: 'Monochrome Frost', previewGradient: 'linear-gradient(135deg, #e4e4e7, #71717a)' },
  { id: 'opal', name: 'Frosted Opal', mood: 'Luminous Light', previewGradient: 'linear-gradient(135deg, #c4b5fd, #e0e7ff)' },
];

const BACKGROUNDS = [
  { id: 'orbs', name: 'Floating Orbs', desc: 'Signature organic floating glow', icon: Sparkles },
  { id: 'aurora-waves', name: 'Liquid Aurora', desc: 'Flowing dynamic ambient mesh', icon: Waves },
  { id: 'starfield', name: 'Cosmic Starfield', desc: 'Subtle twinkling star cluster', icon: Sparkles },
  { id: 'cyber-grid', name: 'Cyber Grid', desc: 'High-tech perspective glass grid', icon: Grid },
  { id: 'minimal', name: 'Minimal Studio', desc: 'Calm vignette without motion', icon: Square },
];

function estimateTokens(text) {
  if (!text) return 0;
  const str = text.trim();
  const words = str.split(/\s+/).filter(Boolean).length;
  const chars = str.length;
  return Math.max(1, Math.round((chars / 4.0 + words * 1.3) / 2.0));
}

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

function getInitialTheme() {
 try {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved && THEMES.some(t => t.id === saved)) return saved;
 } catch (e) {}
 return 'amethyst';
}

function getInitialBg() {
 try {
  const saved = localStorage.getItem(BG_KEY);
  if (saved && BACKGROUNDS.some(b => b.id === saved)) return saved;
 } catch (e) {}
 return 'orbs';
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

 const promptTokens = m.usage?.prompt_tokens;
 const completionTokens = m.usage?.completion_tokens || m.tokens || estimateTokens(m.content);

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
      <span className="token-tag" title="User input tokens">
       <Zap size={10} /> {(m.tokens || estimateTokens(m.content)).toLocaleString()} tokens
      </span>
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
     <div 
      className="token-badge" 
      title={`Context/Prompt: ${promptTokens ? promptTokens.toLocaleString() : '~'} tokens · Output: ${completionTokens.toLocaleString()} tokens · Total: ${(m.usage?.total_tokens || (promptTokens ? promptTokens + completionTokens : completionTokens)).toLocaleString()} tokens`}
     >
      <Zap size={11} />
      <span><strong>{completionTokens.toLocaleString()}</strong> tokens</span>
      {m.usage?.duration_sec ? (
       <span className="token-speed">
        · {m.usage.duration_sec}s
        {completionTokens && m.usage.duration_sec > 0 ? (
         ` (${Math.round(completionTokens / m.usage.duration_sec)} t/s)`
        ) : null}
       </span>
      ) : null}
     </div>
    </div>
   )}
  </article>
 );
}

function TokenTimelineGraph({ points, mode, setMode }) {
 const [hoveredIdx, setHoveredIdx] = useState(null);

 if (!points || points.length === 0) return null;

 const width = 680;
 const height = 210;
 const paddingLeft = 48;
 const paddingRight = 24;
 const paddingTop = 22;
 const paddingBottom = 36;
 const plotWidth = width - paddingLeft - paddingRight;
 const plotHeight = height - paddingTop - paddingBottom;

 let rawMax = 10;
 points.forEach(p => {
  if (mode === 'cumulative') {
   if (p.cumulativeTokens > rawMax) rawMax = p.cumulativeTokens;
  } else {
   const top = Math.max(p.turnTotal, p.promptTokens, p.completionTokens);
   if (top > rawMax) rawMax = top;
  }
 });
 const maxY = Math.ceil(rawMax * 1.15);

 const getX = (i) => {
  if (points.length === 1) return paddingLeft + plotWidth / 2;
  return paddingLeft + (i / (points.length - 1)) * plotWidth;
 };
 const getY = (val) => {
  return paddingTop + plotHeight - (val / maxY) * plotHeight;
 };

 let cumulativeAreaPath = '';
 let cumulativeLinePath = '';
 let promptLinePath = '';
 let completionLinePath = '';

 if (points.length === 1) {
  const x = getX(0);
  const yCum = getY(points[0].cumulativeTokens);
  cumulativeAreaPath = `M ${x - 35},${paddingTop + plotHeight} L ${x - 35},${yCum} L ${x + 35},${yCum} L ${x + 35},${paddingTop + plotHeight} Z`;
  cumulativeLinePath = `M ${x - 35},${yCum} L ${x + 35},${yCum}`;
 } else {
  const pts = points.map((p, i) => ({ x: getX(i), y: getY(p.cumulativeTokens) }));
  cumulativeLinePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
  cumulativeAreaPath = `${cumulativeLinePath} L ${pts[pts.length - 1].x},${paddingTop + plotHeight} L ${pts[0].x},${paddingTop + plotHeight} Z`;

  const promptPts = points.map((p, i) => ({ x: getX(i), y: getY(p.promptTokens) }));
  promptLinePath = promptPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');

  const compPts = points.map((p, i) => ({ x: getX(i), y: getY(p.completionTokens) }));
  completionLinePath = compPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
 }

 const ticks = [0, 0.25, 0.5, 0.75, 1.0].map(ratio => ({
  val: Math.round(ratio * maxY),
  y: paddingTop + plotHeight - ratio * plotHeight
 }));

 const activePoint = hoveredIdx !== null ? points[hoveredIdx] : points[points.length - 1];

 return (
  <div className="timeline-chart-card">
   <div className="chart-top-bar">
    <div className="chart-title-wrap">
     <Activity size={15} />
     <h4>Token Progression</h4>
    </div>
    <div className="chart-legend">
     {mode === 'cumulative' ? (
      <div className="legend-item">
       <span className="legend-dot cumulative" />
       <span>Cumulative Total</span>
      </div>
     ) : (
      <>
       <div className="legend-item">
        <span className="legend-dot prompt" />
        <span>Context / Input</span>
       </div>
       <div className="legend-item">
        <span className="legend-dot completion" />
        <span>Reply / Output</span>
       </div>
      </>
     )}
    </div>
    <div className="chart-mode-toggle">
     <button
      type="button"
      className={`chart-mode-btn ${mode === 'breakdown' ? 'active' : ''}`}
      onClick={() => setMode('breakdown')}
     >
      Per Turn
     </button>
     <button
      type="button"
      className={`chart-mode-btn ${mode === 'cumulative' ? 'active' : ''}`}
      onClick={() => setMode('cumulative')}
     >
      Cumulative
     </button>
    </div>
   </div>

   <div className="timeline-svg-wrap">
    <svg viewBox={`0 0 ${width} ${height}`} className="timeline-svg">
     <defs>
      <linearGradient id="cumAreaGrad" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0%" stopColor="#c084fc" stopOpacity="0.45" />
       <stop offset="100%" stopColor="#c084fc" stopOpacity="0.02" />
      </linearGradient>
     </defs>

     {ticks.map((t, idx) => (
      <g key={idx}>
       <line x1={paddingLeft} x2={width - paddingRight} y1={t.y} y2={t.y} className="chart-grid-line" />
       <text x={paddingLeft - 8} y={t.y + 3} textAnchor="end" className="chart-axis-text">
        {t.val >= 1000 ? `${(t.val / 1000).toFixed(1)}k` : t.val}
       </text>
      </g>
     ))}

     {mode === 'cumulative' && (
      <>
       <path d={cumulativeAreaPath} fill="url(#cumAreaGrad)" />
       <path d={cumulativeLinePath} fill="none" stroke="#c084fc" strokeWidth="2.5" strokeLinecap="round" />
       {points.map((p, i) => {
        const cx = getX(i);
        const cy = getY(p.cumulativeTokens);
        const isHovered = hoveredIdx === i;
        return (
         <g key={i}>
          <circle
           cx={cx}
           cy={cy}
           r={isHovered ? 6 : 4}
           fill="#ffffff"
           stroke="#c084fc"
           strokeWidth={isHovered ? 3 : 2}
           className="chart-point"
           onMouseEnter={() => setHoveredIdx(i)}
           onMouseLeave={() => setHoveredIdx(null)}
          />
          <text x={cx} y={height - 10} textAnchor="middle" className="chart-axis-text">
           Turn {p.turn}
          </text>
         </g>
        );
       })}
      </>
     )}

     {mode === 'breakdown' && (
      <>
       {points.length > 1 && (
        <>
         <path d={promptLinePath} fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="3 3" />
         <path d={completionLinePath} fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" />
        </>
       )}
       {points.map((p, i) => {
        const x = getX(i);
        const yPrompt = getY(p.promptTokens);
        const yComp = getY(p.completionTokens);
        const isHovered = hoveredIdx === i;
        const barWidth = points.length === 1 ? 36 : Math.min(24, Math.max(10, plotWidth / (points.length * 3.2)));

        return (
         <g key={i} onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)}>
          <rect
           x={x - barWidth - 4}
           y={paddingTop}
           width={barWidth * 2 + 8}
           height={plotHeight}
           fill={isHovered ? 'rgba(255,255,255,0.06)' : 'transparent'}
           rx="4"
           className="chart-bar"
          />
          <rect
           x={x - barWidth}
           y={yPrompt}
           width={barWidth - 2}
           height={paddingTop + plotHeight - yPrompt}
           fill="#38bdf8"
           opacity={isHovered ? 0.95 : 0.75}
           rx="3"
          />
          <rect
           x={x + 2}
           y={yComp}
           width={barWidth - 2}
           height={paddingTop + plotHeight - yComp}
           fill="var(--accent-primary)"
           opacity={isHovered ? 1 : 0.85}
           rx="3"
          />
          <text x={x} y={height - 10} textAnchor="middle" className="chart-axis-text">
           Turn {p.turn}
          </text>
         </g>
        );
       })}
      </>
     )}

     {hoveredIdx !== null && (
      <line
       x1={getX(hoveredIdx)}
       x2={getX(hoveredIdx)}
       y1={paddingTop}
       y2={paddingTop + plotHeight}
       stroke="rgba(255,255,255,0.35)"
       strokeDasharray="2 2"
      />
     )}
    </svg>

    {activePoint && (
     <div className="chart-hover-overlay">
      <div className="chart-hover-left">
       <strong>Turn #{activePoint.turn}</strong>
       <span>({activePoint.time})</span>
       <span>· {activePoint.model}</span>
      </div>
      <div className="chart-hover-stats">
       <span>Input: <strong>{activePoint.promptTokens.toLocaleString()}</strong></span>
       <span>Output: <strong>{activePoint.completionTokens.toLocaleString()}</strong></span>
       <span>Turn Total: <strong>{activePoint.turnTotal.toLocaleString()}</strong></span>
       <span>Cumulative: <strong>{activePoint.cumulativeTokens.toLocaleString()}</strong></span>
       {activePoint.durationSec && (
        <span>Speed: <strong>{activePoint.durationSec}s</strong></span>
       )}
      </div>
     </div>
    )}
   </div>
  </div>
 );
}

function TokenTimelineTab({ stats, onSwitchToChat, config, providers }) {
 const [chartMode, setChartMode] = useState('breakdown');

 if (!stats || stats.timelinePoints.length === 0) {
  return (
   <div className="token-timeline-tab">
    <div className="token-empty-state">
     <div className="token-empty-icon"><Activity size={32} /></div>
     <h3>No Token Data Recorded Yet</h3>
     <p>Send a message in the conversation to start tracking token consumption, response speeds, and timeline progression.</p>
     <button type="button" className="new-chat" onClick={onSwitchToChat}>
      <MessageCircle size={15} /> Switch to Conversation <span>→</span>
     </button>
    </div>
   </div>
  );
 }

 return (
  <div className="token-timeline-tab">
   <div className="timeline-header">
    <div className="timeline-title-area">
     <h2>Token Analytics & Timeline</h2>
     <p>Live session breakdown of input prompts, model generation, and cumulative tokens.</p>
    </div>
    <button type="button" className="new-chat" onClick={onSwitchToChat}>
     <MessageCircle size={15} /> Back to Conversation <span>↗</span>
    </button>
   </div>

   <div className="metrics-grid">
    <div className="metric-card">
     <div className="metric-card-top">
      <span>Session Total</span>
      <div className="metric-icon"><Zap size={14} /></div>
     </div>
     <div className="metric-value">{stats.totalTokens.toLocaleString()}</div>
     <div className="metric-sub">Total tokens processed</div>
    </div>

    <div className="metric-card">
     <div className="metric-card-top">
      <span>Output Tokens</span>
      <div className="metric-icon"><Sparkles size={14} /></div>
     </div>
     <div className="metric-value">{stats.completionTokens.toLocaleString()}</div>
     <div className="metric-sub">Generated by assistant</div>
    </div>

    <div className="metric-card">
     <div className="metric-card-top">
      <span>Input Tokens</span>
      <div className="metric-icon"><Cpu size={14} /></div>
     </div>
     <div className="metric-value">{stats.promptTokens.toLocaleString()}</div>
     <div className="metric-sub">Prompt & context tokens</div>
    </div>

    <div className="metric-card">
     <div className="metric-card-top">
      <span>Avg Response</span>
      <div className="metric-icon"><TrendingUp size={14} /></div>
     </div>
     <div className="metric-value">{stats.avgResponse.toLocaleString()}</div>
     <div className="metric-sub">Tokens per reply ({stats.exchangeCount} turns)</div>
    </div>
   </div>

   <TokenTimelineGraph
    points={stats.timelinePoints}
    mode={chartMode}
    setMode={setChartMode}
   />

   <div className="turn-log-section">
    <span className="eyebrow">CHRONOLOGICAL EXCHANGE BREAKDOWN ({stats.timelinePoints.length})</span>
    <div className="turn-log-list">
     {stats.timelinePoints.slice().reverse().map((pt) => {
      const promptPct = pt.turnTotal > 0 ? (pt.promptTokens / pt.turnTotal) * 100 : 50;
      const compPct = 100 - promptPct;
      const tps = pt.durationSec && pt.durationSec > 0 ? Math.round(pt.completionTokens / pt.durationSec) : null;

      return (
       <div key={pt.turn} className="turn-log-item">
        <div className="turn-log-header">
         <div className="turn-number-tag">
          <Clock size={13} />
          <span>Turn #{pt.turn} · {pt.model}</span>
         </div>
         <span className="turn-time">{pt.time}</span>
        </div>

        <div className="turn-snippets">
         <div className="turn-snippet-box">
          <strong>User Prompt ({pt.promptTokens.toLocaleString()} tokens)</strong>
          <p>{pt.userSnippet || 'Prompt'}</p>
         </div>
         <div className="turn-snippet-box">
          <strong>Assistant Reply ({pt.completionTokens.toLocaleString()} tokens)</strong>
          <p>{pt.assistantSnippet || 'Response'}</p>
         </div>
        </div>

        <div className="turn-token-bar-wrap">
         <div className="turn-token-bar" title={`Input: ${pt.promptTokens.toLocaleString()} tokens (${Math.round(promptPct)}%) | Output: ${pt.completionTokens.toLocaleString()} tokens (${Math.round(compPct)}%)`}>
          <div className="turn-bar-prompt" style={{ width: `${promptPct}%` }} />
          <div className="turn-bar-completion" style={{ width: `${compPct}%` }} />
         </div>
         <div className="turn-token-stats">
          {pt.turnTotal.toLocaleString()} tokens
          {tps ? ` (${tps} t/s)` : ''}
         </div>
        </div>
       </div>
      );
     })}
    </div>
   </div>
  </div>
 );
}

function BackgroundLayers({ bgStyle }) {
 if (bgStyle === 'aurora-waves') {
  return (
   <div className="bg-container">
    <div className="bg-aurora-mesh" />
    <div className="orb orb-aurora-accent" />
   </div>
  );
 }
 if (bgStyle === 'starfield') {
  return (
   <div className="bg-container">
    <div className="bg-starfield" />
    <div className="orb orb-star-glow" />
   </div>
  );
 }
 if (bgStyle === 'cyber-grid') {
  return (
   <div className="bg-container">
    <div className="bg-cyber-grid" />
    <div className="orb orb-grid-glow" />
   </div>
  );
 }
 if (bgStyle === 'minimal') {
  return (
   <div className="bg-container">
    <div className="bg-minimal-studio" />
   </div>
  );
 }
 return (
  <div className="bg-container">
   <div className="orb orb-one" />
   <div className="orb orb-two" />
   <div className="orb orb-three" />
  </div>
 );
}

function ThemeModal({ open, onClose, theme, setTheme, bgStyle, setBgStyle }) {
 useEffect(() => {
  if (!open) return;
  const handleKey = (e) => {
   if (e.key === 'Escape') onClose();
  };
  window.addEventListener('keydown', handleKey);
  return () => window.removeEventListener('keydown', handleKey);
 }, [open, onClose]);

 if (!open) return null;

 return (
  <div className="theme-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Theme and background visual settings">
   <div className="theme-modal-card glass" onClick={e => e.stopPropagation()}>
    <div className="theme-modal-header">
     <div className="theme-modal-title">
      <div className="theme-modal-icon"><Palette size={19} /></div>
      <div>
       <h3>Appearance & Atmosphere</h3>
       <p>Personalize your color palette and background visuals</p>
      </div>
     </div>
     <button className="theme-modal-close" onClick={onClose} aria-label="Close appearance settings"><X size={18} /></button>
    </div>

    <div className="theme-modal-section">
     <span className="eyebrow">COLOR PALETTES ({THEMES.length})</span>
     <div className="themes-grid">
      {THEMES.map(t => (
       <button
        key={t.id}
        type="button"
        className={`theme-card ${theme === t.id ? 'active' : ''}`}
        onClick={() => setTheme(t.id)}
       >
        <div className="theme-preview-orb" style={{ background: t.previewGradient }}>
         {theme === t.id && <Check size={14} className="theme-check-icon" />}
        </div>
        <div className="theme-info">
         <strong>{t.name}</strong>
         <span>{t.mood}</span>
        </div>
       </button>
      ))}
     </div>
    </div>

    <div className="theme-modal-section">
     <span className="eyebrow">BACKGROUND EFFECTS ({BACKGROUNDS.length})</span>
     <div className="bg-styles-grid">
      {BACKGROUNDS.map(b => {
       const Icon = b.icon;
       return (
        <button
         key={b.id}
         type="button"
         className={`bg-card ${bgStyle === b.id ? 'active' : ''}`}
         onClick={() => setBgStyle(b.id)}
        >
         <div className="bg-card-icon"><Icon size={16} /></div>
         <div className="bg-info">
          <strong>{b.name}</strong>
          <span>{b.desc}</span>
         </div>
         {bgStyle === b.id && <span className="bg-active-tag">Active</span>}
        </button>
       );
      })}
     </div>
    </div>

    <div className="theme-modal-footer">
     <span className="theme-footer-hint">Changes are applied immediately and saved locally</span>
     <button type="button" className="theme-done-btn" onClick={onClose}>Done</button>
    </div>
   </div>
  </div>
 );
}

function App(){
 const [config,setConfig]=useState(getInitialConfig), [messages,setMessages]=useState([]), [input,setInput]=useState('');
 const [busy,setBusy]=useState(false), [error,setError]=useState(''), [settings,setSettings]=useState(false);
 const [theme, setTheme] = useState(getInitialTheme);
 const [bgStyle, setBgStyle] = useState(getInitialBg);
 const [themeModalOpen, setThemeModalOpen] = useState(false);
 const [activeTab, setActiveTab] = useState('chat'); // 'chat' or 'tokens'

 const controller=useRef(null), chatScroll=useRef(null), sending=useRef(false);
 const ready=Boolean(config.model.trim() && (config.provider==='ollama' ? config.base_url.trim() : config.api_key.trim()));

 const sessionStats = useMemo(() => {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalApiTokens = 0;
  let exchangeCount = 0;
  const timelinePoints = [];
  let runningCumulative = 0;

  for (let i = 0; i < messages.length; i++) {
   const msg = messages[i];
   if (msg.role === 'user') {
    const uTokens = msg.tokens || estimateTokens(msg.content);
    promptTokens += uTokens;
   } else if (msg.role === 'assistant') {
    exchangeCount++;
    const cTokens = msg.usage?.completion_tokens || msg.tokens || estimateTokens(msg.content);
    const prevUserMsg = messages[i - 1];
    const pTokens = msg.usage?.prompt_tokens || (prevUserMsg?.tokens || estimateTokens(prevUserMsg?.content || ''));
    const turnTotal = msg.usage?.total_tokens || (pTokens + cTokens);
    completionTokens += cTokens;
    totalApiTokens += turnTotal;
    runningCumulative += turnTotal;

    const timeLabel = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    timelinePoints.push({
     turn: exchangeCount,
     time: timeLabel,
     timestamp: msg.timestamp || Date.now(),
     promptTokens: pTokens,
     completionTokens: cTokens,
     turnTotal: turnTotal,
     cumulativeTokens: runningCumulative,
     model: msg.label || msg.model || config.model || 'Assistant',
     durationSec: msg.usage?.duration_sec || null,
     userSnippet: prevUserMsg?.content ? prevUserMsg.content.slice(0, 80) : '',
     assistantSnippet: msg.content ? msg.content.slice(0, 100) : ''
    });
   }
  }

  const sessionTotal = totalApiTokens > 0 ? totalApiTokens : promptTokens;
  const avgResponse = exchangeCount > 0 ? Math.round(completionTokens / exchangeCount) : 0;

  return {
   promptTokens,
   completionTokens,
   totalTokens: sessionTotal,
   exchangeCount,
   avgResponse,
   timelinePoints
  };
 }, [messages, config.model]);

 useEffect(()=>{
  if(activeTab === 'chat' && chatScroll.current){
   chatScroll.current.scrollTo({top:chatScroll.current.scrollHeight,behavior:'smooth'});
  }
 },[messages, busy, activeTab]);

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

 useEffect(() => {
  try {
   localStorage.setItem(THEME_KEY, theme);
   document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
 }, [theme]);

 useEffect(() => {
  try {
   localStorage.setItem(BG_KEY, bgStyle);
   document.documentElement.setAttribute('data-bg', bgStyle);
  } catch (e) {}
 }, [bgStyle]);

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
  const userTokens = estimateTokens(input.trim());
  const userMsg = { role: 'user', content: input.trim(), tokens: userTokens, timestamp: Date.now() };
  const history = [...messages.filter(m=>!m.failed && m.content), userMsg];
  if(history.length>100){setError('This conversation is full. Start a new chat.');return;}
  sending.current=true;setBusy(true);setError('');setInput('');
  setMessages([...history,{
   role:'assistant',
   content:'',
   label:`${providers[config.provider]} / ${config.model}`,
   model: config.model,
   timestamp: Date.now(),
   usage: null
  }]);
  controller.current=new AbortController();
  let completed=false;
  let receivedUsage=null;

  const handleEvent=(event)=>{
   if(event.type==='error')throw new Error(event.message);
   if(event.type==='done'){
    completed=true;
    if(event.usage){
     receivedUsage=event.usage;
     setMessages(ms=>ms.map((m,i)=>i===ms.length-1?{
      ...m,
      usage: event.usage,
      tokens: event.usage.completion_tokens || estimateTokens(m.content)
     }:m));
    }
   }
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
  }finally{
   sending.current=false;setBusy(false);controller.current=null;
   // Ensure assistant message has tokens recorded even if done event had no usage payload
   setMessages(ms=>ms.map((m,i)=>{
    if(i===ms.length-1 && m.role==='assistant'){
     const comp = m.usage?.completion_tokens || estimateTokens(m.content);
     const prompt = m.usage?.prompt_tokens || estimateTokens(history.map(h=>h.content).join(' '));
     return {
      ...m,
      tokens: comp,
      usage: m.usage || {
       prompt_tokens: prompt,
       completion_tokens: comp,
       total_tokens: prompt + comp,
       duration_sec: null
      }
     };
    }
    return m;
   }));
  }
 }

 const activeThemeObj = THEMES.find(t => t.id === theme) || THEMES[0];

 return (
  <div className="app">
   <BackgroundLayers bgStyle={bgStyle} />
   <ThemeModal 
    open={themeModalOpen} 
    onClose={() => setThemeModalOpen(false)} 
    theme={theme} 
    setTheme={setTheme} 
    bgStyle={bgStyle} 
    setBgStyle={setBgStyle} 
   />
   <header>
    <a className="brand" href="/" aria-label="Glasschat home">
     <span className="brand-icon"><Sparkles size={21}/></span>
     glasschat
     <span className="beta">PLAYGROUND</span>
    </a>
    <div className="header-right">
     <button 
      type="button" 
      className="theme-header-btn" 
      onClick={() => setThemeModalOpen(true)}
      aria-label="Customize appearance and theme"
      title="Customize appearance and theme"
     >
      <Palette size={14} />
      <span>Theme: <span className="theme-badge-name">{activeThemeObj.name.split(' ')[0]}</span></span>
     </button>
     <span className="private"><ShieldCheck size={14}/> Keys saved locally</span>
     <button className="icon-button mobile-toggle" onClick={()=>setSettings(!settings)} aria-label="Toggle model settings">
      <SlidersHorizontal size={20}/>
     </button>
    </div>
   </header>
   <main>
    <aside className={`glass sidebar ${settings?'open':''}`}>
     <div className="panel-heading"><span className="eyebrow">YOUR WORKSPACE</span><SlidersHorizontal size={16}/></div>
     <h2>Make it yours.</h2>
     <p className="muted intro">Your model. Your conversation.</p>
     <button className="new-chat" onClick={newChat} disabled={busy}><Plus size={17}/> New conversation <span>↗</span></button>
     
     <div className="divider"/>
     <div className="section-label"><Palette size={15}/> APPEARANCE & THEME</div>
     <div className="theme-quick-bar">
      {THEMES.map(t => (
       <button
        key={t.id}
        type="button"
        className={`theme-dot-btn ${theme === t.id ? 'active' : ''}`}
        onClick={() => setTheme(t.id)}
        title={`${t.name} (${t.mood})`}
        aria-label={`Switch to ${t.name}`}
        style={{ background: t.previewGradient }}
       >
        {theme === t.id && <span className="dot-inner-check" />}
       </button>
      ))}
     </div>
     <div className="sidebar-bg-wrap">
      <label htmlFor="bg-select" className="mini-label">Background effect</label>
      <div className="select-wrap">
       <select id="bg-select" value={bgStyle} onChange={e => setBgStyle(e.target.value)}>
        {BACKGROUNDS.map(b => (
         <option key={b.id} value={b.id}>{b.name}</option>
        ))}
       </select>
       <ChevronDown size={14} />
      </div>
     </div>
     <button type="button" className="customize-appearance-btn" onClick={() => setThemeModalOpen(true)}>
      <Palette size={13} />
      <span>All themes & visual effects</span>
      <ArrowUpRight size={13} />
     </button>

     <div className="divider"/>
     <div className="section-label"><Cpu size={15}/> MODEL CONNECTION</div>
     <fieldset disabled={busy}>
      <label htmlFor="provider">Provider</label>
      <div className="select-wrap">
       <select id="provider" value={config.provider} onChange={e=>switchProvider(e.target.value)}>
        {Object.entries(providers).map(([key,label])=><option value={key} key={key}>{label}</option>)}
       </select>
       <ChevronDown size={16}/>
      </div>
      <label htmlFor="model">Model name</label>
      <input id="model" value={config.model} onChange={e=>change('model',e.target.value)} placeholder={config.provider==='ollama'?'e.g. qwen2.5-coder:1.5b':'Enter an available model ID'} autoComplete="off"/>
      {config.provider==='ollama'? (
       <>
        <label htmlFor="url">Ollama server URL</label>
        <input id="url" type="url" value={config.base_url} onChange={e=>change('base_url',e.target.value)}/>
        <p className="field-hint">For Docker, use host.docker.internal to reach Ollama on your computer.</p>
       </>
      ) : (
       <>
        <label htmlFor="key">API key <span>SAVED LOCALLY</span></label>
        <input id="key" type="password" value={config.api_key} onChange={e=>change('api_key',e.target.value)} placeholder="Paste your API key" autoComplete="off"/>
        <p className="field-hint">Stored in browser local storage and sent to the backend for your requests.</p>
       </>
      )}
      <details>
       <summary>Assistant instructions</summary>
       <textarea aria-label="Assistant instructions" value={config.system_prompt} onChange={e=>change('system_prompt',e.target.value)} rows={4} maxLength={4000}/>
      </details>
     </fieldset>
     <div className="sidebar-footer">
      <span className={`status-dot ${ready?'ready':''}`}/>
      <span>{ready?'Configured · not yet verified':'Waiting for connection details'}</span>
     </div>
    </aside>
    <section className="glass chat-panel">
     <div className="chat-header">
      <div className="chat-tabs">
       <button
        type="button"
        className={`chat-tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
        onClick={() => setActiveTab('chat')}
       >
        <MessageCircle size={15} />
        <span>Conversation</span>
       </button>
       <button
        type="button"
        className={`chat-tab-btn ${activeTab === 'tokens' ? 'active' : ''}`}
        onClick={() => setActiveTab('tokens')}
       >
        <Activity size={15} />
        <span>Token Timeline</span>
        {sessionStats.totalTokens > 0 && (
         <span className="tab-token-pill">{sessionStats.totalTokens.toLocaleString()}</span>
        )}
       </button>
      </div>
      <div className="chat-header-actions">
       {sessionStats.totalTokens > 0 && (
        <button 
         type="button" 
         className="session-token-chip" 
         onClick={() => setActiveTab('tokens')}
         title="Total session tokens. Click to view timeline graph"
        >
         <Zap size={12} />
         <span><strong>{sessionStats.totalTokens.toLocaleString()}</strong> tokens</span>
        </button>
       )}
       <span className="model-badge"><span className="status-dot"/>{providers[config.provider]}</span>
      </div>
     </div>

     {activeTab === 'chat' ? (
      <>
       <div className="chat-scroll" ref={chatScroll} aria-live="polite" aria-busy={busy}>
        {messages.length===0 ? (
         <div className="welcome">
          <div className="hero-symbol"><Sparkles size={34}/></div>
          <div className="eyebrow hero-eyebrow">A LITTLE SPACE FOR BIG IDEAS</div>
          <h1>A clearer<br/><span>conversation.</span></h1>
          <p>Think out loud. Follow your curiosity.<br/>Bring your favorite model along.</p>
          <div className="starters">
           {starters.map(([title,prompt],i)=>(
            <button key={title} onClick={()=>setInput(prompt)}>
             <span className="starter-icon">{i===0?<Sparkles size={17}/>:i===1?<Zap size={17}/>:<MessageCircle size={17}/>}</span>
             <strong>{title}</strong>
             <ArrowUpRight size={15}/>
            </button>
           ))}
          </div>
         </div>
        ) : (
         <div className="messages">{messages.map((m,i)=><ChatMessage key={i} m={m}/>)}</div>
        )}
       </div>
       <div className="composer-area">
        {error&&<div className="error" role="alert">{error}</div>}
        <form onSubmit={send} className="composer">
         <textarea aria-label="Message" placeholder="Where should we begin?" value={input} onChange={e=>setInput(e.target.value)} rows={2} maxLength={32000} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/>
         <div className="composer-bottom">
          <span><Sparkles size={13}/> {config.model||'Choose a model to get started'}</span>
          {busy ? (
           <button type="button" className="send" aria-label="Stop response" onClick={()=>controller.current?.abort()}><Square size={16}/></button>
          ) : (
           <button type="submit" className="send" aria-label="Send message" disabled={!input.trim()}><ArrowUp size={20}/></button>
          )}
         </div>
        </form>
        <div className="composer-note">Enter to send · Shift + Enter for a new line <span>AI can make mistakes. Stay curious.</span></div>
       </div>
      </>
     ) : (
      <TokenTimelineTab
       stats={sessionStats}
       onSwitchToChat={() => setActiveTab('chat')}
       config={config}
       providers={providers}
      />
     )}
    </section>
   </main>
   <footer>
    <span>BUILT FOR YOUR TRAIN OF THOUGHT</span>
    <span>LangChain <b>·</b> FastAPI <b>·</b> React</span>
   </footer>
  </div>
 );
}

createRoot(document.getElementById('root')).render(<App/>);
