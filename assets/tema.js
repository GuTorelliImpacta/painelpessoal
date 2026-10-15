/* Aplica o tema salvo antes da primeira pintura (evita "flash" claro/escuro). */
(function () {
  try {
    var t = localStorage.getItem('painel.tema');
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* sem localStorage: segue o tema do sistema */ }
})();
