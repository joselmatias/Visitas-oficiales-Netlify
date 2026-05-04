// UI wiring — sidebar, timeline, modal, clock
(function() {
  const list = document.getElementById('country-list');
  const timeline = document.getElementById('timeline');
  const modal = document.getElementById('modal-backdrop');
  const modalClose = document.getElementById('modal-close');
  const clockEl = document.getElementById('clock');

  let currentIdx = 0;
  let filter = 'all';

  function tick() {
    const d = new Date();
    clockEl.textContent = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  }
  tick(); setInterval(tick, 1000);

  function renderFlag(visit, size = { w: 32, h: 22 }) {
    const { type, colors } = visit.flag;
    const w = size.w, h = size.h;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.style.display = 'block';
    function rect(x,y,ww,hh,f){
      const r = document.createElementNS(svgNS,'rect');
      r.setAttribute('x',x); r.setAttribute('y',y);
      r.setAttribute('width',ww); r.setAttribute('height',hh);
      r.setAttribute('fill',f);
      svg.appendChild(r);
    }
    function circle(cx,cy,r,f){
      const c = document.createElementNS(svgNS,'circle');
      c.setAttribute('cx',cx); c.setAttribute('cy',cy);
      c.setAttribute('r',r); c.setAttribute('fill',f);
      svg.appendChild(c);
    }
    function poly(pts, f){
      const p = document.createElementNS(svgNS,'polygon');
      p.setAttribute('points', pts);
      p.setAttribute('fill', f);
      svg.appendChild(p);
    }
    function star(cx,cy,r,f){
      let pts = '';
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI/2 + i * Math.PI/5;
        const rr = (i%2===0) ? r : r * 0.45;
        pts += `${cx + Math.cos(ang)*rr},${cy + Math.sin(ang)*rr} `;
      }
      poly(pts, f);
    }
    function path(d, f) {
      const p = document.createElementNS(svgNS,'path');
      p.setAttribute('d', d); p.setAttribute('fill', f);
      svg.appendChild(p);
    }

    if (type === 'stripes-v') {
      rect(0, 0, w/3, h, colors[0]);
      rect(w/3, 0, w/3, h, colors[1]);
      rect(2*w/3, 0, w/3, h, colors[2]);
    } else if (type === 'stripes-h') {
      rect(0, 0, w, h/3, colors[0]);
      rect(0, h/3, w, h/3, colors[1]);
      rect(0, 2*h/3, w, h/3, colors[2]);
    } else if (type === 'stripes-h5') {
      // Costa Rica: blue/white/red/white/blue 1:1:2:1:1
      const units = 6;
      const u = h/units;
      rect(0,0,w,u,colors[0]);
      rect(0,u,w,u,colors[1]);
      rect(0,2*u,w,2*u,colors[2]);
      rect(0,4*u,w,u,colors[1]);
      rect(0,5*u,w,u,colors[0]);
    } else if (type === 'sun') {
      rect(0,0,w,h,colors[0]);
      circle(w/2, h/2, h*0.26, colors[1]);
      path(`M ${w/2 - h*0.26} ${h/2} a ${h*0.26} ${h*0.26} 0 0 1 ${h*0.52} 0 a ${h*0.13} ${h*0.13} 0 0 1 -${h*0.26} 0 a ${h*0.13} ${h*0.13} 0 0 0 -${h*0.26} 0 z`, colors[2]);
      const barW = w*0.08, barH = h*0.05;
      rect(w*0.1, h*0.15, barW, barH, '#111');
      rect(w-barW-w*0.1, h*0.15, barW, barH, '#111');
      rect(w*0.1, h-barH-h*0.15, barW, barH, '#111');
      rect(w-barW-w*0.1, h-barH-h*0.15, barW, barH, '#111');
    } else if (type === 'usa') {
      for (let i = 0; i < 13; i++) rect(0, i * h/13, w, h/13, i % 2 === 0 ? colors[0] : colors[1]);
      rect(0, 0, w*0.4, h*7/13, colors[2]);
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 5; c++)
          circle(w*0.05 + c*(w*0.4-w*0.1)/4, h*0.05 + r*(h*7/13-h*0.1)/3, 0.6, '#fff');
    } else if (type === 'uk') {
      // Union Jack (simplified)
      rect(0,0,w,h,colors[0]);
      // White saltire
      const sw = h*0.22;
      // diagonals
      const d1 = document.createElementNS(svgNS,'line');
      d1.setAttribute('x1',0); d1.setAttribute('y1',0); d1.setAttribute('x2',w); d1.setAttribute('y2',h);
      d1.setAttribute('stroke',colors[1]); d1.setAttribute('stroke-width',sw);
      svg.appendChild(d1);
      const d2 = document.createElementNS(svgNS,'line');
      d2.setAttribute('x1',0); d2.setAttribute('y1',h); d2.setAttribute('x2',w); d2.setAttribute('y2',0);
      d2.setAttribute('stroke',colors[1]); d2.setAttribute('stroke-width',sw);
      svg.appendChild(d2);
      // Red saltire (thinner)
      const rsw = h*0.08;
      const r1 = d1.cloneNode(); r1.setAttribute('stroke',colors[2]); r1.setAttribute('stroke-width',rsw);
      svg.appendChild(r1);
      const r2 = d2.cloneNode(); r2.setAttribute('stroke',colors[2]); r2.setAttribute('stroke-width',rsw);
      svg.appendChild(r2);
      // White cross
      rect(0, h/2 - h*0.18, w, h*0.36, colors[1]);
      rect(w/2 - w*0.12, 0, w*0.24, h, colors[1]);
      // Red cross
      rect(0, h/2 - h*0.08, w, h*0.16, colors[2]);
      rect(w/2 - w*0.05, 0, w*0.10, h, colors[2]);
    }
    return svg;
  }

  // ---- Filter ----
  document.querySelectorAll('.filter-row button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.filter-row button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      filter = b.dataset.filter;
      renderList();
    });
  });

  function matchesFilter(v) {
    if (filter === 'all') return true;
    if (filter === 'ocde') return /OCDE/i.test(v.organizer) || /OCDE/i.test(v.event);
    if (filter === 'foro') return /foro/i.test(v.type) || /foro/i.test(v.event);
    if (filter === 'otros') return !(/OCDE/i.test(v.organizer) || /foro/i.test(v.type));
    return true;
  }

  function renderList() {
    list.innerHTML = '';
    const items = window.VISITS.filter(matchesFilter);
    items.forEach((v) => {
      const globalIdx = window.VISITS.indexOf(v);
      const row = document.createElement('div');
      row.className = 'country-row';
      row.dataset.code = v.code;
      row.innerHTML = `
        <div class="flag"></div>
        <div class="info">
          <div class="name">${v.name}</div>
          <div class="sub">${v.capital.toUpperCase()} · ${v.dateLong}</div>
        </div>
        <div class="idx">N° ${String(globalIdx+1).padStart(2,'0')}</div>
      `;
      row.querySelector('.flag').appendChild(renderFlag(v, { w: 32, h: 22 }));
      row.addEventListener('click', () => {
        document.querySelectorAll('.country-row').forEach(r => r.classList.remove('active'));
        row.classList.add('active');
        focusVisit(v.code);
        setTimeout(() => openModal(globalIdx), 600);
      });
      row.addEventListener('mouseenter', () => focusVisit(v.code, false));
      list.appendChild(row);
    });
  }

  function renderTimeline() {
    timeline.innerHTML = '';
    const sorted = [...window.VISITS].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 6);
    sorted.forEach(v => {
      const item = document.createElement('div');
      item.className = 'tl-item';
      item.innerHTML = `
        <div class="tl-date">${v.dateLong}</div>
        <div class="tl-body">
          <div class="t"><em>${v.capital}</em> · ${v.name}</div>
          <div class="sub">${stripHtml(v.event)}</div>
        </div>
      `;
      item.addEventListener('click', () => openModal(window.VISITS.indexOf(v)));
      item.style.cursor = 'pointer';
      timeline.appendChild(item);
    });
  }
  function stripHtml(s) { return s ? s.replace(/<[^>]+>/g, '') : ''; }

  function focusVisit(code) {
    window.dispatchEvent(new CustomEvent('visit:focus', { detail: code }));
  }

  function openModal(idx) {
    if (idx < 0) return;
    currentIdx = idx;
    const v = window.VISITS[idx];
    document.getElementById('m-title').innerHTML = `${v.capital} · <em>${v.name}</em>`;
    document.getElementById('m-kick').textContent = `${v.dateLong} · ${v.organizer.toUpperCase()}`;
    document.getElementById('m-expediente').textContent = v.expediente;
    document.getElementById('m-brief').innerHTML = v.brief;
    document.getElementById('m-event').innerHTML = v.eventLong;
    document.getElementById('m-organizer').textContent = v.organizer;
    document.getElementById('m-s1').textContent = v.stats.dias;
    document.getElementById('m-s3').textContent = v.stats.distancia.toLocaleString();
    const photoSection = document.querySelector('.m-photo');
    const img = document.getElementById('m-photo-img');
    if (v.photo) {
      photoSection.style.display = '';
      img.src = v.photo;
      document.getElementById('m-photo-cap').textContent = `${v.capital} \u00b7 ${v.dateLong}`;
    } else {
      photoSection.style.display = 'none';
    }
    const flagEl = document.getElementById('m-flag');
    flagEl.innerHTML = '';
    flagEl.appendChild(renderFlag(v, { w: 80, h: 54 }));
    modal.classList.add('open');
    focusVisit(v.code);
  }

  modalClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if (modal.classList.contains('open')) {
      if (e.key === 'ArrowRight') navigate(1);
      if (e.key === 'ArrowLeft') navigate(-1);
    }
  });
  document.getElementById('m-next').addEventListener('click', () => navigate(1));
  document.getElementById('m-prev').addEventListener('click', () => navigate(-1));

  function navigate(dir) {
    currentIdx = (currentIdx + dir + window.VISITS.length) % window.VISITS.length;
    openModal(currentIdx);
  }

  function closeModal() {
    modal.classList.remove('open');
    window.dispatchEvent(new Event('visit:resetview'));
  }

  window.addEventListener('visit:selected', (e) => {
    const code = e.detail;
    openModal(window.VISITS.findIndex(v => v.code === code));
  });

  renderList();
  renderTimeline();
})();
