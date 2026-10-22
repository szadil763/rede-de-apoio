// ============================================================
// app.js — o "cérebro" do aplicativo
// Aqui ficam as ações: trocar de tela, ler os dados, montar a lista,
// o mapa, os filtros, o "perto de mim", as notícias e o Sair rápido.
// Cada parte tem um número, que é o mesmo usado nos guias em docs/.
// ============================================================

// Página neutra para onde o "Sair rápido" leva a pessoa.
const PAGINA_NEUTRA = "https://www.google.com/";

// Canal para avisar a equipe de um dado desatualizado (F10).
// A equipe ainda vai decidir qual é (formulário ou e-mail DA EQUIPE, nunca pessoal).
// Exemplo: "https://forms.gle/..." ou "mailto:equipe@escola..."
// Enquanto estiver vazio, o app mostra uma orientação no lugar do botão.
const CANAL_DA_EQUIPE = "";

// Contador de acessos (GoatCounter): endereço do painel criado pelo professor.
// Exemplo: "https://rededeapoio.goatcounter.com". Vazio = contador desligado.
// Ver a aba "Acessos" do painel do administrador (admin/index.html).
const CONTADOR_DE_ACESSOS = "";

// Depois de quantos meses sem conferência um local é considerado desatualizado.
const MESES_PARA_DESATUALIZAR = 6;

// Quantos locais mostrar no "perto de mim".
const QUANTOS_MAIS_PROXIMOS = 5;

// MODO DEMONSTRAÇÃO: usa dados fictícios para a equipe testar.
// Só funciona no próprio computador (localhost), nunca no app publicado.
// Para usar: abra http://localhost:8000/src/?demo
const NO_COMPUTADOR = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const MODO_DEMONSTRACAO = NO_COMPUTADOR && new URLSearchParams(location.search).has("demo");

const PASTA_DOS_DADOS = MODO_DEMONSTRACAO ? "../prototipo/dados-exemplo/" : "../data/";
const ARQUIVO_DE_LOCAIS = PASTA_DOS_DADOS + "locais.json";
const ARQUIVO_DE_NOTICIAS = PASTA_DOS_DADOS + "noticias.json";

// Nome, nome curto (usado no filtro), ícone e cor de cada categoria.
// Os nomes curtos e os ícones vieram dos rascunhos de tela da equipe.
const CATEGORIAS = {
  "delegacia-da-mulher": { nome: "Delegacia da Mulher", curto: "Delegacias", icone: "escudo", cor: "#3a173d" },
  "centro-de-referencia": { nome: "Centro de Referência", curto: "Acolhimento", icone: "coracao", cor: "#c2457a" },
  "hospital": { nome: "Hospital", curto: "Saúde", icone: "saude", cor: "#8e3b6f" },
  "cras-creas": { nome: "Assistência Social", curto: "Assistência", icone: "pessoas", cor: "#6d4c8f" },
  "defensoria": { nome: "Defensoria Pública", curto: "Jurídico", icone: "balanca", cor: "#a0703a" },
};

// Aqui guardamos os locais depois de ler o arquivo.
let listaDeLocais = [];

// "Estado" da tela Encontrar ajuda: o que a pessoa escolheu.
// Fica só na memória: quando o app fecha, tudo isso some (é de propósito).
let categoriaEscolhida = "todas";
let posicaoDaPessoa = null;   // { latitude, longitude } depois do "perto de mim"
let bairroEscolhido = "";
let textoDaBusca = "";          // o que foi digitado na busca (não é guardado)

if (MODO_DEMONSTRACAO) {
  document.getElementById("faixa-demonstracao").hidden = false;
}


// ------------------------------------------------------------
// 1. TROCAR DE TELA
// Todas as telas estão no index.html. Mostramos uma e
// escondemos as outras com o atributo "hidden".
// ------------------------------------------------------------
function mostrarTela(idDaTela) {
  const todasAsTelas = document.querySelectorAll(".tela");
  for (const tela of todasAsTelas) {
    tela.hidden = tela.id !== idDaTela;
  }
  window.scrollTo(0, 0);

  // Na tela de boas-vindas não aparecem o cabeçalho nem a barra de abas
  const ehBoasVindas = idDaTela === "tela-boas-vindas";
  document.getElementById("cabecalho-app").hidden = ehBoasVindas;
  document.getElementById("barra-abas").hidden = ehBoasVindas;

  // Cada tela tem a sua frase no cabeçalho (atributo data-frase no HTML)
  const telaAtual = document.getElementById(idDaTela);
  document.getElementById("frase-da-tela").textContent = telaAtual.dataset.frase || "";

  // Marca a aba da tela atual (o detalhe do local pertence à aba Mapa)
  const abaAtual = idDaTela === "tela-detalhe" ? "tela-locais" : idDaTela;
  for (const aba of document.querySelectorAll("#barra-abas button")) {
    if (aba.dataset.irPara === abaAtual) {
      aba.setAttribute("aria-current", "page");
    } else {
      aba.removeAttribute("aria-current");
    }
  }

  // Algumas telas precisam preparar coisas quando abrem
  if (idDaTela === "tela-locais") prepararMapa();
  if (idDaTela === "tela-noticias") carregarNoticias();
}

// Todo botão com "data-ir-para" leva para a tela indicada.
for (const botao of document.querySelectorAll("[data-ir-para]")) {
  botao.addEventListener("click", function () {
    mostrarTela(botao.dataset.irPara);
  });
}

// Botões "Ver no mapa" da tela de emergência: abrem o mapa já filtrado.
for (const botao of document.querySelectorAll("[data-ver-categoria]")) {
  botao.addEventListener("click", function () {
    escolherCategoria(botao.dataset.verCategoria);
    mostrarTela("tela-locais");
  });
}


// ------------------------------------------------------------
// 2. SAIR RÁPIDO (F8)
// location.replace troca a página atual pela página neutra SEM
// deixar o app no botão "voltar".
// LIMITE: isso NÃO apaga o histórico do navegador.
// ------------------------------------------------------------
function sairRapido() {
  window.location.replace(PAGINA_NEUTRA);
}

document.getElementById("botao-sair-rapido").addEventListener("click", sairRapido);

// Atalho no computador: apertar a tecla Esc também sai rápido.
document.addEventListener("keydown", function (evento) {
  if (evento.key === "Escape") {
    sairRapido();
  }
});


// ------------------------------------------------------------
// 3. LER OS LOCAIS DO ARQUIVO (data/locais.json)
// "fetch" busca o arquivo. "await" espera ele chegar.
// Se der erro (sem internet, arquivo quebrado), avisamos a pessoa
// e mostramos os números de emergência, que sempre funcionam.
// ------------------------------------------------------------
async function carregarLocais() {
  try {
    listaDeLocais = await buscarPublicados("locais", ARQUIVO_DE_LOCAIS);
    listaDeLocais.sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), "pt-BR"); });
  } catch (erro) {
    // console.error mostra o erro para quem está programando (F12 no navegador)
    console.error("Não foi possível carregar os locais:", erro);
    mostrarAviso(
      "Não conseguimos carregar a lista de locais agora. " +
      "Se precisar de ajuda, ligue 180 (Central de Atendimento à Mulher) " +
      "ou 190 em caso de perigo."
    );
    return;
  }
  criarFiltros();
  criarListaDeBairros();
  atualizarLocais();
}


// ------------------------------------------------------------
// 3b. DE ONDE VÊM OS DADOS
// Com o Firebase: o app pede ao banco de dados SÓ o que já foi conferido e
// publicado (as regras do servidor não deixam ver o resto). Depois guarda uma
// cópia no celular, para funcionar sem internet.
// Sem o Firebase (modo demonstração, versão de teste): usa os arquivos .json.
// ------------------------------------------------------------
const USAR_FIREBASE = typeof CONFIG_DO_FIREBASE !== "undefined" && !MODO_DEMONSTRACAO;
const NOME_DA_COPIA_DE_DADOS = "rede-de-apoio-dados";

async function buscarPublicados(colecao, arquivoReserva) {
  if (USAR_FIREBASE) {
    try {
      const lista = await buscarNoFirebase(colecao);
      guardarCopia(colecao, lista);
      return lista;
    } catch (erro) {
      console.error("Firebase indisponível, usando a cópia guardada:", erro);
      const copia = await lerCopia(colecao);
      if (copia) return copia;
    }
  }
  const resposta = await fetch(arquivoReserva);
  if (!resposta.ok) throw new Error("Arquivo não encontrado (código " + resposta.status + ")");
  return resposta.json();
}

// Pergunta ao Firestore (pela internet, sem biblioteca) os itens com status "publicado"
async function buscarNoFirebase(colecao) {
  const endereco = "https://firestore.googleapis.com/v1/projects/" + CONFIG_DO_FIREBASE.projectId +
    "/databases/(default)/documents:runQuery?key=" + CONFIG_DO_FIREBASE.apiKey;
  const tempo = new AbortController();
  const relogio = setTimeout(function () { tempo.abort(); }, 10000);   // desiste depois de 10 segundos
  try {
    const resposta = await fetch(endereco, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: colecao }],
          where: { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "publicado" } } },
        },
      }),
      signal: tempo.signal,
      referrerPolicy: "no-referrer",
    });
    if (!resposta.ok) throw new Error("Firebase respondeu " + resposta.status);
    const resultados = await resposta.json();
    return resultados
      .filter(function (r) { return r.document; })
      .map(function (r) {
        const item = { id: r.document.name.split("/").pop() };
        for (const [campo, valor] of Object.entries(r.document.fields || {})) {
          item[campo] = valorDoFirestore(valor);
        }
        return item;
      });
  } finally {
    clearTimeout(relogio);
  }
}

// O Firestore manda cada valor com o "tipo" junto: { stringValue: "texto" }, { doubleValue: -23.4 }...
function valorDoFirestore(valor) {
  if ("stringValue" in valor) return valor.stringValue;
  if ("doubleValue" in valor) return Number(valor.doubleValue);
  if ("integerValue" in valor) return Number(valor.integerValue);
  if ("booleanValue" in valor) return valor.booleanValue;
  if ("timestampValue" in valor) return valor.timestampValue;
  if ("nullValue" in valor) return null;
  return "";
}

// A cópia fica no "cache" do navegador: é só a lista pública, nada sobre a pessoa.
async function guardarCopia(colecao, lista) {
  try {
    const copia = await caches.open(NOME_DA_COPIA_DE_DADOS);
    await copia.put("/copia/" + colecao, new Response(JSON.stringify(lista)));
  } catch (erro) { /* sem cache (ex.: navegação privada): tudo bem */ }
}

async function lerCopia(colecao) {
  try {
    const copia = await caches.open(NOME_DA_COPIA_DE_DADOS);
    const guardada = await copia.match("/copia/" + colecao);
    return guardada ? guardada.json() : null;
  } catch (erro) {
    return null;
  }
}


// ------------------------------------------------------------
// 4. ESCOLHER QUAIS LOCAIS MOSTRAR
// Esta é a função central da Fase 2. Ela junta as escolhas da pessoa
// (categoria, posição, bairro) e decide o que aparece na lista e no mapa.
// ------------------------------------------------------------
function atualizarLocais() {
  esconderAviso();

  if (listaDeLocais.length === 0) {
    mostrarAviso(
      "Ainda não há locais cadastrados. " +
      "Enquanto isso, ligue 180 para receber orientação."
    );
    mostrarListaDeLocais([]);
    mostrarMarcadores([]);
    return;
  }

  // a) filtro por categoria (F3)
  let locaisVisiveis = listaDeLocais.filter(function (local) {
    return categoriaEscolhida === "todas" || local.categoria === categoriaEscolhida;
  });

  // a2) busca por nome, endereço ou bairro (decisão 17)
  if (textoDaBusca) {
    locaisVisiveis = locaisVisiveis.filter(function (local) {
      const categoria = CATEGORIAS[local.categoria] || {};
      const ondeProcurar = [local.nome, local.endereco, local.bairro, categoria.nome, categoria.curto].join(" ");
      return semAcentos(ondeProcurar).includes(textoDaBusca);
    });
  }

  // b) filtro por bairro (quando a localização foi negada)
  if (bairroEscolhido) {
    locaisVisiveis = locaisVisiveis.filter(function (local) {
      return local.bairro === bairroEscolhido;
    });
  }

  // c) perto de mim (F5): calcula a distância e fica com os mais próximos
  if (posicaoDaPessoa) {
    locaisVisiveis = locaisVisiveis
      .filter(temCoordenadas)
      .map(function (local) {
        return { ...local, distancia: distanciaEmKm(posicaoDaPessoa, local) };
      })
      .sort(function (a, b) { return a.distancia - b.distancia; })
      .slice(0, QUANTOS_MAIS_PROXIMOS);
  }

  if (locaisVisiveis.length === 0) {
    mostrarAviso("Nenhum local encontrado com essa busca ou filtro. Tente outra palavra ou categoria.");
  }

  mostrarListaDeLocais(locaisVisiveis);
  mostrarMarcadores(locaisVisiveis);
}


// Busca: "Delegacia" encontra "delegacia" e "Saude" encontra "Saúde".
// Para isso, deixamos tudo em minúsculas e sem acentos antes de comparar.
function semAcentos(texto) {
  return String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

document.getElementById("campo-busca").addEventListener("input", function (evento) {
  textoDaBusca = semAcentos(evento.target.value);
  document.getElementById("cartao-do-local").hidden = true;
  atualizarLocais();
});

// "Ver lista": pula direto para a lista, sem precisar usar o mapa
document.getElementById("botao-ver-lista").addEventListener("click", function () {
  document.getElementById("titulo-lista").scrollIntoView({ block: "start" });
});


// ------------------------------------------------------------
// 5. MONTAR A LISTA DE LOCAIS NA TELA
// ------------------------------------------------------------
function mostrarListaDeLocais(locais) {
  const lista = document.getElementById("lista-de-locais");
  lista.innerHTML = ""; // limpa a lista antes de montar de novo

  for (const local of locais) {
    const item = document.createElement("li");

    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "cartao-local";
    botao.addEventListener("click", function () {
      mostrarDetalhe(local);
    });

    const textos = document.createElement("span");
    textos.className = "textos";

    const nome = document.createElement("strong");
    nome.textContent = local.nome;
    textos.append(nome, criarEtiquetaDeCategoria(local.categoria));

    // No "perto de mim", mostramos a distância em linha reta
    if (local.distancia !== undefined) {
      const distancia = document.createElement("span");
      distancia.className = "distancia";
      distancia.textContent = "a " + formatarDistancia(local.distancia) + " (em linha reta)";
      textos.append(distancia);
    }

    const seta = document.createElement("span");
    seta.className = "seta";
    seta.innerHTML = desenharIcone("seta");

    botao.append(criarIconeDaCategoria(local.categoria), textos, seta);
    item.append(botao);
    lista.append(item);
  }
}

function nomeDaCategoria(codigo) {
  // Se a categoria não estiver na lista, mostra o próprio código
  return CATEGORIAS[codigo] ? CATEGORIAS[codigo].nome : codigo;
}

function corDaCategoria(codigo) {
  return CATEGORIAS[codigo] ? CATEGORIAS[codigo].cor : "#2b2233";
}

function iconeDaCategoria(codigo) {
  return CATEGORIAS[codigo] ? CATEGORIAS[codigo].icone : "mapa";
}

function criarEtiquetaDeCategoria(codigo) {
  const etiqueta = document.createElement("span");
  etiqueta.className = "categoria";
  etiqueta.textContent = nomeDaCategoria(codigo);
  return etiqueta;
}

// Círculo colorido com o ícone da categoria (lista e cartão do local)
function criarIconeDaCategoria(codigo) {
  const circulo = document.createElement("span");
  circulo.className = "icone-redondo";
  circulo.style.background = corDaCategoria(codigo);
  circulo.style.color = "#ffffff";
  circulo.innerHTML = desenharIcone(iconeDaCategoria(codigo));
  return circulo;
}

function mostrarAviso(mensagem) {
  const aviso = document.getElementById("aviso-lista");
  aviso.textContent = mensagem;
  aviso.hidden = false;
}

function esconderAviso() {
  document.getElementById("aviso-lista").hidden = true;
}


// ------------------------------------------------------------
// 6. DETALHE DO LOCAL (F4) + AVISO DE DADO DESATUALIZADO (F10)
// Usamos textContent (e não innerHTML) para colocar os dados:
// assim, mesmo que alguém digite algo estranho no arquivo, o
// navegador mostra como texto e não executa como código.
// ------------------------------------------------------------
function mostrarDetalhe(local) {
  const detalhe = document.getElementById("detalhe-do-local");
  detalhe.innerHTML = "";

  const titulo = document.createElement("h2");
  titulo.textContent = local.nome;
  detalhe.append(titulo, criarEtiquetaDeCategoria(local.categoria));

  // F10: se a informação é antiga, avisamos ANTES dos dados
  if (estaDesatualizado(local)) {
    const alerta = document.createElement("p");
    alerta.className = "aviso aviso-desatualizado";
    alerta.textContent =
      "Esta informação não é conferida há mais de " + MESES_PARA_DESATUALIZAR +
      " meses. Se puder, ligue antes de ir.";
    detalhe.append(alerta);
  }

  detalhe.append(criarCampo("O que oferece", local.oQueOferece));
  detalhe.append(criarCampo("Endereço", local.endereco));
  detalhe.append(criarCampo("Horário", local.horario));

  // Botão LIGAR: só aparece se houver telefone no arquivo.
  if (local.telefone) {
    const ligar = document.createElement("a");
    ligar.className = "botao-grande botao-ligar";
    ligar.href = "tel:" + somenteNumeros(local.telefone);
    ligar.textContent = "Ligar: " + local.telefone;
    detalhe.append(ligar);
  }

  // Botão COMO CHEGAR: abre o Google Maps com a rota até o local.
  const linkDaRota = linkComoChegar(local);
  if (linkDaRota) {
    const comoChegar = document.createElement("a");
    comoChegar.className = "botao-grande botao-secundario";
    comoChegar.href = linkDaRota;
    comoChegar.target = "_blank";      // abre em outra aba / no app do Maps
    comoChegar.rel = "noopener";
    comoChegar.textContent = "Como chegar";
    detalhe.append(comoChegar);
  }

  // Fonte e data da verificação: mostram que a informação foi conferida.
  const fonte = document.createElement("p");
  fonte.className = "fonte";
  fonte.textContent = "Informação conferida em " + (local.ultimaVerificacao || "data não informada") + ". ";
  const linkDaFonte = linkSeguro(local.fonte);
  if (linkDaFonte) {
    const linkFonte = document.createElement("a");
    linkFonte.href = linkDaFonte;
    linkFonte.target = "_blank";
    linkFonte.rel = "noopener";
    linkFonte.textContent = "Ver fonte oficial";
    fonte.append(linkFonte);
  }
  detalhe.append(fonte);

  detalhe.append(criarAvisoParaEquipe(local));

  mostrarTela("tela-detalhe");
}

// Cria um bloco "título + valor". Se o valor estiver vazio, avisa.
function criarCampo(tituloDoCampo, valor) {
  const campo = document.createElement("p");
  campo.className = "campo";

  const titulo = document.createElement("span");
  titulo.className = "campo-titulo";
  titulo.textContent = tituloDoCampo;

  campo.append(titulo, valor || "Não informado");
  return campo;
}

// "(11) 3333-4444" vira "1133334444", que é o formato do link tel:
function somenteNumeros(texto) {
  return String(texto).replace(/\D/g, "");
}

// Só aceitamos links que começam com https:// ou http://.
// Um link "javascript:..." no arquivo poderia executar código.
function linkSeguro(endereco) {
  const texto = String(endereco || "").trim();
  if (texto.startsWith("https://") || texto.startsWith("http://")) return texto;
  return "";
}

function temCoordenadas(local) {
  return Number.isFinite(Number(local.latitude)) && Number.isFinite(Number(local.longitude)) &&
    local.latitude !== "" && local.longitude !== "";
}

// Monta o link do Google Maps. Usa as coordenadas se existirem;
// se não, usa o endereço escrito.
function linkComoChegar(local) {
  let destino = "";
  if (temCoordenadas(local)) {
    destino = local.latitude + "," + local.longitude;
  } else if (local.endereco) {
    destino = local.endereco;
  } else {
    return ""; // sem coordenadas e sem endereço: não mostra o botão
  }
  return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(destino);
}

// F10: o local está desatualizado se não tem data ou se a data é antiga.
function estaDesatualizado(local) {
  if (!local.ultimaVerificacao) return true;
  const dataDaConferencia = new Date(local.ultimaVerificacao + "T00:00:00");
  if (isNaN(dataDaConferencia)) return true;
  const limite = new Date();
  limite.setMonth(limite.getMonth() - MESES_PARA_DESATUALIZAR);
  return dataDaConferencia < limite;
}

// F10: botão para avisar a equipe. Não pede nenhum dado pessoal:
// a mensagem já vai pronta, só com o nome do local.
function criarAvisoParaEquipe(local) {
  const bloco = document.createElement("div");
  bloco.className = "avisar-equipe";

  const texto = document.createElement("p");
  texto.textContent = "Viu alguma informação errada aqui?";
  bloco.append(texto);

  if (CANAL_DA_EQUIPE.startsWith("mailto:")) {
    const link = document.createElement("a");
    link.className = "botao-grande botao-secundario";
    link.href = CANAL_DA_EQUIPE +
      "?subject=" + encodeURIComponent("Dado desatualizado: " + local.nome) +
      "&body=" + encodeURIComponent("O que está diferente: ");
    link.textContent = "Avisar a equipe";
    bloco.append(link);
  } else if (linkSeguro(CANAL_DA_EQUIPE)) {
    const link = document.createElement("a");
    link.className = "botao-grande botao-secundario";
    link.href = CANAL_DA_EQUIPE;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Avisar a equipe";
    bloco.append(link);
  } else {
    const orientacao = document.createElement("p");
    orientacao.className = "dica";
    orientacao.textContent = "Em breve você poderá avisar a equipe por aqui.";
    bloco.append(orientacao);
  }
  return bloco;
}


// ------------------------------------------------------------
// 7. O MAPA (F2) — usando a biblioteca Leaflet
// O Leaflet desenha o mapa juntando "pedacinhos" de imagem (tiles)
// que vêm dos servidores do OpenStreetMap.
// PRIVACIDADE: esses servidores veem o IP de quem usa e a região do mapa.
// ------------------------------------------------------------
let mapa = null;            // o mapa só é criado na primeira vez que a tela abre
let camadaDeMarcadores = null;
let ultimosLocaisNoMapa = [];

function prepararMapa() {
  const caixaDoMapa = document.getElementById("mapa");
  const avisoDoMapa = document.getElementById("aviso-mapa");

  // Se a biblioteca não carregou, ou se está sem internet, a lista basta.
  if (typeof L === "undefined" || !navigator.onLine) {
    caixaDoMapa.hidden = true;
    avisoDoMapa.textContent = "O mapa precisa de internet. A lista abaixo funciona sem ela.";
    avisoDoMapa.hidden = false;
    return;
  }
  caixaDoMapa.hidden = false;
  avisoDoMapa.hidden = true;

  if (mapa === null) {
    // Começa mostrando o Brasil; depois aproxima nos locais cadastrados.
    mapa = L.map("mapa").setView([-14.2, -51.9], 4);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; colaboradores do OpenStreetMap",
    }).addTo(mapa);
    camadaDeMarcadores = L.layerGroup().addTo(mapa);
    mostrarMarcadores(ultimosLocaisNoMapa);
  } else {
    // Quando a caixa estava escondida, o mapa precisa recalcular o tamanho
    mapa.invalidateSize();
  }
}

function mostrarMarcadores(locais) {
  ultimosLocaisNoMapa = locais;
  if (mapa === null) return; // o mapa ainda não foi aberto

  camadaDeMarcadores.clearLayers();
  const pontos = [];

  for (const local of locais) {
    if (!temCoordenadas(local)) continue; // sem coordenadas, fica só na lista
    const ponto = [Number(local.latitude), Number(local.longitude)];
    pontos.push(ponto);

    // Um "pino" em forma de gota para cada local, com a cor e o ícone da categoria
    const marcador = L.marker(ponto, {
      icon: L.divIcon({
        className: "",
        html: '<div class="pino"><div class="pino-gota" style="background:' +
          corDaCategoria(local.categoria) + '"></div><div class="pino-icone">' +
          desenharIcone(iconeDaCategoria(local.categoria)) + "</div></div>",
        iconSize: [40, 48],
        iconAnchor: [20, 48],
      }),
      title: local.nome,       // texto lido por leitores de tela
      alt: local.nome,
    });
    marcador.on("click", function () {
      mostrarCartaoDoLocal(local);
    });
    camadaDeMarcadores.addLayer(marcador);
  }

  // Também marcamos a pessoa no "perto de mim" (só na tela, não é guardado)
  if (posicaoDaPessoa) {
    const voce = [posicaoDaPessoa.latitude, posicaoDaPessoa.longitude];
    pontos.push(voce);
    camadaDeMarcadores.addLayer(
      L.marker(voce, {
        icon: L.divIcon({ className: "", html: '<div class="voce-esta-aqui"></div>', iconSize: [22, 22] }),
        title: "Você está aqui",
        keyboard: false,
      })
    );
  }

  // Aproxima o mapa para caber todos os pontos
  if (pontos.length === 1) mapa.setView(pontos[0], 15);
  if (pontos.length > 1) mapa.fitBounds(pontos, { padding: [30, 30] });
}

// O cartão que aparece embaixo do mapa ao tocar num pino (rascunho 2).
// Tem os três botões do rascunho: Ligar, Como chegar e Mais informações.
// Tudo feito com textContent, por segurança.
function mostrarCartaoDoLocal(local) {
  const cartao = document.getElementById("cartao-do-local");
  cartao.innerHTML = "";

  const topo = document.createElement("div");
  topo.className = "cartao-do-local-topo";
  const textos = document.createElement("div");
  const nome = document.createElement("h3");
  nome.textContent = local.nome;
  const endereco = document.createElement("p");
  endereco.textContent = [
    local.distancia !== undefined ? "a " + formatarDistancia(local.distancia) : "",
    local.endereco,
  ].filter(Boolean).join(" · ");
  textos.append(nome, endereco);
  if (local.horario) {
    const selo = document.createElement("span");
    selo.className = "selo";
    selo.innerHTML = '<span class="icone">' + desenharIcone("relogio") + "</span>";
    selo.append(local.horario);
    textos.append(selo);
  }
  topo.append(criarIconeDaCategoria(local.categoria), textos);

  const acoes = document.createElement("div");
  acoes.className = "acoes";
  if (local.telefone) {
    acoes.append(criarAcao("telefone", "Ligar", "tel:" + somenteNumeros(local.telefone), "acao-ligar"));
  }
  const rota = linkComoChegar(local);
  if (rota) acoes.append(criarAcao("mapa", "Como chegar", rota));
  const mais = criarAcao("info", "Mais informações");
  mais.addEventListener("click", function () { mostrarDetalhe(local); });
  acoes.append(mais);

  cartao.append(topo, acoes);
  cartao.hidden = false;
}

// Cria um dos botões do cartão. Com endereço vira link; sem endereço, botão.
function criarAcao(icone, texto, endereco, classeExtra) {
  const acao = document.createElement(endereco ? "a" : "button");
  acao.className = "acao " + (classeExtra || "");
  if (endereco) {
    acao.href = endereco;
    if (endereco.startsWith("https://")) {
      acao.target = "_blank";
      acao.rel = "noopener";
    }
  } else {
    acao.type = "button";
  }
  acao.innerHTML = '<span class="icone">' + desenharIcone(icone) + "</span>";
  acao.append(texto);
  return acao;
}


// ------------------------------------------------------------
// 8. FILTRO POR CATEGORIA (F3)
// Criamos um botão para cada categoria que existe nos dados.
// "aria-pressed" diz aos leitores de tela qual botão está escolhido.
// ------------------------------------------------------------
function criarFiltros() {
  const caixa = document.getElementById("filtros");
  caixa.innerHTML = "";

  // Só as categorias que aparecem em algum local
  const codigos = [];
  for (const local of listaDeLocais) {
    if (!codigos.includes(local.categoria)) codigos.push(local.categoria);
  }
  if (codigos.length < 2) return; // com uma categoria só, o filtro não ajuda

  const opcoes = [{ codigo: "todas", nome: "Todos", icone: "mapa" }].concat(
    codigos.map(function (codigo) {
      const categoria = CATEGORIAS[codigo];
      return {
        codigo: codigo,
        nome: categoria ? categoria.curto : codigo,
        icone: iconeDaCategoria(codigo),
      };
    })
  );

  for (const opcao of opcoes) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "botao-filtro";
    botao.dataset.categoria = opcao.codigo;
    botao.innerHTML = '<span class="icone">' + desenharIcone(opcao.icone) + "</span>";
    botao.append(opcao.nome);
    botao.addEventListener("click", function () {
      escolherCategoria(opcao.codigo);
    });
    caixa.append(botao);
  }
  marcarFiltroEscolhido();
}

// Muda a categoria escolhida (pelo filtro ou pelos atalhos da tela de emergência)
function escolherCategoria(codigo) {
  categoriaEscolhida = codigo;
  marcarFiltroEscolhido();
  document.getElementById("cartao-do-local").hidden = true;
  atualizarLocais();
}

function marcarFiltroEscolhido() {
  for (const botao of document.querySelectorAll("#filtros button")) {
    botao.setAttribute("aria-pressed", botao.dataset.categoria === categoriaEscolhida);
  }
}


// ------------------------------------------------------------
// 9. PERTO DE MIM (F5)
// A localização SÓ é pedida quando a pessoa toca no botão.
// A posição fica só na memória enquanto a tela está aberta:
// não é guardada no aparelho e não é enviada para ninguém.
// ------------------------------------------------------------
const botaoPertoDeMim = document.getElementById("botao-perto-de-mim");
const textoPertoDeMim = document.getElementById("texto-perto-de-mim");
const avisoPerto = document.getElementById("aviso-perto");

botaoPertoDeMim.addEventListener("click", function () {
  // Se já está mostrando os mais próximos, o botão volta para "todos"
  if (posicaoDaPessoa) {
    posicaoDaPessoa = null;
    textoPertoDeMim.textContent = "Perto de mim";
    avisoPerto.hidden = true;
    atualizarLocais();
    return;
  }

  // Sem locais cadastrados, não faz sentido pedir a localização da pessoa
  if (listaDeLocais.length === 0) {
    avisoPerto.textContent = "Ainda não há locais cadastrados para procurar perto de você.";
    avisoPerto.hidden = false;
    return;
  }

  if (!("geolocation" in navigator)) {
    oferecerBairros("Este aparelho não informa a localização.");
    return;
  }

  avisoPerto.textContent = "Procurando sua localização...";
  avisoPerto.hidden = false;

  navigator.geolocation.getCurrentPosition(
    function (posicao) {
      posicaoDaPessoa = {
        latitude: posicao.coords.latitude,
        longitude: posicao.coords.longitude,
      };
      bairroEscolhido = "";
      document.getElementById("escolha-de-bairro").hidden = true;
      avisoPerto.textContent =
        "Mostrando até " + QUANTOS_MAIS_PROXIMOS + " locais mais próximos. " +
        "Sua localização não é guardada.";
      textoPertoDeMim.textContent = "Mostrar todos os locais";
      atualizarLocais();
    },
    function () {
      // A pessoa negou, ou o aparelho não conseguiu. Não insistimos.
      oferecerBairros("Sem a localização, você pode escolher o bairro.");
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
  );
});

function oferecerBairros(mensagem) {
  avisoPerto.textContent = mensagem;
  avisoPerto.hidden = false;
  const bairros = document.getElementById("lista-de-bairros");
  if (bairros.options.length <= 1) {
    avisoPerto.textContent = mensagem + " Ainda não há bairros cadastrados: veja a lista completa abaixo.";
    return;
  }
  document.getElementById("escolha-de-bairro").hidden = false;
}

// Monta a lista de bairros a partir do campo "bairro" dos locais
function criarListaDeBairros() {
  const caixa = document.getElementById("lista-de-bairros");
  caixa.innerHTML = "";
  const nomes = [];
  for (const local of listaDeLocais) {
    if (local.bairro && !nomes.includes(local.bairro)) nomes.push(local.bairro);
  }
  nomes.sort();

  const todos = document.createElement("option");
  todos.value = "";
  todos.textContent = "Todos os bairros";
  caixa.append(todos);
  for (const nome of nomes) {
    const opcao = document.createElement("option");
    opcao.value = nome;
    opcao.textContent = nome;
    caixa.append(opcao);
  }
}

document.getElementById("lista-de-bairros").addEventListener("change", function (evento) {
  bairroEscolhido = evento.target.value;
  atualizarLocais();
});

// Distância entre dois pontos da Terra (fórmula de Haversine), em km.
// A Terra é quase uma bola: por isso não dá para usar só Pitágoras.
function distanciaEmKm(pontoA, pontoB) {
  const raioDaTerra = 6371;
  const paraRadianos = function (graus) { return graus * Math.PI / 180; };
  const dLat = paraRadianos(Number(pontoB.latitude) - pontoA.latitude);
  const dLon = paraRadianos(Number(pontoB.longitude) - pontoA.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(paraRadianos(pontoA.latitude)) * Math.cos(paraRadianos(Number(pontoB.latitude))) *
    Math.sin(dLon / 2) ** 2;
  return 2 * raioDaTerra * Math.asin(Math.sqrt(a));
}

function formatarDistancia(km) {
  if (km < 1) return Math.round(km * 1000) + " m";
  return km.toFixed(1).replace(".", ",") + " km";
}


// ------------------------------------------------------------
// 10. NOTÍCIAS (F7) — com destaque e filtro por tema (rascunho 3)
// Lemos data/noticias.json. As matérias são escolhidas pela equipe.
// Sem fotos: é uma regra do projeto (evitar imagens fortes).
// ------------------------------------------------------------
let noticiasCarregadas = false;
let listaDeNoticias = [];
let temaEscolhido = "todos";

async function carregarNoticias() {
  if (noticiasCarregadas) return;

  const aviso = document.getElementById("aviso-noticias");
  const textoDoAviso = document.getElementById("texto-aviso-noticias");
  const botaoTentar = document.getElementById("botao-tentar-de-novo");
  aviso.hidden = true;

  try {
    listaDeNoticias = await buscarPublicados("noticias", ARQUIVO_DE_NOTICIAS);
    listaDeNoticias.sort(function (a, b) { return String(b.data || "").localeCompare(String(a.data || "")); });
  } catch (erro) {
    console.error("Não foi possível carregar as notícias:", erro);
    textoDoAviso.textContent = "Conteúdo temporariamente indisponível.";
    botaoTentar.hidden = false;
    aviso.hidden = false;
    return;
  }

  noticiasCarregadas = true;

  if (listaDeNoticias.length === 0) {
    textoDoAviso.textContent = "Ainda não há notícias selecionadas pela equipe.";
    botaoTentar.hidden = true;
    aviso.hidden = false;
    return;
  }

  criarFiltrosDeNoticias();
  mostrarNoticias();
}

// Os temas vêm do campo "tema" de cada notícia (ex.: "Direitos", "Saúde").
function criarFiltrosDeNoticias() {
  const caixa = document.getElementById("filtros-de-noticias");
  caixa.innerHTML = "";
  const temas = [];
  for (const noticia of listaDeNoticias) {
    if (noticia.tema && !temas.includes(noticia.tema)) temas.push(noticia.tema);
  }
  if (temas.length < 2) return;

  for (const tema of ["todos"].concat(temas)) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "botao-filtro";
    botao.textContent = tema === "todos" ? "Todas" : tema;
    botao.setAttribute("aria-pressed", tema === temaEscolhido);
    botao.addEventListener("click", function () {
      temaEscolhido = tema;
      for (const outro of caixa.querySelectorAll("button")) {
        outro.setAttribute("aria-pressed", outro === botao);
      }
      mostrarNoticias();
    });
    caixa.append(botao);
  }
  caixa.hidden = false;
}

function mostrarNoticias() {
  const visiveis = listaDeNoticias.filter(function (noticia) {
    return temaEscolhido === "todos" || noticia.tema === temaEscolhido;
  });

  // A primeira notícia vira o destaque; as outras vão para a lista
  const destaque = document.getElementById("noticia-destaque");
  destaque.innerHTML = "";
  if (visiveis.length > 0) {
    destaque.append(criarNoticia(visiveis[0], "noticia-destaque", "div"));
  }

  const lista = document.getElementById("lista-de-noticias");
  lista.innerHTML = "";
  for (const noticia of visiveis.slice(1)) {
    lista.append(criarNoticia(noticia, "cartao-noticia", "li"));
  }
  document.getElementById("titulo-ultimas").hidden = visiveis.length < 2;
}

function criarNoticia(noticia, classe, tag) {
  const item = document.createElement(tag);
  item.className = classe;

  if (noticia.tema) {
    const tema = document.createElement("span");
    tema.className = "tema";
    tema.textContent = noticia.tema;
    item.append(tema);
  }

  const titulo = document.createElement("h3");
  titulo.textContent = noticia.titulo;

  const origem = document.createElement("p");
  origem.className = "origem";
  origem.textContent = [noticia.fonte, noticia.data].filter(Boolean).join(" · ");

  const resumo = document.createElement("p");
  resumo.textContent = noticia.resumo || "";

  item.append(titulo, origem, resumo);

  const endereco = linkSeguro(noticia.link);
  if (endereco) {
    const link = document.createElement("a");
    link.href = endereco;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Ler a matéria";
    item.append(link);
  }
  return item;
}

document.getElementById("botao-tentar-de-novo").addEventListener("click", carregarNoticias);


// ------------------------------------------------------------
// 11. SEM INTERNET (F9)
// O "service worker" (arquivo sw.js) guarda uma cópia do app e da
// lista de locais no aparelho. Aqui só avisamos quando a internet cai.
// ------------------------------------------------------------
function atualizarAvisoDeInternet() {
  document.getElementById("faixa-sem-internet").hidden = navigator.onLine;
}
window.addEventListener("online", atualizarAvisoDeInternet);
window.addEventListener("offline", atualizarAvisoDeInternet);
atualizarAvisoDeInternet();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(function (erro) {
    console.error("Não foi possível ativar o modo sem internet:", erro);
  });
}


// ------------------------------------------------------------
// 11b. COLOCAR NA TELA DO CELULAR (instalar o app)
// No Android, o Chrome avisa quando o app pode ser instalado: é o evento
// "beforeinstallprompt". Guardamos esse aviso e só abrimos a janela de
// instalação quando a pessoa tocar em "Instalar agora" (ela decide).
// No iPhone não existe esse aviso; a tela mostra o passo a passo.
// ------------------------------------------------------------
let pedidoDeInstalacao = null;

function esconderConviteParaInstalar() {
  for (const id of ["atalho-instalar", "cartao-instalar", "botao-instalar"]) {
    document.getElementById(id).hidden = true;
  }
}

// Já está instalado (aberto pelo ícone)? Então não oferecemos instalar de novo.
if (matchMedia("(display-mode: standalone)").matches || navigator.standalone === true) {
  esconderConviteParaInstalar();
}

window.addEventListener("beforeinstallprompt", function (evento) {
  evento.preventDefault();          // sem convite automático na tela
  pedidoDeInstalacao = evento;
  document.getElementById("botao-instalar").hidden = false;
});

document.getElementById("botao-instalar").addEventListener("click", async function () {
  if (!pedidoDeInstalacao) return;
  pedidoDeInstalacao.prompt();      // abre a janela do Chrome: "Instalar app?"
  await pedidoDeInstalacao.userChoice;
  pedidoDeInstalacao = null;        // o aviso só pode ser usado uma vez
  document.getElementById("botao-instalar").hidden = true;
});

window.addEventListener("appinstalled", esconderConviteParaInstalar);


// ------------------------------------------------------------
// 12. CONTADOR DE ACESSOS
// Conta só UMA coisa: "o app foi aberto". Nada sobre a pessoa: não conta o
// que ela busca, quais locais abre, nem onde está. Sem cookies.
// Usamos uma "imagem invisível" em vez de carregar o código de outro site:
// assim nenhum programa de fora roda dentro do nosso app.
// ------------------------------------------------------------
function contarAcesso() {
  if (!linkSeguro(CONTADOR_DE_ACESSOS)) return;          // contador desligado
  if (NO_COMPUTADOR || MODO_DEMONSTRACAO) return;        // testes não contam
  if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl) return; // pediu para não ser rastreada
  if (!navigator.onLine) return;
  const contagem = new Image();
  contagem.referrerPolicy = "no-referrer";
  contagem.src = CONTADOR_DE_ACESSOS.replace(/\/$/, "") + "/count?p=" + encodeURIComponent("/app-aberto") +
    "&t=" + encodeURIComponent("App aberto");
}


// ------------------------------------------------------------
// COMEÇO: quando a página abre, já buscamos os locais.
// ------------------------------------------------------------
carregarLocais();
contarAcesso();
