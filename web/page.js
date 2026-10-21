/* s-core — per le pagine fuori dal guscio (cambio password, amministrazione…):
   Indietro nell'app torna alla pagina da cui si è arrivati (o all'inizio), invece di proporre di chiudere l'app. */
(function () {
  window.appBack = function () {
    try {
      if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) { history.back(); return true; }
    } catch (e) {}
    if (location.pathname !== '/') { location.href = '/'; return true; }
    return false;
  };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && location.pathname !== '/' && !document.querySelector('.modal.open')) window.appBack(); });
})();
