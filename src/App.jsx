import { useLayoutEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

const STORE = "quote-maker-defaults";
const BLOCKS = { client: "Client details", items: "Items & prices", totals: "Totals", option: "Optional service box", agreement: "Agreement & signature", keys: "Key table (explanations)", notes: "Notes & terms" };
const ALIGN = { left: "Left", center: "Center", right: "Right" };
const HEADERS = {
  "logo-left": "Logo left, details right",
  "logo-right": "Logo right, details left",
  center: "Centered",
};

const INITIAL = {
  brand: { logoUrl: "", watermark: true, watermarkOpacity: 7, accent: "#0f766e" },
  company: { name: "", address: "", email: "", phone: "", taxId: "", website: "" },
  client: { name: "", company: "", address: "", email: "", logo: "", logoPos: "left", logoSize: 84 },
  quote: { title: "Quotation", number: "Q-0001", date: new Date().toISOString().slice(0, 10), validUntil: "" },
  items: [{ desc: "", qty: 1, price: "", note: "" }],
  keyIntro: "Items marked with a key letter are explained below. Please refer to the matching key.",
  money: { currency: "USD", tax: 0, discount: 0 },
  option: { show: false, title: "Optional service", text: "", amount: "", label: "Estimated total with this option" },
  agreement: { show: true, title: "Agreement & acceptance", text: "", optIn: true, optInText: "I would like to proceed with the optional service above.", companySign: true, signatory: "" },
  notes: "",
  terms: "",
  footer: {
    text: "Thank you for your business.", tagAlign: "left", tagStyle: "normal",
    extra: "", extraAlign: "left", order: "tag-first",
    qrUrl: "", qrLabel: "Scan to view or accept", qrPos: "right", qrAlign: "end", qrSize: 84,
    showLine: true,
  },
  layout: { header: "logo-left", order: ["client", "items", "totals", "option", "keys", "notes", "agreement"], hidden: [] },
};

const REQUIRED = [
  ["brand.logoUrl", "Logo URL"],
  ["company.name", "Company name"],
  ["company.email", "Company email"],
  ["client.name", "Client name"],
  ["quote.number", "Quote number"],
  ["footer.qrUrl", "QR code link"],
];

const keyName = (n) => String.fromCharCode(97 + (n % 26)) + (n >= 26 ? Math.floor(n / 26) : "");
const get = (o, p) => p.split(".").reduce((a, k) => a?.[k], o);
const setIn = (o, p, v) => {
  const [k, ...rest] = p.split(".");
  return { ...o, [k]: rest.length ? setIn(o[k], rest.join("."), v) : v };
};
const merge = (base, over) => {
  const out = { ...base };
  for (const k in over || {}) {
    out[k] = base[k] && typeof base[k] === "object" && !Array.isArray(base[k]) ? merge(base[k], over[k]) : over[k];
  }
  return out;
};
const load = () => {
  try { return merge(INITIAL, JSON.parse(localStorage.getItem(STORE))); } catch { return INITIAL; }
};

function Field({ d, set, p, label, type = "text", area, ...r }) {
  const req = REQUIRED.some(([k]) => k === p);
  const Tag = area ? "textarea" : "input";
  return (
    <label className="fld">
      <span>{label}{req && <b title="Required to print"> *</b>}</span>
      <Tag id={"f-" + p} type={type} rows={area ? 3 : undefined} value={get(d, p) ?? ""}
        onChange={(e) => set(p, e.target.value)} {...r} />
    </label>
  );
}

const Check = ({ d, set, p, label }) => (
  <label className="row"><input type="checkbox" checked={!!get(d, p)} onChange={(e) => set(p, e.target.checked)} /> {label}</label>
);

const Pick = ({ d, set, p, label, opts }) => (
  <label className="fld"><span>{label}</span>
    <select value={get(d, p)} onChange={(e) => set(p, e.target.value)}>
      {Object.entries(opts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select></label>
);

export default function App() {
  const [d, setD] = useState(load);
  const [missing, setMissing] = useState(null);
  const [note, setNote] = useState("");
  const fileRef = useRef();
  const headRef = useRef(), footRef = useRef();
  const [hh, setHh] = useState(0), [fh, setFh] = useState(0);
  useLayoutEffect(() => {
    const measure = () => { setHh(headRef.current?.offsetHeight || 0); setFh(footRef.current?.offsetHeight || 0); };
    measure();
    const ro = new ResizeObserver(measure);
    headRef.current && ro.observe(headRef.current);
    footRef.current && ro.observe(footRef.current);
    window.addEventListener("beforeprint", measure);
    return () => { ro.disconnect(); window.removeEventListener("beforeprint", measure); };
  }, []);
  const set = (p, v) => setD((s) => setIn(s, p, v));
  const flash = (m) => { setNote(m); setTimeout(() => setNote(""), 2200); };

  const money = (n) => {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: d.money.currency || "USD" }).format(n); }
    catch { return Number(n).toFixed(2); }
  };
  const sub = d.items.reduce((a, i) => a + (+i.qty || 0) * (+i.price || 0), 0);
  const disc = (sub * (+d.money.discount || 0)) / 100;
  const tax = ((sub - disc) * (+d.money.tax || 0)) / 100;
  const total = sub - disc + tax;

  const order = [...d.layout.order, ...Object.keys(BLOCKS).filter((k) => !d.layout.order.includes(k))];
  const keyOf = {};
  let kn = 0;
  d.items.forEach((it, i) => { if ((it.note || "").trim()) keyOf[i] = keyName(kn++); });
  const hasKeys = kn > 0;
  const skipped = (it) => it.price === "" || it.price == null;

  const setItem = (i, k, v) => set("items", d.items.map((it, n) => (n === i ? { ...it, [k]: v } : it)));
  const move = (key, dir) => {
    const o = [...order]; const i = o.indexOf(key); const j = i + dir;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]]; set("layout.order", o);
  };
  const toggle = (key) => {
    const h = d.layout.hidden;
    set("layout.hidden", h.includes(key) ? h.filter((x) => x !== key) : [...h, key]);
  };

  const tryPrint = () => {
    const m = REQUIRED.filter(([p]) => !String(get(d, p) || "").trim());
    if (!d.items.some((i) => i.desc.trim())) m.push(["items", "At least one item"]);
    m.length ? setMissing(m) : window.print();
  };
  const goTo = (p) => {
    setMissing(null);
    setTimeout(() => {
      const el = document.getElementById("f-" + p);
      if (el) { el.closest("details")?.setAttribute("open", ""); el.focus(); el.scrollIntoView({ block: "center" }); }
    }, 50);
  };

  const saveDefaults = () => { localStorage.setItem(STORE, JSON.stringify(d)); flash("Saved as defaults"); };
  const resetAll = () => { localStorage.removeItem(STORE); setD(INITIAL); flash("Reset"); };
  const exportJson = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }));
    a.download = "quote-defaults.json"; a.click();
  };
  const importJson = (e) => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((t) => { setD(merge(INITIAL, JSON.parse(t))); flash("Defaults loaded"); })
      .catch(() => flash("That file isn't valid JSON"));
    e.target.value = "";
  };

  const hdr = d.layout.header;
  const accent = { "--accent": d.brand.accent };

  const blocks = {
    client: (
      <section className={"blk clientblk pos-" + d.client.logoPos} key="client">
        {d.client.logo && <img className="clogo" src={d.client.logo} alt="" style={{ width: d.client.logoSize, height: d.client.logoSize }} />}
        <div>
          <h4>Prepared for</h4>
          <p><strong>{d.client.name}</strong></p>
          {d.client.company && <p>{d.client.company}</p>}
          {d.client.address && <p className="pre">{d.client.address}</p>}
          {d.client.email && <p>{d.client.email}</p>}
        </div>
      </section>
    ),
    items: (
      <table className="items" key="items">
        <thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead>
        <tbody>
          {d.items.map((i, n) => ({ i, n })).filter(({ i }) => i.desc || i.note || (i.price !== "" && +i.price)).map(({ i, n }) => {
            const k = keyOf[n];
            const cell = (v) => (skipped(i) ? (k ? <span className="kref-cell">See key <span className="kb">{k}</span></span> : "—") : v);
            return (
              <tr key={n}>
                <td className="pre">{i.desc}{k && !skipped(i) && <sup className="kb sm">{k}</sup>}</td>
                <td>{i.qty}</td>
                <td>{cell(money(i.price))}</td>
                <td>{cell(money((+i.qty || 0) * (+i.price || 0)))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    ),
    totals: (
      <div className="totals" key="totals">
        <div><span>Subtotal</span><span>{money(sub)}</span></div>
        {+d.money.discount > 0 && <div><span>Discount ({d.money.discount}%)</span><span>−{money(disc)}</span></div>}
        {+d.money.tax > 0 && <div><span>Tax ({d.money.tax}%)</span><span>{money(tax)}</span></div>}
        <div className="grand"><span>Total</span><span>{money(total)}</span></div>
      </div>
    ),
    option: d.option.show && (
      <section className="optbox" key="option">
        <h4>{d.option.title}</h4>
        {d.option.text && <p className="pre">{d.option.text}</p>}
        {d.option.amount !== "" && (
          <>
            <div className="optrow"><span>Additional amount</span><span>{money(+d.option.amount || 0)}</span></div>
            <div className="optrow grand"><span>{d.option.label}</span><span>{money(total + (+d.option.amount || 0))}</span></div>
          </>
        )}
      </section>
    ),
    agreement: d.agreement.show && (
      <section className="blk agree" key="agreement">
        <h4>{d.agreement.title}</h4>
        {d.agreement.text && <p className="pre small">{d.agreement.text}</p>}
        {d.agreement.optIn && d.option.show && <p className="tick"><span className="box" /> {d.agreement.optInText}</p>}
        <div className="sigs">
          {[["Client", d.client.name], ...(d.agreement.companySign ? [["For " + (d.company.name || "company"), d.agreement.signatory]] : [])].map(([who, name]) => (
            <div className="sig" key={who}>
              <div className="line" />
              <small>{who}{name ? " — " + name : ""}</small>
              <div className="line short" />
              <small>Date</small>
            </div>
          ))}
        </div>
      </section>
    ),
    keys: hasKeys && (
      <section className="blk" key="keys">
        <h4>Key</h4>
        {d.keyIntro && <p className="small">{d.keyIntro}</p>}
        <table className="keytbl"><tbody>
          {d.items.map((it, n) => keyOf[n] && (
            <tr key={n}>
              <td><span className="kb">{keyOf[n]}</span></td>
              <td><strong>{it.desc}</strong><div className="pre">{it.note}</div></td>
            </tr>
          ))}
        </tbody></table>
      </section>
    ),
    notes: (d.notes || d.terms) && (
      <section className="blk" key="notes">
        {d.notes && <><h4>Notes</h4><p className="pre">{d.notes}</p></>}
        {d.terms && <><h4>Terms</h4><p className="pre small">{d.terms}</p></>}
      </section>
    ),
  };

  return (
    <div className="app" style={accent}>
      <aside className="editor">
        <header className="bar">
          <h1>Quote Maker</h1>
          <button className="primary" onClick={tryPrint}>Print / PDF</button>
        </header>
        <div className="tools">
          <button onClick={saveDefaults}>Save as defaults</button>
          <button onClick={exportJson}>Download JSON</button>
          <button onClick={() => fileRef.current.click()}>Upload JSON</button>
          <button className="ghost" onClick={resetAll}>Reset</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={importJson} />
        </div>

        <details open>
          <summary>Branding</summary>
          <Field d={d} set={set} p="brand.logoUrl" label="Logo URL" placeholder="https://…/logo.png" />
          <label className="row"><input type="checkbox" checked={d.brand.watermark} onChange={(e) => set("brand.watermark", e.target.checked)} /> Show logo as watermark</label>
          <label className="fld"><span>Watermark strength ({d.brand.watermarkOpacity}%)</span>
            <input type="range" min="2" max="20" value={d.brand.watermarkOpacity} onChange={(e) => set("brand.watermarkOpacity", +e.target.value)} /></label>
          <label className="fld"><span>Accent colour</span>
            <input type="color" value={d.brand.accent} onChange={(e) => set("brand.accent", e.target.value)} /></label>
        </details>

        <details open>
          <summary>Your company</summary>
          <Field d={d} set={set} p="company.name" label="Company name" />
          <Field d={d} set={set} p="company.address" label="Address" area />
          <Field d={d} set={set} p="company.email" label="Email" type="email" />
          <Field d={d} set={set} p="company.phone" label="Phone" />
          <Field d={d} set={set} p="company.website" label="Website" />
          <Field d={d} set={set} p="company.taxId" label="Tax / PIN number" />
        </details>

        <details>
          <summary>Client</summary>
          <Field d={d} set={set} p="client.name" label="Client name" />
          <Field d={d} set={set} p="client.company" label="Client company" />
          <Field d={d} set={set} p="client.address" label="Address" area />
          <Field d={d} set={set} p="client.email" label="Email" type="email" />
          <label className="fld"><span>Client / other company logo (upload)</span>
            <input type="file" accept="image/*" onChange={(e) => {
              const f = e.target.files[0]; if (!f) return;
              const r = new FileReader(); r.onload = () => set("client.logo", r.result); r.readAsDataURL(f); e.target.value = "";
            }} /></label>
          {d.client.logo && <button className="ghost" onClick={() => set("client.logo", "")}>Remove logo</button>}
          <Pick d={d} set={set} p="client.logoPos" label="Logo position" opts={{ top: "Above client name", left: "Left of client name", right: "Right of client name" }} />
          <label className="fld"><span>Logo box size ({d.client.logoSize}px)</span>
            <input type="range" min="50" max="140" value={d.client.logoSize} onChange={(e) => set("client.logoSize", +e.target.value)} /></label>
        </details>

        <details>
          <summary>Quote details</summary>
          <Field d={d} set={set} p="quote.title" label="Document title" />
          <Field d={d} set={set} p="quote.number" label="Quote number" />
          <Field d={d} set={set} p="quote.date" label="Date" type="date" />
          <Field d={d} set={set} p="quote.validUntil" label="Valid until" type="date" />
        </details>

        <details open>
          <summary>Items & pricing</summary>
          <p className="hint">Leave the price blank to show a key letter instead, and explain the item in the key box.</p>
          {d.items.map((it, i) => (
            <div className="item" key={i}>
              <textarea id={i === 0 ? "f-items" : undefined} rows="2" placeholder="Description" value={it.desc} onChange={(e) => setItem(i, "desc", e.target.value)} />
              <input type="number" min="0" aria-label="Quantity" value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} />
              <input type="number" min="0" step="0.01" aria-label="Unit price" placeholder="Key" value={it.price} onChange={(e) => setItem(i, "price", e.target.value)} />
              <button className="ghost" aria-label="Remove item" onClick={() => set("items", d.items.filter((_, n) => n !== i))}>✕</button>
              <div className="noterow">
                <span className={"kb" + (keyOf[i] ? "" : " off")}>{keyOf[i] || "·"}</span>
                <textarea rows="2" placeholder="Explain this item (appears in the key table)" value={it.note || ""} onChange={(e) => setItem(i, "note", e.target.value)} />
              </div>
            </div>
          ))}
          <button onClick={() => set("items", [...d.items, { desc: "", qty: 1, price: "", note: "" }])}>Add item</button>
          <Field d={d} set={set} p="keyIntro" label="Guide text above the key table" area />
          <Field d={d} set={set} p="money.currency" label="Currency code (USD, KES, EUR…)" />
          <Field d={d} set={set} p="money.discount" label="Discount %" type="number" />
          <Field d={d} set={set} p="money.tax" label="Tax %" type="number" />
        </details>

        <details>
          <summary>Notes & terms</summary>
          <Field d={d} set={set} p="notes" label="Notes" area />
          <Field d={d} set={set} p="terms" label="Terms and conditions" area />
        </details>

        <details>
          <summary>Optional service box</summary>
          <p className="hint">For choices like “we host it for you” vs “you host it yourself”. Shown in a bordered box.</p>
          <Check d={d} set={set} p="option.show" label="Show this box" />
          <Field d={d} set={set} p="option.title" label="Box title" />
          <Field d={d} set={set} p="option.text" label="Conditional clause (e.g. “If you wish us to host this for you…”)" area />
          <Field d={d} set={set} p="option.amount" label="Possible extra amount (blank = don’t show amounts)" type="number" />
          <Field d={d} set={set} p="option.label" label="Label for the new total" />
        </details>

        <details>
          <summary>Agreement & signature</summary>
          <Check d={d} set={set} p="agreement.show" label="Show agreement section" />
          <Field d={d} set={set} p="agreement.title" label="Heading" />
          <Field d={d} set={set} p="agreement.text" label="Agreement clause (client agrees to your terms…)" area />
          <Check d={d} set={set} p="agreement.optIn" label="Add tick box to opt in to the optional service" />
          <Field d={d} set={set} p="agreement.optInText" label="Tick box wording" />
          <Check d={d} set={set} p="agreement.companySign" label="Add company signature line" />
          <Field d={d} set={set} p="agreement.signatory" label="Company signatory name" />
        </details>

        <details open>
          <summary>Footer & QR code</summary>
          <Field d={d} set={set} p="footer.text" label="Tagline" />
          <Pick d={d} set={set} p="footer.tagAlign" label="Tagline alignment" opts={ALIGN} />
          <Pick d={d} set={set} p="footer.tagStyle" label="Tagline style" opts={{ normal: "Normal", bold: "Bold", italic: "Italic" }} />
          <Field d={d} set={set} p="footer.extra" label="Extra footer text (bank details, address…)" area />
          <Pick d={d} set={set} p="footer.extraAlign" label="Extra text alignment" opts={ALIGN} />
          <Pick d={d} set={set} p="footer.order" label="Text order" opts={{ "tag-first": "Tagline, then extra text", "extra-first": "Extra text, then tagline" }} />
          <Field d={d} set={set} p="footer.qrUrl" label="QR code links to" placeholder="https://…" />
          <Field d={d} set={set} p="footer.qrLabel" label="Text under QR" />
          <Pick d={d} set={set} p="footer.qrPos" label="QR code position" opts={{ right: "Right", left: "Left", hidden: "Hidden" }} />
          <Pick d={d} set={set} p="footer.qrAlign" label="QR vertical position" opts={{ start: "Top of footer", center: "Middle", end: "Bottom" }} />
          <label className="fld"><span>QR size ({d.footer.qrSize}px)</span>
            <input type="range" min="60" max="140" value={d.footer.qrSize} onChange={(e) => set("footer.qrSize", +e.target.value)} /></label>
          <label className="row"><input type="checkbox" checked={d.footer.showLine} onChange={(e) => set("footer.showLine", e.target.checked)} /> Show line above footer</label>
        </details>

        <details open>
          <summary>Layout: what goes where</summary>
          <label className="fld"><span>Header arrangement</span>
            <select value={hdr} onChange={(e) => set("layout.header", e.target.value)}>
              {Object.entries(HEADERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          <p className="hint">Order the sections on the page. Untick to hide one.</p>
          {order.map((k, i) => (
            <div className="ord" key={k}>
              <input type="checkbox" aria-label={"Show " + BLOCKS[k]} checked={!d.layout.hidden.includes(k)} onChange={() => toggle(k)} />
              <span>{BLOCKS[k]}</span>
              <button disabled={i === 0} onClick={() => move(k, -1)} aria-label="Move up">↑</button>
              <button disabled={i === order.length - 1} onClick={() => move(k, 1)} aria-label="Move down">↓</button>
            </div>
          ))}
        </details>
      </aside>

      <main className="stage">
        <article className="sheet">
          {d.brand.watermark && d.brand.logoUrl && (
            <img className="wm" src={d.brand.logoUrl} alt="" style={{ opacity: d.brand.watermarkOpacity / 100 }} />
          )}
          <header ref={headRef} className={"head " + hdr}>
            {d.brand.logoUrl ? <img className="logo" src={d.brand.logoUrl} alt={d.company.name + " logo"} /> : <div className="logo ph">Logo</div>}
            <div className="co">
              <strong>{d.company.name || "Company name"}</strong>
              {d.company.address && <span className="pre">{d.company.address}</span>}
              {d.company.email && <span>{d.company.email}</span>}
              {d.company.phone && <span>{d.company.phone}</span>}
              {d.company.website && <span>{d.company.website}</span>}
              {d.company.taxId && <span>Tax ID: {d.company.taxId}</span>}
            </div>
          </header>

          <table className="paged">
            <thead><tr><td><div style={{ height: `calc(16mm + ${hh}px + 4mm)` }} /></td></tr></thead>
            <tbody><tr><td>
          <div className="titlebar">
            <h2>{d.quote.title}</h2>
            <dl>
              <dt>No.</dt><dd>{d.quote.number}</dd>
              <dt>Date</dt><dd>{d.quote.date}</dd>
              {d.quote.validUntil && <><dt>Valid until</dt><dd>{d.quote.validUntil}</dd></>}
            </dl>
          </div>

          <div className="body">
            {order.filter((k) => !d.layout.hidden.includes(k)).map((k) => blocks[k])}
          </div>
            </td></tr></tbody>
            <tfoot><tr><td><div style={{ height: `calc(12mm + ${fh}px + 4mm)` }} /></td></tr></tfoot>
          </table>

          <footer ref={footRef} className={"foot qr-" + d.footer.qrPos + (d.footer.showLine ? " line" : "")} style={{ alignItems: { start: "flex-start", center: "center", end: "flex-end" }[d.footer.qrAlign] }}>
            <div className={"foot-main " + d.footer.order}>
              {d.footer.text && <p className={"tag " + d.footer.tagStyle} style={{ textAlign: d.footer.tagAlign }}>{d.footer.text}</p>}
              {d.footer.extra && <p className="extra pre" style={{ textAlign: d.footer.extraAlign }}>{d.footer.extra}</p>}
            </div>
            {d.footer.qrUrl && d.footer.qrPos !== "hidden" && (
              <figure>
                <QRCodeSVG value={d.footer.qrUrl} size={d.footer.qrSize} level="M" />
                {d.footer.qrLabel && <figcaption style={{ maxWidth: d.footer.qrSize + 10 }}>{d.footer.qrLabel}</figcaption>}
              </figure>
            )}
          </footer>
        </article>
      </main>

      {missing && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="card">
            <h3>Some details are missing</h3>
            <p>Fill these in before printing, or print anyway.</p>
            <ul>{missing.map(([p, l]) => <li key={p}>{l} <button className="ghost" onClick={() => goTo(p)}>Go to field</button></li>)}</ul>
            <div className="acts">
              <button onClick={() => setMissing(null)}>Keep editing</button>
              <button className="primary" onClick={() => { setMissing(null); setTimeout(() => window.print(), 50); }}>Print anyway</button>
            </div>
          </div>
        </div>
      )}
      {note && <div className="toast" role="status">{note}</div>}
    </div>
  );
}
