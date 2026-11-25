// Finite Field Lab — Visual lab (#visual) and the global Visual / Classic learning switch.
// Self-contained teaching layer: small-field math (GF(2^4), AES GF(2^8)) runs in the browser,
// the backend and existing calculator behaviour are untouched.

const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

/* ------------------------------------------------------------------ math */
const hex = (v, w = 2) => v.toString(16).toUpperCase().padStart(w, "0");
const bin = (v, w) => v.toString(2).padStart(w, "0");
function poly(v) {
  if (!v) return "0";
  const t = [];
  for (let k = 15; k >= 0; k--) if ((v >> k) & 1) t.push(k === 0 ? "1" : k === 1 ? "x" : `x<sup>${k}</sup>`);
  return t.join(" + ");
}
const AES_MOD = 0x11b;
// GF(2^4), m(x) = x^4 + x + 1, generator g = x
const EXP = [];
const LOG = new Array(16).fill(null);
for (let k = 0, v = 1; k < 15; k++) {
  EXP.push(v);
  LOG[v] = k;
  v <<= 1;
  if (v & 0x10) v ^= 0x13;
}
const gpow = (k) => `g<sup>${k}</sup>`;

/* ------------------------------------------------- Visual / Classic mode */
const root = document.documentElement;
const modeButtons = [...document.querySelectorAll("[data-learn-mode]")];
let mode = localStorage.getItem("ffl-learn-mode") === "classic" ? "classic" : "visual";

function setMode(next) {
  mode = next;
  root.dataset.learnMode = next;
  localStorage.setItem("ffl-learn-mode", next);
  for (const b of modeButtons) b.setAttribute("aria-pressed", String(b.dataset.learnMode === next));
  document.dispatchEvent(new CustomEvent("learnmodechange", { detail: next }));
}
for (const b of modeButtons) b.addEventListener("click", () => setMode(b.dataset.learnMode));
setMode(mode);

// In Classic mode, new calculation traces open in the textbook "Classic table" layout.
new MutationObserver((records) => {
  if (mode !== "classic") return;
  for (const r of records) for (const n of r.addedNodes) {
    if (!(n instanceof HTMLElement)) continue;
    const group = n.matches?.(".trace-modes") ? n : n.querySelector?.(".trace-modes");
    const btn = group && [...group.querySelectorAll("button")].find((b) => b.textContent.trim() === "Classic table");
    if (btn && btn.getAttribute("aria-pressed") !== "true") requestAnimationFrame(() => btn.click());
  }
}).observe(document.body, { childList: true, subtree: true });

const view = document.querySelector('[data-lab-view="visual"]');
if (view) {
  setupPath();
  setupShift();
  setupRing();
  // "Tutorial tour" on this tab restarts the beginner path instead of the generic tour.
  document.addEventListener("click", (e) => {
    if (e.target.closest?.("#tutorial-open") && !view.hidden) {
      e.stopImmediatePropagation();
      e.preventDefault();
      window.__vlGoto?.(0);
      $("vl-path").scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
    }
  }, true);
}

/* ------------------------------------------------------ bit tile helper */
function tileRow(value, width, { toggle, labels = true, cls = "" } = {}) {
  const row = el("div", `vl-tiles ${cls}`);
  for (let k = width - 1; k >= 0; k--) {
    const on = (value >> k) & 1;
    const t = el(toggle ? "button" : "span", `vl-tile${on ? " on" : ""}`);
    t.innerHTML = `<b>${on}</b>${labels ? `<small>${k === 0 ? "1" : k === 1 ? "x" : `x<sup>${k}</sup>`}</small>` : ""}`;
    if (toggle) {
      t.type = "button";
      t.setAttribute("aria-pressed", String(!!on));
      t.setAttribute("aria-label", `Coefficient of x to the ${k}: ${on}`);
      t.addEventListener("click", () => toggle(k));
    }
    row.append(t);
  }
  return row;
}
function flash(node) {
  node.classList.remove("flash");
  void node.offsetWidth;
  node.classList.add("flash");
}

/* ------------------------------------------------------- 1. Start here */
function setupPath() {
  const nav = $("vl-path-nav");
  const stage = $("vl-stage");
  const prev = $("vl-prev");
  const next = $("vl-next");
  let step = 0;

  const screens = [
    {
      title: "Bits are coefficients",
      take: "Each bit says whether that power of x is in the polynomial. Tap the tiles.",
      mount(box) {
        let v = 0b1011;
        const draw = () => {
          box.replaceChildren(
            tileRow(v, 4, { toggle: (k) => { v ^= 1 << k; draw(); } }),
            el("p", "vl-readout", `<span>Polynomial</span><b>${poly(v)}</b><span>Binary</span><b>${bin(v, 4)}</b><span>Hex</span><b>${hex(v, 1)}</b>`),
          );
        };
        draw();
      },
    },
    {
      title: "Adding is XOR",
      take: "In GF(2), 1 + 1 = 0, so nothing carries. Adding and subtracting are the same operation.",
      mount(box) {
        let a = 0b1010, b = 0b0110;
        const draw = (changed) => {
          const res = tileRow(a ^ b, 4, { cls: "result" });
          box.replaceChildren(
            labelled("A", tileRow(a, 4, { toggle: (k) => { a ^= 1 << k; draw(true); } })),
            labelled("B", tileRow(b, 4, { toggle: (k) => { b ^= 1 << k; draw(true); } })),
            el("div", "vl-rule"),
            labelled("A ⊕ B", res),
            el("p", "vl-readout", `<span>Sum</span><b>(${poly(a)}) + (${poly(b)}) = ${poly(a ^ b)}</b>`),
          );
          if (changed) flash(res);
        };
        draw(false);
      },
    },
    {
      title: "Too big? Reduce",
      take: "Multiplying by x shifts every bit left. If a bit lands on x⁴, XOR with m(x) = x⁴ + x + 1 to fold it back in.",
      mount(box) {
        let v = 0b1001;
        let note = "Press the button to multiply by x.";
        const draw = (over) => {
          const parts = [labelled("Value", tileRow(v, 4))];
          if (over !== undefined) {
            parts.unshift(
              labelled("Shifted", tileRow(over, 5, { cls: "overflow" })),
              labelled("m(x)", tileRow(0x13, 5, { cls: "modulus" })),
              el("div", "vl-rule"),
            );
          }
          const btn = el("button", "primary", "Multiply by x");
          btn.type = "button";
          btn.addEventListener("click", () => {
            const s = v << 1;
            if (s & 0x10) {
              v = s ^ 0x13;
              note = `x⁴ appeared, so we XORed with m(x): ${bin(s, 5)} ⊕ 10011 = ${bin(v, 4)}.`;
              draw(s);
            } else {
              v = s;
              note = `No overflow: just a shift. Now ${bin(v, 4)} = ${poly(v)}.`;
              draw();
            }
          });
          box.replaceChildren(...parts, el("p", "vl-readout", `<span>What happened</span><b>${note}</b>`), btn);
        };
        draw();
      },
    },
    {
      title: "The field is a cycle",
      take: "Keep multiplying 1 by x and you visit all 15 nonzero elements before landing back on 1. That loop is the field.",
      mount(box) {
        let k = 0;
        const strip = el("div", "vl-cycle");
        EXP.forEach((v, i) => strip.append(el("span", i === 0 ? "lit current" : "", `<b>${hex(v, 1)}</b><small>${gpow(i)}</small>`)));
        const out = el("p", "vl-readout", "");
        const btn = el("button", "primary", "Multiply by x");
        btn.type = "button";
        const ring = el("button", "outline", "Spin it in 3D");
        ring.type = "button";
        ring.addEventListener("click", () => $("vl-ring-panel").scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth" }));
        const paint = () => {
          [...strip.children].forEach((c, i) => {
            c.classList.toggle("lit", i <= k);
            c.classList.toggle("current", i === k % 15);
          });
          out.innerHTML = k === 15
            ? `<span>Back to the start</span><b>g<sup>15</sup> = 1. The cycle has length 15 = 2<sup>4</sup> − 1.</b>`
            : `<span>Now at</span><b>${gpow(k)} = ${poly(EXP[k])} = ${hex(EXP[k], 1)}</b>`;
          if (k === 15) [...strip.children].forEach((c) => c.classList.add("done"));
        };
        btn.addEventListener("click", () => {
          if (k === 15) { k = 0; [...strip.children].forEach((c) => c.classList.remove("done")); }
          else k += 1;
          paint();
        });
        paint();
        const actions = el("div", "vl-actions");
        actions.append(btn, ring);
        box.replaceChildren(strip, out, actions);
      },
    },
    {
      title: "Why it matters",
      take: "AES does its byte math in GF(2⁸): SubBytes uses inverses and MixColumns uses multiplication. Binary elliptic-curve cryptography uses fields as large as GF(2⁵⁷¹).",
      mount(box) {
        const watch = el("button", "primary", "Watch {57} × {83} step by step");
        watch.type = "button";
        watch.addEventListener("click", () => {
          $("vl-a").value = "57"; $("vl-b").value = "83";
          $("vl-shift").scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth" });
          window.__vlShiftReset?.(true);
        });
        const calc = el("a", "vl-link-button", "Open {57} × {83} in the calculator");
        calc.href = "./?m=8&operation=multiply&base=hex&poly_a=57&poly_b=83#calculator";
        const facts = el("ul", "vl-facts",
          `<li><b>AES S-box</b> sends each byte to its inverse in GF(2<sup>8</sup>), then applies an affine step.</li>
           <li><b>MixColumns</b> multiplies bytes by {02} and {03}: the same shift-and-XOR you just saw.</li>
           <li><b>Binary ECC</b> runs the same rules in GF(2<sup>163</sup>) to GF(2<sup>571</sup>), the fields this calculator supports.</li>`);
        const actions = el("div", "vl-actions");
        actions.append(watch, calc);
        box.replaceChildren(facts, actions);
      },
    },
  ];

  function labelled(text, node) {
    const wrap = el("div", "vl-labelled");
    wrap.append(el("span", "vl-row-label", text), node);
    return wrap;
  }
  // shared with other screens
  window.__vlLabelled = labelled;

  screens.forEach((s, i) => {
    const li = el("li");
    const b = el("button", "", `<span>${i + 1}</span>${s.title}`);
    b.type = "button";
    b.addEventListener("click", () => go(i));
    li.append(b);
    nav.append(li);
  });

  function go(i) {
    step = Math.max(0, Math.min(screens.length - 1, i));
    const s = screens[step];
    [...nav.querySelectorAll("button")].forEach((b, j) => {
      b.toggleAttribute("aria-current", j === step);
      b.classList.toggle("seen", j < step);
    });
    const box = el("div", "vl-play");
    const card = el("div", "vl-screen");
    card.append(el("h3", "", s.title), el("p", "vl-take", s.take), box);
    stage.replaceChildren(card);
    s.mount(box);
    prev.disabled = step === 0;
    next.textContent = step === screens.length - 1 ? "Start over" : "Next";
  }
  prev.addEventListener("click", () => go(step - 1));
  next.addEventListener("click", () => go(step === screens.length - 1 ? 0 : step + 1));
  window.__vlGoto = go;
  go(0);
}

/* ------------------------------------------- 2. Shift-and-XOR animation */
function setupShift() {
  const belt = $("vl-belt");
  const caption = $("vl-caption");
  const table = $("vl-shift-table");
  const play = $("vl-play");
  let frames = [];
  let at = 0;
  let timer = null;

  // Belt skeleton: power header, B row, x^i·A row (9 cells incl. overflow), m(x) row, result row.
  const rows = {};
  function row(key, label, n) {
    const r = el("div", `vl-belt-row ${key}`);
    r.append(el("span", "vl-row-label", label));
    const cells = el("div", "vl-cells");
    for (let i = 0; i < 9; i++) cells.append(el("span", i < 9 - n ? "vl-cell ghost" : "vl-cell", ""));
    r.append(cells);
    belt.append(r);
    rows[key] = { r, cells: [...cells.children], box: cells };
  }
  const head = el("div", "vl-belt-row head");
  head.append(el("span", "vl-row-label", ""));
  const hc = el("div", "vl-cells");
  for (let k = 8; k >= 0; k--) hc.append(el("span", "vl-cell power", `<span>${k === 0 ? "1" : k === 1 ? "x" : `x<sup>${k}</sup>`}</span>`));
  head.append(hc);
  belt.append(head);
  row("b", "B", 8);
  row("a", "x<sup>i</sup> · A", 9);
  row("m", "m(x)", 9);
  row("acc", "Result", 8);

  function setRow(key, value, n, { highlight = -1, flip = false } = {}) {
    const cells = rows[key].cells;
    for (let k = 0; k < 9; k++) {
      const c = cells[8 - k];
      if (k >= n) { c.className = k === 8 && key === "a" ? "vl-cell slot" : "vl-cell ghost"; c.textContent = ""; continue; }
      const on = (value >> k) & 1;
      const was = c.textContent;
      c.className = `vl-cell${on ? " on" : ""}${k === highlight ? " current" : ""}${k === 8 ? " over" : ""}`;
      c.textContent = String(on);
      if (flip && was !== "" && was !== String(on)) flash(c);
    }
  }

  function build() {
    const A = parseInt($("vl-a").value, 16);
    const B = parseInt($("vl-b").value, 16);
    const ok = (s, v) => /^[0-9a-f]{1,2}$/i.test(s.trim()) && v >= 0 && v <= 255;
    const badA = !ok($("vl-a").value, A), badB = !ok($("vl-b").value, B);
    $("vl-a").setAttribute("aria-invalid", String(badA));
    $("vl-b").setAttribute("aria-invalid", String(badB));
    if (badA || badB) return null;

    const f = [];
    let cur = A, acc = 0;
    f.push({ i: 0, a: cur, acc, b: B, phase: "start", text: `Start with A = {${hex(A)}} and an empty result. We will walk through the 8 bits of B = {${hex(B)}} from low to high.` });
    for (let i = 0; i < 8; i++) {
      const bit = (B >> i) & 1;
      if (bit) acc ^= cur;
      f.push({ i, a: cur, acc, b: B, phase: "check", bit, text: bit
        ? `Bit b<sub>${i}</sub> of B is 1, so XOR x<sup>${i}</sup>·A = {${hex(cur)}} into the result → {${hex(acc)}}.`
        : `Bit b<sub>${i}</sub> of B is 0, so the result stays {${hex(acc)}}.` });
      if (i === 7) break;
      const s = cur << 1;
      f.push({ i, a: s, acc, b: B, phase: "shift", over: !!(s & 0x100), text: s & 0x100
        ? `Shift A left. A 1 spills into x<sup>8</sup>, which is outside the field…`
        : `Shift A left to get x<sup>${i + 1}</sup>·A = {${hex(s)}}. Nothing spilled over.` });
      if (s & 0x100) {
        cur = s ^ AES_MOD;
        f.push({ i, a: cur, acc, b: B, phase: "reduce", text: `…so XOR with m(x) = {11B}. The x<sup>8</sup> bit cancels, leaving x<sup>${i + 1}</sup>·A = {${hex(cur)}}.` });
      } else cur = s;
    }
    f.push({ i: 8, a: cur, acc, b: B, phase: "done", text: `Done: {${hex(A)}} × {${hex(B)}} = {${hex(acc)}} = ${poly(acc)}.` });
    return f;
  }

  function show(idx, animate) {
    const fr = frames[idx];
    if (!fr) return;
    const prevFr = frames[idx - 1];
    const draw = () => {
      setRow("b", fr.b, 8, { highlight: fr.phase === "done" || fr.phase === "start" ? -1 : fr.i });
      setRow("a", fr.a, 9, { flip: animate });
      setRow("m", AES_MOD, 9);
      setRow("acc", fr.acc, 8, { flip: animate });
      rows.m.r.classList.toggle("show", fr.phase === "reduce" || (fr.phase === "shift" && fr.over));
      rows.acc.r.classList.toggle("hit", fr.phase === "check" && fr.bit === 1);
      rows.acc.r.classList.toggle("final", fr.phase === "done");
      caption.innerHTML = fr.text;
    };
    if (animate && fr.phase === "shift" && prevFr && !reduceMotion.matches) {
      rows.a.box.classList.add("sliding");
      setTimeout(() => { rows.a.box.classList.remove("sliding"); draw(); }, 380);
    } else draw();
  }

  function renderTable() {
    const rowsHtml = [];
    let i = -1;
    for (const fr of frames) {
      if (fr.phase !== "check") continue;
      i = fr.i;
      rowsHtml.push(`<tr${fr.bit ? ' class="used"' : ""}><td>${i}</td><td>${fr.bit}</td><td>{${hex(fr.a)}}</td><td>${bin(fr.a, 8)}</td><td>${fr.bit ? "XOR in" : "skip"}</td><td>{${hex(fr.acc)}}</td></tr>`);
    }
    const last = frames[frames.length - 1];
    table.innerHTML = `
      <table class="vl-table">
        <caption>Shift-and-XOR for {${$("vl-a").value.toUpperCase()}} × {${$("vl-b").value.toUpperCase()}} with m(x) = x<sup>8</sup> + x<sup>4</sup> + x<sup>3</sup> + x + 1</caption>
        <thead><tr><th>i</th><th>b<sub>i</sub></th><th>x<sup>i</sup>·A mod m</th><th>Binary</th><th>Action</th><th>Running result</th></tr></thead>
        <tbody>${rowsHtml.join("")}</tbody>
      </table>
      <p class="vl-derivation">Result: ${last.text.replace("Done: ", "")}</p>`;
  }

  function stop() { clearInterval(timer); timer = null; play.textContent = "Play"; }
  function reset(autoplay) {
    stop();
    const f = build();
    if (!f) { caption.textContent = "Enter two hex bytes from 00 to FF."; table.innerHTML = `<p class="vl-derivation">Enter two hex bytes from 00 to FF.</p>`; return; }
    frames = f; at = 0;
    show(0, false);
    renderTable();
    if (autoplay && mode === "visual") toggle();
  }
  function stepOnce() {
    if (at >= frames.length - 1) { stop(); return false; }
    at += 1; show(at, true);
    if (at >= frames.length - 1) stop();
    return true;
  }
  function toggle() {
    if (timer) { stop(); return; }
    if (at >= frames.length - 1) { at = 0; show(0, false); }
    play.textContent = "Pause";
    timer = setInterval(stepOnce, Number($("vl-speed").value));
  }

  play.addEventListener("click", toggle);
  $("vl-step").addEventListener("click", () => { stop(); stepOnce(); });
  $("vl-reset").addEventListener("click", () => reset(false));
  $("vl-speed").addEventListener("change", () => { if (timer) { stop(); toggle(); } });
  for (const id of ["vl-a", "vl-b"]) $(id).addEventListener("input", () => reset(false));
  document.addEventListener("learnmodechange", stop);
  window.__vlShiftReset = reset;
  reset(false);
}

/* ------------------------------------------------- 3. The 3D field ring */
function setupRing() {
  const stage = $("vl-ring-stage");
  const ringEl = $("vl-ring");
  const inspector = $("vl-inspector");
  const tableBox = $("vl-power-table");
  const STEP = (2 * Math.PI) / 15;
  const TILT = 0.38;
  let spin = 0, target = null, velocity = 0, dragging = false, lastX = 0, idle = 0;
  let a = 3, b = 7, pick = "a", trail = [], result = null, note = "";

  // Orbit drawn as SVG, nodes as buttons projected in JS so labels always face the viewer.
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "vl-orbit");
  const orbit = document.createElementNS(svgNS, "ellipse");
  const path = document.createElementNS(svgNS, "polyline");
  path.setAttribute("class", "vl-trail");
  svg.append(orbit, path);
  ringEl.append(svg);
  const hub = el("div", "vl-hub", `<b>0</b><small>outside the cycle</small>`);
  ringEl.append(hub);

  const nodes = EXP.map((v, k) => {
    const n = el("button", "vl-node", `<b>${hex(v, 1)}</b><small>${gpow(k)}</small>`);
    n.type = "button";
    n.setAttribute("aria-label", `g to the ${k}, value ${hex(v, 1)}, ${bin(v, 4)}`);
    n.addEventListener("click", () => choose(k));
    ringEl.append(n);
    return n;
  });

  function geometry() {
    const w = ringEl.clientWidth, h = ringEl.clientHeight;
    return { cx: w / 2, cy: h / 2, R: Math.min(w * 0.42, h * 0.95), persp: 900 };
  }
  function project(k, g) {
    const th = k * STEP + spin;
    const x = g.R * Math.sin(th);
    const z0 = g.R * Math.cos(th);
    const y = z0 * Math.sin(TILT) * 0.9;
    const z = z0 * Math.cos(TILT);
    const s = g.persp / (g.persp - z);
    return { x: g.cx + x * s, y: g.cy + y * s, s, z };
  }
  function frame() {
    if (!view.hidden && mode === "visual") {
      if (target !== null) {
        let d = target - spin;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        spin += d * (reduceMotion.matches ? 1 : 0.12);
        if (Math.abs(d) < 0.002) target = null;
      } else if (!dragging) {
        spin += velocity;
        velocity *= 0.94;
        if (Math.abs(velocity) < 0.0004 && performance.now() - idle > 4000 && !reduceMotion.matches) spin += 0.0018;
      }
      const g = geometry();
      orbit.setAttribute("cx", g.cx); orbit.setAttribute("cy", g.cy);
      orbit.setAttribute("rx", g.R); orbit.setAttribute("ry", g.R * Math.sin(TILT) * 0.9);
      const pts = [];
      nodes.forEach((n, k) => {
        const p = project(k, g);
        n.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${p.s.toFixed(3)})`;
        n.style.zIndex = String(Math.round(p.z + 1000));
        n.style.opacity = String(0.45 + 0.55 * ((p.z / g.R + 1) / 2));
      });
      for (const k of trail) { const p = project(k, g); pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`); }
      path.setAttribute("points", pts.join(" "));
    }
    requestAnimationFrame(frame);
  }

  const face = (k) => { target = -k * STEP; };
  function paint() {
    nodes.forEach((n, k) => {
      n.classList.toggle("is-a", k === a);
      n.classList.toggle("is-b", k === b);
      n.classList.toggle("is-result", k === result);
      n.classList.toggle("on-trail", trail.includes(k));
    });
    const card = (label, k, cls) => k === null ? "" : `
      <div class="vl-el ${cls}">
        <span class="vl-el-tag">${label}</span>
        <b class="vl-el-hex">${hex(EXP[k], 1)}</b>
        <span class="vl-el-pow">${gpow(k)}</span>
        <span class="vl-el-poly">${poly(EXP[k])}</span>
        <span class="vl-el-bin">${bin(EXP[k], 4)}</span>
      </div>`;
    inspector.innerHTML = `
      <div class="vl-pick">
        <span>Clicking an element sets</span>
        <div class="segments" role="group" aria-label="Which element a click sets">
          <button type="button" data-pick="a" aria-pressed="${pick === "a"}">A</button>
          <button type="button" data-pick="b" aria-pressed="${pick === "b"}">B</button>
        </div>
      </div>
      <div class="vl-els">${card("A", a, "a")}${card("B", b, "b")}</div>
      <div class="vl-ops">
        <button type="button" class="outline" data-op="g">A × g</button>
        <button type="button" class="primary" data-op="mul">A × B</button>
        <button type="button" class="outline" data-op="inv">Inverse of A</button>
      </div>
      <div class="vl-answer">${note || "Pick A and B, then choose an operation."}</div>`;
    inspector.querySelectorAll("[data-pick]").forEach((btn) => btn.addEventListener("click", () => { pick = btn.dataset.pick; paint(); }));
    inspector.querySelectorAll("[data-op]").forEach((btn) => btn.addEventListener("click", () => run(btn.dataset.op)));
    tableBox.querySelectorAll("tr[data-k]").forEach((tr) => {
      const k = Number(tr.dataset.k);
      tr.classList.toggle("is-a", k === a);
      tr.classList.toggle("is-b", k === b);
      tr.classList.toggle("is-result", k === result);
    });
  }
  function choose(k) {
    if (pick === "a") a = k; else b = k;
    result = null; trail = []; note = "";
    face(k); idle = performance.now();
    paint();
  }

  let walkTimer = null;
  function walk(from, steps, done) {
    clearInterval(walkTimer);
    trail = [from];
    let i = 0;
    const tick = () => {
      if (i >= steps) { clearInterval(walkTimer); done(); return; }
      i += 1;
      const k = (from + i) % 15;
      trail.push(k);
      face(k);
      paint();
    };
    if (mode === "classic" || reduceMotion.matches) { for (let j = 1; j <= steps; j++) trail.push((from + j) % 15); done(); return; }
    walkTimer = setInterval(tick, Math.max(110, 900 / Math.max(steps, 1)));
  }
  function run(op) {
    idle = performance.now();
    if (op === "g") {
      const r = (a + 1) % 15;
      walk(a, 1, () => {
        result = r;
        note = `<p>${gpow(a)} · g = ${gpow(r)}</p><p class="vl-big">${hex(EXP[a], 1)} · 2 = <b>${hex(EXP[r], 1)}</b></p><p>One step around the ring. In bits: shift left${EXP[a] & 8 ? ", then XOR with 10011 because x<sup>4</sup> appeared" : ", no reduction needed"}.</p>`;
        a = r; face(r); paint();
      });
    } else if (op === "mul") {
      const r = (a + b) % 15;
      walk(a, b, () => {
        result = r; face(r);
        note = `<p>${gpow(a)} · ${gpow(b)} = g<sup>${a}+${b}</sup> = ${gpow(r)}${a + b >= 15 ? ` <span class="vl-muted">(because g<sup>15</sup> = 1)</span>` : ""}</p><p class="vl-big">${hex(EXP[a], 1)} × ${hex(EXP[b], 1)} = <b>${hex(EXP[r], 1)}</b></p><p>Multiplying by B = ${gpow(b)} means turning ${b} step${b === 1 ? "" : "s"} from A. Exponents add, so multiplication is rotation.</p>`;
        paint();
      });
    } else {
      const r = (15 - a) % 15;
      walk(a, (15 - a) % 15 || 0, () => {
        result = r;
        note = `<p>A<sup>−1</sup> = ${gpow(r)} because ${gpow(a)} · ${gpow(r)} = g<sup>15</sup> = 1</p><p class="vl-big">${hex(EXP[a], 1)}<sup>−1</sup> = <b>${hex(EXP[r], 1)}</b></p><p>The inverse is the element that turns you the rest of the way back to 1. Check: ${hex(EXP[a], 1)} × ${hex(EXP[r], 1)} = 1.</p>`;
        trail = [a, ...Array.from({ length: (15 - a) % 15 }, (_, j) => (a + j + 1) % 15)];
        face(0); paint();
      });
    }
  }

  // Classic: the textbook power (antilog) table, rows selectable.
  tableBox.innerHTML = `
    <table class="vl-table vl-power">
      <caption>Powers of g = x in GF(2<sup>4</sup>) with m(x) = x<sup>4</sup> + x + 1. Click a row to set A or B.</caption>
      <thead><tr><th>Power</th><th>Polynomial</th><th>Binary</th><th>Hex</th></tr></thead>
      <tbody>${EXP.map((v, k) => `<tr data-k="${k}" tabindex="0"><td>${gpow(k)}</td><td>${poly(v)}</td><td>${bin(v, 4)}</td><td>${hex(v, 1)}</td></tr>`).join("")}</tbody>
    </table>`;
  tableBox.querySelectorAll("tr[data-k]").forEach((tr) => {
    const pickRow = () => choose(Number(tr.dataset.k));
    tr.addEventListener("click", pickRow);
    tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickRow(); } });
  });

  // Drag / swipe to spin.
  ringEl.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".vl-node")) return;
    dragging = true; target = null; lastX = e.clientX; velocity = 0;
    ringEl.setPointerCapture(e.pointerId);
    ringEl.classList.add("grabbing");
  });
  ringEl.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    spin += dx * 0.008;
    velocity = dx * 0.008;
  });
  const end = () => { dragging = false; idle = performance.now(); ringEl.classList.remove("grabbing"); };
  ringEl.addEventListener("pointerup", end);
  ringEl.addEventListener("pointercancel", end);
  stage.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { target = (target ?? spin) - STEP; }
    if (e.key === "ArrowRight") { target = (target ?? spin) + STEP; }
  });

  face(a);
  paint();
  requestAnimationFrame(frame);
}
