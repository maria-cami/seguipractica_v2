// public/js/main.js
// Confirmar acciones peligrosas
document.querySelectorAll('[data-confirm]').forEach(function(el) {
  el.addEventListener('click', function(e) {
    if (!confirm(el.dataset.confirm)) e.preventDefault();
  });
});

// Auto-ocultar alertas despues de 4 segundos
setTimeout(function() {
  var alerts = document.querySelectorAll('.alert');
  alerts.forEach(function(a) {
    a.style.transition = 'opacity .5s';
    a.style.opacity = '0';
    setTimeout(function() { a.remove(); }, 500);
  });
}, 4000);
