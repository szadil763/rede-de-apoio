// ============================================================
// sw.js — o "service worker" (F9: funcionar sem internet)
//
// O service worker é um pequeno programa que o navegador guarda e
// que fica "no meio do caminho" entre o app e a internet.
// Nossa regra é simples:
//   1. Tenta buscar na internet (assim os dados ficam sempre atualizados).
//   2. Se deu certo, guarda uma cópia no aparelho.
//   3. Se não tem internet, usa a cópia guardada.
//
// O que NÃO guardamos: o mapa (as imagens vêm de outro site) e
// nada sobre a pessoa (nem posição, nem o que ela tocou).
// ============================================================

// Troque o número quando mudar a lista abaixo, para o aparelho baixar de novo.
const NOME_DA_COPIA = "rede-de-apoio-v3";

// Arquivos guardados assim que o app é aberto pela primeira vez.
const ARQUIVOS_ESSENCIAIS = [
  "./",
  "./index.html",
  "./estilos.css",
  "./app.js",
  "./icones.js",
  "./config-firebase.js",
  "./fontes/archivo-black.woff2",
  "./manifest.webmanifest",
  "./icones/icone-192.png",
  "./vendor/leaflet/leaflet.js",
  "./vendor/leaflet/leaflet.css",
  "../data/locais.json",
  "../data/noticias.json",
];

// "install": acontece uma vez, quando o service worker é instalado.
self.addEventListener("install", function (evento) {
  evento.waitUntil(
    caches.open(NOME_DA_COPIA).then(function (copia) {
      return copia.addAll(ARQUIVOS_ESSENCIAIS);
    })
  );
  self.skipWaiting();
});

// "activate": apaga cópias de versões antigas.
self.addEventListener("activate", function (evento) {
  evento.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(
        nomes
          .filter(function (nome) { return nome !== NOME_DA_COPIA && nome !== "rede-de-apoio-dados"; })
          .map(function (nome) { return caches.delete(nome); })
      );
    })
  );
  self.clients.claim();
});

// "fetch": acontece toda vez que o app pede um arquivo.
self.addEventListener("fetch", function (evento) {
  const pedido = evento.request;
  const mesmoSite = new URL(pedido.url).origin === self.location.origin;

  // Só cuidamos de arquivos do nosso próprio site (o mapa passa direto).
  if (pedido.method !== "GET" || !mesmoSite) return;

  evento.respondWith(
    fetch(pedido)
      .then(function (resposta) {
        if (resposta.ok) {
          const copiaDaResposta = resposta.clone();
          caches.open(NOME_DA_COPIA).then(function (copia) {
            copia.put(pedido, copiaDaResposta);
          });
        }
        return resposta;
      })
      .catch(function () {
        // Sem internet: usamos a cópia guardada (se existir)
        return caches.match(pedido, { ignoreSearch: true }).then(function (guardada) {
          return guardada || Response.error();
        });
      })
  );
});
