// Finite Field Lab: hero bit strip. Purely presentational: reads the modulus the app
// already renders into #mod-bin and draws one cell per coefficient (amber = 1).
const hero = document.querySelector('[data-lab-view="calculator"] .hero');
const source = document.getElementById("mod-bin");
const polySource = document.getElementById("mod-poly");

if (hero && source) {
  const strip = document.createElement("div");
  strip.className = "field-strip";
  strip.setAttribute("aria-hidden", "true");
  hero.append(strip);

  const render = () => {
    const bits = (source.textContent || "").replace(/[^01]/g, "");
    if (!bits) return;
    const m = bits.length - 1;
    const ones = [...bits].filter((b) => b === "1").length;
    const cells = [...bits]
      .map((b, i) => `<i class="${b === "1" ? "on" : ""}" style="--i:${i}"></i>`)
      .join("");
    strip.innerHTML = `
      <div class="field-strip-bits" style="gap:${m > 200 ? 1 : 2}px">${cells}</div>
      <div class="field-strip-caption">
        <span>m(x) = <b>${(polySource?.innerHTML || "").trim()}</b></span>
        <span><b>${m + 1}</b> coefficients · <b>${ones}</b> set · x<sup>${m}</sup> … x<sup>0</sup></span>
      </div>`;
  };

  new MutationObserver(render).observe(source, { childList: true, characterData: true, subtree: true });
  render();
}
