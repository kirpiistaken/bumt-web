import { html, render, useState } from 'https://unpkg.com/htm@3.1.1/preact/standalone.module.js';
const C = ['Hazırlık', '1. sınıf', '2. sınıf', '3. sınıf'];
function F() {
  const [f, setF] = useState({ a: '1. sınıf', b: '1. sınıf', x: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return html`<div>
    <p>ESKI <select id="old" value=${f.a} onChange=${set('a')}>${C.map((c) => html`<option>${c}</option>`)}</select></p>
    <p>YENI <select id="new" value=${f.b} onChange=${set('b')}>${C.map((c) => html`<option value=${c}>${c}</option>`)}</select></p>
    <p>metin <input id="x" value=${f.x} onInput=${set('x')} /></p>
    <pre id="state">STATE ${JSON.stringify(f)}</pre></div>`;
}
render(html`<${F} />`, document.getElementById('a'));
