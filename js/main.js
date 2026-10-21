    // ── STARS ──
    const starsEl = document.getElementById('stars');
    for (let i = 0; i < 180; i++) {
      const s = document.createElement('div');
      s.className = 'star';
      const size = Math.random() * 2.2 + 0.5;
      s.style.cssText = `
        width:${size}px; height:${size}px;
        top:${Math.random()*100}%; left:${Math.random()*100}%;
        --dur:${2+Math.random()*5}s; --op:${0.2+Math.random()*0.7};
        animation-delay:${Math.random()*5}s;
      `;
      starsEl.appendChild(s);
    }

    // ── CURSOR ──
    const cursor = document.getElementById('cursor');
    const ring = document.getElementById('cursorRing');
    let mx=0, my=0, rx=0, ry=0;
    document.addEventListener('mousemove', e => { mx=e.clientX; my=e.clientY; cursor.style.left=mx+'px'; cursor.style.top=my+'px'; });
    (function animRing() {
      rx += (mx-rx)*0.12; ry += (my-ry)*0.12;
      ring.style.left=rx+'px'; ring.style.top=ry+'px';
      requestAnimationFrame(animRing);
    })();

    // ── NAV SCROLL ──
    const nav = document.getElementById('nav');
    const sections = document.querySelectorAll('section[id]');
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 40);
      const links = document.querySelectorAll('.nav-links a');
      let cur = '';
      sections.forEach(s => { if (window.scrollY >= s.offsetTop - 120) cur = s.id; });
      links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#'+cur));
    });

    // ── MOBILE MENU ──
    function toggleMenu() {
      document.getElementById('navLinks').classList.toggle('open');
    }
    document.querySelectorAll('.nav-links a').forEach(a => a.addEventListener('click', () => document.getElementById('navLinks').classList.remove('open')));

    // ── REVEAL ON SCROLL ──
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));

    // ── SHOWS DATA (from HTML) ──
    const list = document.getElementById('showsList');
    const showElements = list.querySelectorAll('.show-row[data-month]');
    
    if (showElements.length === 0) {
      list.innerHTML = '<div class="no-shows">No upcoming shows — check back soon.</div>';
    } else {
      showElements.forEach(el => {
        const show = {
          month: el.dataset.month,
          day: el.dataset.day,
          venue: el.dataset.venue,
          location: el.dataset.location,
          tickets: el.dataset.tickets || null
        };
        
        el.innerHTML = `
          <div class="show-date">
            <div class="month">${show.month}</div>
            <div class="day">${show.day}</div>
          </div>
          <div class="show-info">
            <div class="venue">${show.venue}</div>
            <div class="location">${show.location}</div>
          </div>
          ${show.tickets ? `<a href="${show.tickets}" target="_blank" class="show-ticket">Tickets →</a>` : '<span class="show-ticket" style="opacity:0.4;pointer-events:none">More Info TBA</span>'}
        `;
        io.observe(el);
      });
    }

    // ── PARALLAX HERO ──
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      document.getElementById('heroBg').style.transform = `scale(1.05) translateY(${y*0.25}px)`;
    });