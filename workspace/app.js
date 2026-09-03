// Portfolio Interactivity
document.addEventListener('DOMContentLoaded', () => {
  console.log('Portfolio loaded successfully');
  
  const nav = document.getElementById('main-nav');
  
  // Navbar scroll effect
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      nav.classList.add('nav-glass');
      nav.classList.remove('h-20');
    } else {
      nav.classList.remove('nav-glass');
      nav.classList.add('h-20');
    }
  });

  // Smooth scroll for navigation links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

  // Intersection Observer for reveal animations
  const observerOptions = {
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-fade-in-up');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Apply observer to sections and cards
  document.querySelectorAll('section, .skill-card, .project-card').forEach(el => {
    el.style.opacity = '0'; // Initial state for observer
    observer.observe(el);
  });
});
