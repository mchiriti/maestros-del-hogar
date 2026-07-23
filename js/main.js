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

      // Validación del picker de comunas (si existe en este formulario):
      // un input type="hidden" con "required" no es confiable en todos
      // los navegadores, así que validamos explícitamente aquí.
      var communePicker = document.getElementById('commune-picker');
      var communeHidden = document.getElementById('pc');
      if (communePicker && communeHidden && !communeHidden.value.trim()) {
        communePicker.style.borderColor = '#EF4444';
        communePicker.scrollIntoView({behavior:'smooth', block:'center'});
        var pcInputEl = document.getElementById('pc-input');
        if (pcInputEl) pcInputEl.focus();
        return;
      }

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

  // ─── Commune autocomplete picker (solo en /proveedores/) ────
  var pcInput = document.getElementById('pc-input');
  var pcHidden = document.getElementById('pc');
  var pcChips = document.getElementById('commune-chips');
  var pcSuggestions = document.getElementById('commune-suggestions');
  var pcPicker = document.getElementById('commune-picker');

  if (pcInput && pcHidden && pcChips && pcSuggestions && pcPicker) {
    var COMMUNES = ['Las Condes','Ñuñoa','Providencia','La Florida','Maipú','Puente Alto',
      'Santiago Centro','Macul','Recoleta','Peñalolén','San Miguel','Vitacura',
      'La Reina','Lo Barnechea','Estación Central'];
    var selected = [];

    function syncHidden(){
      pcHidden.value = selected.join(', ');
    }

    function renderChips(){
      pcChips.innerHTML = selected.map(function(c, i){
        return '<span class="commune-chip">' + c +
          '<button type="button" data-idx="' + i + '" aria-label="Quitar ' + c + '">✕</button></span>';
      }).join('');
      pcChips.querySelectorAll('button').forEach(function(btn){
        btn.addEventListener('click', function(){
          selected.splice(parseInt(this.dataset.idx, 10), 1);
          renderChips();
          syncHidden();
        });
      });
    }

    function highlight(text, query){
      var idx = text.toLowerCase().indexOf(query.toLowerCase());
      if (idx === -1) return text;
      return text.slice(0, idx) + '<mark>' + text.slice(idx, idx + query.length) + '</mark>' + text.slice(idx + query.length);
    }

    function renderSuggestions(){
      var query = pcInput.value.trim();
      var available = COMMUNES.filter(function(c){ return selected.indexOf(c) === -1; });
      var matches = query
        ? available.filter(function(c){ return c.toLowerCase().indexOf(query.toLowerCase()) !== -1; })
        : available;

      if (matches.length === 0) {
        pcSuggestions.innerHTML = '<div class="commune-suggestion-empty">' +
          (available.length === 0 ? 'Ya agregaste las 15 comunas' : 'Sin coincidencias') + '</div>';
      } else {
        pcSuggestions.innerHTML = matches.map(function(c){
          return '<div class="commune-suggestion" data-value="' + c + '">' +
            (query ? highlight(c, query) : c) + '</div>';
        }).join('');
      }

      pcSuggestions.querySelectorAll('.commune-suggestion[data-value]').forEach(function(el){
        el.addEventListener('click', function(){
          selected.push(this.dataset.value);
          pcInput.value = '';
          renderChips();
          syncHidden();
          renderSuggestions();
          pcInput.focus();
        });
      });
    }

    pcInput.addEventListener('focus', function(){
      renderSuggestions();
      pcSuggestions.classList.add('open');
    });
    pcInput.addEventListener('input', function(){
      renderSuggestions();
      pcSuggestions.classList.add('open');
    });
    document.addEventListener('click', function(e){
      if (!pcPicker.contains(e.target)) {
        pcSuggestions.classList.remove('open');
      }
    });
    // Enter selecciona la primera coincidencia visible
    pcInput.addEventListener('keydown', function(e){
      if (e.key === 'Enter') {
        e.preventDefault();
        var first = pcSuggestions.querySelector('.commune-suggestion[data-value]');
        if (first) first.click();
      }
    });
  }
});