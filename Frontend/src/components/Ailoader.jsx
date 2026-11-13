import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";

/**
 * AILoader - reusable AI-themed loader (dark navy + cyan/green/violet glow)
 *
 *   <AILoader text="Loading PDF documents" />                       // default "orbit" (bolt + orbiting particles)
 *   <AILoader variant="neural" text="AI is thinking" />             // neural-network nodes with flowing signals
 *   <AILoader variant="bars" size="sm" text="Saving" />             // chhota, inline
 *   <AILoader messages={["Reading your notes", "Analyzing topics", "Preparing exam"]} />  // text khud badalta rahe
 *   <AILoader fullScreen text="Please wait" />                      // poori screen overlay (body me portal hota hai)
 *   <AILoader inline variant="bars" size="xs" text="Typing" />      // chat bubble / line ke andar
 *   <ButtonSpinner />                                               // button ke andar
 *
 * Props: text, size ("sm" | "md" | "lg"), variant ("orbit" | "neural" | "bars"),
 *        messages (array), bar (bool, thin progress bar), fullScreen (bool), inline (bool)
 */

const SIZES = { xs: 22, sm: 40, md: 64, lg: 96 };

const css = `
.ai-loader{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:36px 0;width:100%}
.ai-loader--full{position:fixed;inset:0;padding:0;z-index:99999;background:radial-gradient(circle at 50% 42%,rgba(0,243,255,.10),rgba(2,8,23,.94) 62%);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.ai-loader--inline{flex-direction:row;justify-content:flex-start;gap:10px;padding:4px 0;width:auto}
.ai-loader--inline .ai-loader__text{font-size:13px}
.ai-loader__stage{position:relative;display:grid;place-items:center;width:calc(var(--s)*1.9);height:calc(var(--s)*1.9)}

/* ---------- ORBIT ---------- */
.ai-orb{position:relative;width:var(--s);height:var(--s);display:grid;place-items:center}
.ai-orb__glow{position:absolute;inset:-35%;border-radius:50%;background:radial-gradient(circle,rgba(0,243,255,.38) 0%,rgba(124,92,255,.16) 45%,transparent 70%);filter:blur(10px);animation:ai-glow 2.4s ease-in-out infinite}
.ai-orb__ripple{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(0,243,255,.55);opacity:0;animation:ai-ripple 2.4s ease-out infinite}
.ai-orb__ripple--2{animation-delay:1.2s;border-color:rgba(16,245,176,.5)}
.ai-orb__ring{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,transparent 0 25%,#7c5cff 55%,#00f3ff 85%,#10f5b0 100%);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 4px),#000 calc(100% - 3px));mask:radial-gradient(farthest-side,transparent calc(100% - 4px),#000 calc(100% - 3px));animation:ai-spin 1.15s linear infinite;filter:drop-shadow(0 0 8px rgba(0,243,255,.8))}
.ai-orb__track{position:absolute;border-radius:50%;animation:ai-spin var(--d) linear infinite}
.ai-orb__track i{position:absolute;top:-3px;left:50%;width:7px;height:7px;margin-left:-3.5px;border-radius:50%;background:var(--c);box-shadow:0 0 12px 2px var(--c)}
.ai-orb__track--1{inset:-16%;--d:2.6s;--c:#00f3ff}
.ai-orb__track--2{inset:-30%;--d:3.9s;--c:#10f5b0;animation-direction:reverse}
.ai-orb__track--3{inset:-44%;--d:5.6s;--c:#7c5cff}
.ai-orb__bolt{position:relative;width:42%;height:42%;filter:drop-shadow(0 0 8px rgba(0,243,255,.9));animation:ai-bolt 1.6s ease-in-out infinite}

/* ---------- NEURAL ---------- */
.ai-neural{width:calc(var(--s)*2.1);height:calc(var(--s)*1.4);overflow:visible}
.ai-neural line{stroke:rgba(0,243,255,.18);stroke-width:1.2}
.ai-neural .flow{stroke:#00f3ff;stroke-width:1.8;stroke-linecap:round;stroke-dasharray:6 60;filter:drop-shadow(0 0 3px #00f3ff);animation:ai-flow 1.8s linear infinite}
.ai-neural circle{fill:#0b1b33;stroke:#00f3ff;stroke-width:1.8;filter:drop-shadow(0 0 4px rgba(0,243,255,.9));transform-box:fill-box;transform-origin:center;animation:ai-node 1.8s ease-in-out infinite}
.ai-neural .out{stroke:#10f5b0;filter:drop-shadow(0 0 5px rgba(16,245,176,.9))}

/* ---------- BARS ---------- */
.ai-bars{display:flex;align-items:center;gap:5px;height:var(--s)}
.ai-bars i{display:block;width:calc(var(--s)*.14);height:100%;border-radius:6px;background:linear-gradient(180deg,#00f3ff,#10f5b0);box-shadow:0 0 10px rgba(0,243,255,.6);transform-origin:center;animation:ai-bar 1.1s ease-in-out infinite}

/* ---------- TEXT + PROGRESS ---------- */
.ai-loader__text{display:flex;align-items:baseline;font-weight:600;font-size:15px;letter-spacing:.4px;text-align:center;background:linear-gradient(90deg,#64748b 0%,#00f3ff 50%,#64748b 100%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;animation:ai-shimmer 2s linear infinite,ai-fadein .45s ease both}
.ai-loader__dots{display:inline-flex;margin-left:2px}
.ai-loader__dots i{font-style:normal;animation:ai-blink 1.2s infinite both}
.ai-loader__dots i:nth-child(2){animation-delay:.2s}
.ai-loader__dots i:nth-child(3){animation-delay:.4s}
.ai-loader__bar{width:150px;height:3px;border-radius:3px;overflow:hidden;background:rgba(0,243,255,.12)}
.ai-loader__bar::after{content:"";display:block;width:40%;height:100%;border-radius:3px;background:linear-gradient(90deg,transparent,#00f3ff,#10f5b0,transparent);animation:ai-slide 1.4s ease-in-out infinite}

/* ---------- BUTTON SPINNER ---------- */
.ai-btn-spinner{display:inline-block;width:16px;height:16px;vertical-align:-3px;margin-right:8px;border-radius:50%;border:2px solid rgba(128,128,128,.35);border-top-color:currentColor;animation:ai-spin .8s linear infinite}

@keyframes ai-spin{to{transform:rotate(360deg)}}
@keyframes ai-glow{0%,100%{transform:scale(.85);opacity:.7}50%{transform:scale(1.1);opacity:1}}
@keyframes ai-ripple{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.9);opacity:0}}
@keyframes ai-bolt{0%,100%{transform:scale(.88)}50%{transform:scale(1.08)}}
@keyframes ai-flow{to{stroke-dashoffset:-66}}
@keyframes ai-node{0%,100%{transform:scale(.85)}50%{transform:scale(1.25)}}
@keyframes ai-bar{0%,100%{transform:scaleY(.25);opacity:.6}50%{transform:scaleY(1);opacity:1}}
@keyframes ai-shimmer{to{background-position:-200% 0}}
@keyframes ai-fadein{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes ai-blink{0%,80%,100%{opacity:.2}40%{opacity:1}}
@keyframes ai-slide{0%{transform:translateX(-110%)}100%{transform:translateX(260%)}}

@media (prefers-reduced-motion:reduce){
  .ai-orb__ring,.ai-orb__track,.ai-orb__bolt,.ai-orb__glow,.ai-orb__ripple,.ai-neural *,.ai-bars i,.ai-loader__bar::after,.ai-btn-spinner{animation-duration:4s!important}
}
`;

// CSS ek hi dafa <head> me inject hoti hai (har loader instance me dobara nahi)
function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("ai-loader-styles")) return;
  const el = document.createElement("style");
  el.id = "ai-loader-styles";
  el.textContent = css;
  document.head.appendChild(el);
}

/* ---------- variants ---------- */
function Orbit({ px }) {
  return (
    <div className="ai-orb" style={{ "--s": `${px}px` }}>
      <span className="ai-orb__glow" />
      <span className="ai-orb__ripple" />
      <span className="ai-orb__ripple ai-orb__ripple--2" />
      <span className="ai-orb__track ai-orb__track--1"><i /></span>
      <span className="ai-orb__track ai-orb__track--2"><i /></span>
      <span className="ai-orb__track ai-orb__track--3"><i /></span>
      <span className="ai-orb__ring" />
      <svg className="ai-orb__bolt" viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id="ai-bolt-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00f3ff" />
            <stop offset="100%" stopColor="#10f5b0" />
          </linearGradient>
        </defs>
        <path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="url(#ai-bolt-grad)" />
      </svg>
    </div>
  );
}

const L1 = [[14, 24], [14, 56]];
const L2 = [[60, 12], [60, 40], [60, 68]];
const L3 = [[106, 40]];

function Neural({ px }) {
  const edges = [];
  L1.forEach((a) => L2.forEach((b) => edges.push([a, b])));
  L2.forEach((a) => L3.forEach((b) => edges.push([a, b])));
  const nodes = [...L1, ...L2, ...L3];

  return (
    <svg className="ai-neural" style={{ "--s": `${px}px` }} viewBox="0 0 120 80" aria-hidden="true">
      {edges.map(([a, b], i) => (
        <line key={`b${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
      ))}
      {edges.map(([a, b], i) => (
        <line
          key={`f${i}`}
          className="flow"
          x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
          style={{ animationDelay: `${(i % 5) * 0.28}s` }}
        />
      ))}
      {nodes.map(([x, y], i) => (
        <circle
          key={`n${i}`}
          className={i === nodes.length - 1 ? "out" : ""}
          cx={x} cy={y} r="4.6"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </svg>
  );
}

function Bars({ px }) {
  return (
    <div className="ai-bars" style={{ "--s": `${px}px` }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  );
}

/* ---------- main component ---------- */
export default function AILoader({
  text = "Loading",
  size = "md",
  variant = "orbit",
  messages,
  bar,
  fullScreen = false,
  inline = false,
}) {
  ensureStyles();
  const px = SIZES[size] || SIZES.md;
  const showBar = bar ?? (size !== "sm" && size !== "xs" && !inline);

  // messages diye hon to text har ~2 second me badalta rahe
  const [idx, setIdx] = useState(0);
  const msgKey = Array.isArray(messages) ? messages.join("|") : "";
  useEffect(() => {
    if (!msgKey) return undefined;
    setIdx(0);
    const count = msgKey.split("|").length;
    const t = setInterval(() => setIdx((v) => (v + 1) % count), 2000);
    return () => clearInterval(t);
  }, [msgKey]);

  const label = Array.isArray(messages) && messages.length ? messages[idx % messages.length] : text;

  const visual =
    variant === "neural" ? <Neural px={px} /> :
    variant === "bars" ? <Bars px={px} /> :
    <Orbit px={px} />;

  const node = (
    <div
      className={`ai-loader${fullScreen ? " ai-loader--full" : ""}${inline ? " ai-loader--inline" : ""}`}
      role="status"
      aria-live="polite"
    >
      {variant === "orbit" ? (
        <div className="ai-loader__stage" style={{ "--s": `${px}px` }}>{visual}</div>
      ) : (
        visual
      )}

      {label && (
        <div className="ai-loader__text" key={label}>
          {label}
          <span className="ai-loader__dots"><i>.</i><i>.</i><i>.</i></span>
        </div>
      )}
      {showBar && <div className="ai-loader__bar" />}
    </div>
  );

  // fullScreen loader hamesha <body> me render hota hai, taake kisi modal ke transform/overflow me phans na jaye
  if (fullScreen && typeof document !== "undefined") {
    return ReactDOM.createPortal(node, document.body);
  }
  return node;
}

// Button ke andar: <button disabled={busy}>{busy && <ButtonSpinner />} Upload PDF</button>
export function ButtonSpinner() {
  ensureStyles();
  return <span className="ai-btn-spinner" aria-hidden="true" />;
}