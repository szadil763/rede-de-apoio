// ============================================================
// icones.js — os desenhos (ícones) usados no app
// Cada ícone é um pequeno desenho em SVG (um formato de imagem feito de
// linhas e curvas, que fica nítido em qualquer tamanho).
// No HTML, basta escrever <span data-icone="nome"></span> que o ícone aparece.
// ============================================================

const ICONES = {
  inicio: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  mapa: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  noticias: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
  telefone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  localizar: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  escudo: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  coracao: '<path d="M12 20s-8-4.6-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.4 12 20 12 20z"/>',
  saude: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  pessoas: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M14.5 14.5c3.2-.6 6.5 1.6 6.5 5.5"/>',
  balanca: '<path d="M12 4v16M7 20h10M5 7h14M5 7l-3 7h6zM19 7l-3 7h6z"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  seta: '<path d="M9 5l7 7-7 7"/>',
  celular: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  mensagem: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z"/>',
  lupa: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
  lista: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
};

// Monta o SVG completo de um ícone
function desenharIcone(nome) {
  const desenho = ICONES[nome] || "";
  return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    desenho + "</svg>";
}

// Coloca o ícone em todo elemento que tem data-icone="..."
function preencherIcones(raiz) {
  for (const lugar of (raiz || document).querySelectorAll("[data-icone]")) {
    lugar.innerHTML = desenharIcone(lugar.dataset.icone);
  }
}

preencherIcones();
