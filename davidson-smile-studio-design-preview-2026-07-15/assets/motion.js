(() => {
  const nav = document.querySelector('.nav');
  const navLinks = nav?.querySelector('.nav-links');

  if (nav && navLinks) {
    navLinks.id = 'site-menu';

    const toggle = document.createElement('button');
    toggle.className = 'menu-toggle';
    toggle.type = 'button';
    toggle.textContent = 'Menu';
    toggle.setAttribute('aria-controls', navLinks.id);
    toggle.setAttribute('aria-expanded', 'false');
    nav.querySelector('.nav-actions')?.prepend(toggle);

    const closeMenu = () => {
      navLinks.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });

    navLinks.addEventListener('click', (event) => {
      if (event.target.closest('a')) closeMenu();
    });

    document.addEventListener('click', (event) => {
      if (!nav.contains(event.target)) closeMenu();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeMenu();
        toggle.focus();
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 1040) closeMenu();
    });
  }

  const reviewMenus = [...document.querySelectorAll('.review-menu')];

  document.addEventListener('click', (event) => {
    reviewMenus.forEach((menu) => {
      if (!menu.contains(event.target)) menu.removeAttribute('open');
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    reviewMenus.forEach((menu) => menu.removeAttribute('open'));
  });

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (reducedMotion.matches || !('IntersectionObserver' in window)) {
    return;
  }

  const sections = [...document.querySelectorAll('main > section')];
  const cardSelectors = [
    '.service-card',
    '.info-card',
    '.path-card',
    '.profile-card',
    '.team-card',
    '.result-figure',
    '.post-card',
    '.detail-card',
    '.step-card'
  ];

  sections.forEach((section) => section.dataset.reveal = 'section');

  document.querySelectorAll(cardSelectors.join(',')).forEach((card) => {
    card.dataset.reveal = 'item';
    const group = card.parentElement;
    const siblings = group ? [...group.children].filter((child) => child.matches(cardSelectors.join(','))) : [];
    const index = Math.max(0, siblings.indexOf(card));
    card.style.setProperty('--reveal-delay', `${Math.min(index, 4) * 60}ms`);
  });

  document.body.classList.add('motion-ready');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
      window.setTimeout(() => {
        entry.target.removeAttribute('data-reveal');
        entry.target.classList.remove('is-visible');
        entry.target.style.removeProperty('--reveal-delay');
      }, 900);
    });
  }, {
    threshold: 0.08,
    rootMargin: '0px 0px -8% 0px'
  });

  document.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
})();
