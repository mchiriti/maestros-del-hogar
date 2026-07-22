(function(){
  // GA4: G-Q5KH4RSPSY
  var s=document.createElement('script');
  s.async=true;
  s.src='https://www.googletagmanager.com/gtag/js?id=G-Q5KH4RSPSY';
  document.head.appendChild(s);
  window.dataLayer=window.dataLayer||[];
  function gtag(){dataLayer.push(arguments);}
  gtag('js',new Date());
  gtag('config','G-Q5KH4RSPSY');
  window.gtag=gtag;
})();

// ─── Mobile menu ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',function(){
  var hdr=document.getElementById('site-header');
  var ham=document.getElementById('hamburger');
  var men=document.getElementById('mobile-menu');

  window.addEventListener('scroll',function(){
    hdr&&(hdr.classList.toggle('scrolled',window.scrollY>40));
  });

  if(ham&&men){
    ham.addEventListener('click',function(){
      var open=men.classList.toggle('open');
      ham.setAttribute('aria-expanded',open);
      men.setAttribute('aria-hidden',!open);
    });
  }

  // ─── Reveal on scroll ──────────────────────────────────────
  var obs=new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if(e.isIntersecting){e.target.classList.add('visible');obs.unobserve(e.target);}
    });
  },{threshold:0.08});
  document.querySelectorAll('.reveal').forEach(function(el){obs.observe(el);});

  // ─── FAQ accordion ─────────────────────────────────────────
  document.querySelectorAll('.faq-question').forEach(function(btn){
    btn.addEventListener('click',function(){
      var isOpen=this.getAttribute('aria-expanded')==='true';
      document.querySelectorAll('.faq-question').forEach(function(b){
        b.setAttribute('aria-expanded','false');
        b.nextElementSibling.style.maxHeight=null;
        b.querySelector('.faq-icon').textContent='+';
      });
      if(!isOpen){
        this.setAttribute('aria-expanded','true');
        var ans=this.nextElementSibling;
        ans.style.maxHeight=ans.scrollHeight+'px';
        this.querySelector('.faq-icon').textContent='−';
      }
    });
  });

  // ─── Form submit ───────────────────────────────────────────
  var form=document.getElementById('contact-form');
  var succ=document.getElementById('form-success');
  if(form&&succ){
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var data=new FormData(form);
      fetch('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams(data).toString()})
      .then(function(){
        if(window.gtag)window.gtag('event','generate_lead',{event_category:'formulario',event_label:data.get('servicio')||'contacto'});
        form.style.display='none';succ.style.display='block';
      })
      .catch(function(){form.submit();});
    });
  }
});