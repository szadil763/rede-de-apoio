// ============================================================
// admin.js — a área do administrador, ligada ao Firebase
//
// Este arquivo é um "módulo" (type="module"): ele importa as bibliotecas
// oficiais do Firebase direto do site do Google.
//  - Authentication: o login com e-mail e senha.
//  - Firestore: o banco de dados com os locais e as notícias.
// Quem decide o que cada pessoa pode fazer são as REGRAS do banco
// (firebase/firestore.rules). Este código só mostra as telas e pede.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail,
  setPersistence, browserSessionPersistence, connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, onSnapshot, addDoc, updateDoc, deleteDoc,
  serverTimestamp, deleteField, connectFirestoreEmulator, query, where, documentId,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebase = initializeApp(CONFIG_DO_FIREBASE);
const auth = getAuth(firebase);
const banco = getFirestore(firebase);

// Só para testes no computador: http://localhost:8000/admin/?emulador
// usa o banco de mentira (Firebase Emulator) em vez do banco de verdade.
const NO_COMPUTADOR = location.hostname === "localhost" || location.hostname === "127.0.0.1";
if (NO_COMPUTADOR && new URLSearchParams(location.search).has("emulador")) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(banco, "127.0.0.1", 8085);
}

// Em computador da escola, a sessão termina quando a aba é fechada
setPersistence(auth, browserSessionPersistence);

const CATEGORIAS = {
  "delegacia-da-mulher": "Delegacia da Mulher",
  "centro-de-referencia": "Centro de Referência",
  "hospital": "Hospital / saúde",
  "cras-creas": "Assistência Social",
  "defensoria": "Defensoria Pública",
};
const CENTRO_DO_MAPA = [-23.454, -46.533];   // centro aproximado de Guarulhos

// Aviso por e-mail para a equipe a cada mudança. Fica desligado ("") até o professor
// publicar o script firebase/aviso-por-email.gs e colar aqui o endereço dele
// (passo a passo em firebase/LEIA-ME.md).
const AVISO_POR_EMAIL = "https://script.google.com/macros/s/AKfycbzuqaO9X3e2iRFZRQNuUdrd5VZSwkHB3ZBDQKkXXo4Tbc5gaoDPplHaKouWwAaBJ6i2/exec";

let meuUid = null;
let nomesDaEquipe = {};      // uid -> primeiro nome (da coleção "admins")
let locais = [];
let noticias = [];
let localEmEdicao = null;    // id do local sendo editado (null = novo)
let noticiaEmEdicao = null;
let pararDeOuvir = [];       // para desligar as atualizações ao sair
let painelPreparado = false;

const $ = function (id) { return document.getElementById(id); };


// ------------------------------------------------------------
// 1. TELAS
// ------------------------------------------------------------
function mostrarSo(idDaTela) {
  for (const id of ["tela-carregando", "tela-login", "tela-inicio-admin", "area-painel"]) {
    $(id).hidden = id !== idDaTela;
  }
  $("topo-botoes").hidden = idDaTela === "tela-login" || idDaTela === "tela-carregando";
}

for (const aba of document.querySelectorAll("[data-aba]")) {
  aba.addEventListener("click", function () {
    for (const outra of document.querySelectorAll("[data-aba]")) {
      outra.setAttribute("aria-selected", outra === aba);
      $(outra.dataset.aba).hidden = outra !== aba;
    }
    if (aba.dataset.aba === "aba-locais" && mapa) mapa.invalidateSize();
    if (aba.dataset.aba === "aba-acessos") mostrarAcessos();
  });
}

function avisar(texto, ehErro) {
  const caixa = $("aviso-geral");
  caixa.textContent = texto;
  caixa.classList.toggle("aviso-erro", Boolean(ehErro));
  caixa.hidden = false;
  clearTimeout(avisar.relogio);
  avisar.relogio = setTimeout(function () { caixa.hidden = true; }, 6000);
}

// Traduz os erros do Firebase para frases simples
function explicarErro(erro) {
  const codigo = (erro && erro.code) || "";
  if (codigo.includes("invalid-credential") || codigo.includes("wrong-password") || codigo.includes("user-not-found")) {
    return "E-mail ou senha errados.";
  }
  if (codigo.includes("too-many-requests")) return "Muitas tentativas. Espere alguns minutos e tente de novo.";
  if (codigo.includes("network") || codigo.includes("unavailable")) return "Sem conexão com a internet. Tente de novo.";
  if (codigo.includes("permission-denied")) return "O Firebase não deixou. Confira se outra pessoa precisa fazer esta etapa.";
  if (codigo.includes("invalid-email")) return "Esse e-mail não parece certo.";
  return "Algo deu errado (" + (codigo || erro.message) + ").";
}


// ------------------------------------------------------------
// 2. ENTRAR E SAIR
// ------------------------------------------------------------
$("form-login").addEventListener("submit", async function (evento) {
  evento.preventDefault();
  const erro = $("erro-login");
  erro.hidden = true;
  try {
    await signInWithEmailAndPassword(auth, $("campo-email").value.trim(), $("campo-senha").value);
    $("campo-senha").value = "";
  } catch (falha) {
    erro.textContent = explicarErro(falha);
    erro.hidden = false;
  }
});

$("esqueci-senha").addEventListener("click", async function () {
  const email = $("campo-email").value.trim();
  const erro = $("erro-login");
  if (!email) {
    erro.textContent = "Escreva o seu e-mail acima e toque de novo em \"Esqueci a senha\".";
    erro.hidden = false;
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (falha) { /* não contamos se o e-mail existe ou não */ }
  erro.textContent = "Se esse e-mail tiver conta, chegou um link para criar uma senha nova.";
  erro.hidden = false;
});

$("sair-admin").addEventListener("click", async function () {
  await signOut(auth);
  location.reload();   // limpa tudo da memória
});

$("ir-inicio").addEventListener("click", function () { mostrarSo("tela-inicio-admin"); });

// O Firebase avisa sempre que alguém entra ou sai
onAuthStateChanged(auth, async function (usuario) {
  for (const parar of pararDeOuvir) parar();
  pararDeOuvir = [];
  if (!usuario) {
    meuUid = null;
    mostrarSo("tela-login");
    return;
  }
  // Ter login não basta: precisa estar na lista de administradores
  let ficha;
  try {
    ficha = await getDoc(doc(banco, "admins", usuario.uid));
  } catch (falha) {
    ficha = null;
  }
  if (!ficha || !ficha.exists()) {
    await signOut(auth);
    $("erro-login").textContent = "Esta conta ainda não é de administrador. Peça ao professor para liberar.";
    $("erro-login").hidden = false;
    mostrarSo("tela-login");
    return;
  }
  meuUid = usuario.uid;
  $("ola").textContent = "Olá, " + (ficha.data().nome || "administrador") + "!";
  mostrarSo("tela-inicio-admin");
});

$("abrir-painel").addEventListener("click", async function () {
  mostrarSo("area-painel");
  if (!painelPreparado) {
    painelPreparado = true;
    prepararMapa();
  }
  if (pararDeOuvir.length === 0) await comecarAOuvir();
  if (mapa) mapa.invalidateSize();
});


// ------------------------------------------------------------
// 3. DADOS EM TEMPO REAL
// "onSnapshot" avisa a página sempre que algo muda no banco,
// até quando outra pessoa da equipe salva do computador dela.
// ------------------------------------------------------------
async function comecarAOuvir() {
  try {
    const equipe = await getDocs(collection(banco, "admins"));
    nomesDaEquipe = {};
    equipe.forEach(function (ficha) { nomesDaEquipe[ficha.id] = ficha.data().nome || "alguém"; });
  } catch (falha) { /* sem os nomes, mostramos "alguém" */ }

  pararDeOuvir.push(onSnapshot(collection(banco, "locais"), function (resultado) {
    locais = resultado.docs.map(function (d) { return { id: d.id, ...d.data() }; });
    mostrarLocais();
  }, function (falha) { avisar(explicarErro(falha), true); }));

  pararDeOuvir.push(onSnapshot(collection(banco, "noticias"), function (resultado) {
    noticias = resultado.docs.map(function (d) { return { id: d.id, ...d.data() }; });
    mostrarNoticias();
  }, function (falha) { avisar(explicarErro(falha), true); }));
}

function nomeDe(uid) {
  if (!uid) return "—";
  return uid === meuUid ? "você" : (nomesDaEquipe[uid] || "alguém da equipe");
}


// ------------------------------------------------------------
// 4. REGRAS (as mesmas do servidor, para avisar antes)
// ------------------------------------------------------------
function linkSeguro(texto) {
  return /^https:\/\/\S+$/.test(String(texto || ""));
}

function oQueFaltaParaPublicarLocal(local) {
  const falta = [];
  if (!linkSeguro(local.fonte)) falta.push("link da fonte oficial");
  return falta;
}

function oQueFaltaParaPublicarNoticia(noticia) {
  const falta = [];
  if (!linkSeguro(noticia.link)) falta.push("link da matéria");
  if (!noticia.resumo) falta.push("resumo");
  return falta;
}


// ------------------------------------------------------------
// 5. LISTAS (locais e notícias usam a mesma função)
// ------------------------------------------------------------
function mostrarLocais() {
  $("contagem-locais").textContent = "(" + locais.length + ")";
  mostrarLista($("lista-locais"), locais, {
    colecao: "locais",
    titulo: function (l) { return l.nome + " · " + (CATEGORIAS[l.categoria] || l.categoria); },
    falta: oQueFaltaParaPublicarLocal,
    editar: editarLocal,
    camposDaConferencia: function () {
      return { ultimaVerificacao: new Date().toISOString().slice(0, 10) };
    },
  });
  if (mapa) mostrarPontosNoMapa();
}

function mostrarNoticias() {
  $("contagem-noticias").textContent = "(" + noticias.length + ")";
  mostrarLista($("lista-noticias"), noticias, {
    colecao: "noticias",
    titulo: function (n) { return n.titulo + " · " + (n.fonte || ""); },
    falta: oQueFaltaParaPublicarNoticia,
    editar: editarNoticia,
    camposDaConferencia: function () { return {}; },
  });
}

function mostrarLista(lista, itens, jeito) {
  lista.innerHTML = "";
  if (itens.length === 0) {
    const vazio = document.createElement("li");
    vazio.className = "vazio";
    vazio.textContent = "Nada cadastrado ainda.";
    lista.append(vazio);
    return;
  }
  // Os que esperam conferência aparecem primeiro
  const ordenados = itens.slice().sort(function (a, b) {
    if (a.status !== b.status) return a.status === "pendente" ? -1 : 1;
    return jeito.titulo(a).localeCompare(jeito.titulo(b), "pt-BR");
  });

  for (const item of ordenados) {
    const linha = document.createElement("li");
    const texto = document.createElement("div");
    const nome = document.createElement("strong");
    nome.textContent = jeito.titulo(item);
    const estado = document.createElement("span");
    const quem = document.createElement("span");
    quem.className = "quem";

    if (item.status === "publicado") {
      estado.className = "estado pronto";
      estado.textContent = "Publicado";
      quem.textContent = "Cadastrado por " + nomeDe(item.cadastradoPorUid) + " · conferido por " +
        nomeDe(item.verificadoPorUid) + (item.ultimaVerificacao ? " em " + item.ultimaVerificacao : "");
    } else {
      const falta = jeito.falta(item);
      estado.className = "estado pendente";
      estado.textContent = "Esperando conferência" + (falta.length ? " · falta: " + falta.join(", ") : "");
      quem.textContent = "Cadastrado por " + nomeDe(item.cadastradoPorUid);
    }
    texto.append(nome, estado, quem);

    const botoes = document.createElement("div");
    botoes.className = "botoes-do-item";
    botoes.append(criarBotao("Editar", "botao-claro", function () { jeito.editar(item); }));

    if (item.status === "publicado") {
      botoes.append(criarBotao("Tirar do ar", "botao-claro", function () { tirarDoAr(jeito.colecao, item); }));
    } else {
      const publicar = criarBotao("Conferir e publicar", "", function () { conferirEPublicar(jeito, item); });
      if (item.cadastradoPorUid === meuUid) {
        publicar.disabled = true;
        publicar.title = "Você cadastrou este item: outra pessoa da equipe precisa conferir.";
      } else if (jeito.falta(item).length) {
        publicar.disabled = true;
        publicar.title = "Antes, complete: " + jeito.falta(item).join(", ");
      }
      botoes.append(publicar);
    }
    botoes.append(criarBotao("Remover", "botao-perigo", function () { remover(jeito.colecao, item, jeito.titulo(item)); }));

    linha.append(texto, botoes);
    lista.append(linha);
  }
}

function criarBotao(texto, classeExtra, aoClicar) {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "botao " + classeExtra;
  botao.textContent = texto;
  botao.addEventListener("click", aoClicar);
  return botao;
}


// ------------------------------------------------------------
// 6. CONFERIR E PUBLICAR, TIRAR DO AR, REMOVER
// ------------------------------------------------------------

// Pede ao script do professor que mande o e-mail para a equipe. Vai junto o "token"
// do login, para o script confirmar que o pedido veio mesmo de um admin.
// "no-cors": o painel só envia e não espera resposta. Se o e-mail falhar, a mudança
// no banco continua valendo; o aviso é uma ajuda, não uma trava.
async function avisarEquipePorEmail(acao, colecao, id, titulo) {
  if (!AVISO_POR_EMAIL || !auth.currentUser) return;
  try {
    const token = await auth.currentUser.getIdToken();
    await fetch(AVISO_POR_EMAIL, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify({ token, acao, colecao, id, titulo }),
    });
  } catch (falha) {
    console.warn("Não consegui pedir o aviso por e-mail:", falha);
  }
}

async function conferirEPublicar(jeito, item) {
  const ok = confirm(
    "Conferir e publicar \"" + jeito.titulo(item) + "\"?\n\n" +
    "Confirme que você abriu a fonte oficial (ou ligou para o serviço) e que as informações estão certas. " +
    "Depois de publicado, aparece no app para todo mundo."
  );
  if (!ok) return;
  try {
    await updateDoc(doc(banco, jeito.colecao, item.id), {
      status: "publicado",
      verificadoPorUid: meuUid,
      publicadoEm: serverTimestamp(),
      ...jeito.camposDaConferencia(),
    });
    avisar("Publicado! Já aparece no app.");
    avisarEquipePorEmail("publicou", jeito.colecao, item.id, jeito.titulo(item));
  } catch (falha) {
    avisar(explicarErro(falha), true);
  }
}

async function tirarDoAr(colecao, item) {
  if (!confirm("Tirar do ar? O item volta a esperar conferência e some do app.")) return;
  try {
    await updateDoc(doc(banco, colecao, item.id), {
      status: "pendente",
      cadastradoPorUid: meuUid,
      verificadoPorUid: deleteField(),
      atualizadoEm: serverTimestamp(),
    });
    avisar("Tirado do ar.");
    avisarEquipePorEmail("tirou-do-ar", colecao, item.id, item.nome || item.titulo);
  } catch (falha) {
    avisar(explicarErro(falha), true);
  }
}

async function remover(colecao, item, titulo) {
  if (!confirm("Remover \"" + titulo + "\" para sempre?")) return;
  try {
    await deleteDoc(doc(banco, colecao, item.id));
    avisar("Removido.");
    avisarEquipePorEmail("removeu", colecao, item.id, titulo);
  } catch (falha) {
    avisar(explicarErro(falha), true);
  }
}


// ------------------------------------------------------------
// 7. FORMULÁRIO DE LOCAL
// ------------------------------------------------------------
const formLocal = $("form-local");
const TEXTOS_DO_LOCAL = ["nome", "categoria", "endereco", "bairro", "telefone", "horario", "oQueOferece", "fonte"];

function editarLocal(local) {
  localEmEdicao = local.id;
  for (const campo of TEXTOS_DO_LOCAL) formLocal.elements[campo].value = local[campo] ?? "";
  formLocal.elements.latitude.value = local.latitude ?? "";
  formLocal.elements.longitude.value = local.longitude ?? "";
  $("titulo-form-local").textContent = "Editar: " + local.nome;
  $("erros-local").hidden = true;
  moverMarcadorDoFormulario();
  formLocal.scrollIntoView({ block: "start" });
}

function limparFormLocal() {
  localEmEdicao = null;
  formLocal.reset();
  limparResultados();
  mostrarEstado("estado-busca", "");
  mostrarEstado("estado-endereco", "");
  $("titulo-form-local").textContent = "Novo local";
  $("erros-local").hidden = true;
  moverMarcadorDoFormulario();
}

$("novo-local").addEventListener("click", function () { limparFormLocal(); formLocal.elements.nome.focus(); });
$("cancelar-local").addEventListener("click", limparFormLocal);

function numeroOuNada(texto) {
  const limpo = String(texto).trim().replace(",", ".");
  if (limpo === "") return null;
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : NaN;
}

formLocal.addEventListener("submit", async function (evento) {
  evento.preventDefault();
  const dados = {};
  for (const campo of TEXTOS_DO_LOCAL) dados[campo] = formLocal.elements[campo].value.trim();
  dados.latitude = numeroOuNada(formLocal.elements.latitude.value);
  dados.longitude = numeroOuNada(formLocal.elements.longitude.value);

  const problemas = [];
  if (!dados.nome) problemas.push("nome");
  if (!CATEGORIAS[dados.categoria]) problemas.push("categoria");
  if (!dados.endereco) problemas.push("endereço");
  if (/EXEMPLO|FICT[IÍ]CIO/i.test(dados.nome)) problemas.push("tirar a palavra EXEMPLO/FICTÍCIO");
  if (dados.fonte && !linkSeguro(dados.fonte)) problemas.push("o link da fonte precisa começar com https://");
  if (Number.isNaN(dados.latitude) || Number.isNaN(dados.longitude) || (dados.latitude === null) !== (dados.longitude === null)) {
    problemas.push("latitude e longitude (as duas, em números)");
  } else if (dados.latitude !== null && !(dados.latitude > -34 && dados.latitude < 6 && dados.longitude > -74 && dados.longitude < -32)) {
    problemas.push("posição dentro do Brasil");
  }
  if (dados.telefone && !/^\d{3,13}$/.test(dados.telefone.replace(/\D/g, ""))) problemas.push("telefone");
  if (problemas.length) {
    mostrarErro("erros-local", "Não salvei. Confira: " + problemas.join(", ") + ".");
    return;
  }

  const gravar = {
    ...dados,
    status: "pendente",
    cadastradoPorUid: meuUid,
    atualizadoEm: serverTimestamp(),
  };
  try {
    if (localEmEdicao === null) {
      const novo = await addDoc(collection(banco, "locais"), { ...gravar, ultimaVerificacao: "" });
      avisarEquipePorEmail("cadastrou", "locais", novo.id, dados.nome);
    } else {
      await updateDoc(doc(banco, "locais", localEmEdicao), { ...gravar, verificadoPorUid: deleteField() });
      avisarEquipePorEmail("editou", "locais", localEmEdicao, dados.nome);
    }
    limparFormLocal();
    avisar("Salvo. Agora outra pessoa da equipe precisa conferir e publicar.");
  } catch (falha) {
    mostrarErro("erros-local", explicarErro(falha));
  }
});

function mostrarErro(id, texto) {
  $(id).textContent = texto;
  $(id).hidden = false;
}


// ------------------------------------------------------------
// 8. MAPA DO PAINEL: clicar no mapa preenche latitude e longitude
// ------------------------------------------------------------
let mapa = null;
let marcadorDoFormulario = null;
let camadaDePontos = null;

function prepararMapa() {
  if (typeof L === "undefined") {
    $("mapa-admin").textContent = "O mapa não carregou. Digite a latitude e a longitude.";
    return;
  }
  mapa = L.map("mapa-admin").setView(CENTRO_DO_MAPA, 12);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "&copy; colaboradores do OpenStreetMap",
  }).addTo(mapa);
  camadaDePontos = L.layerGroup().addTo(mapa);
  mapa.on("click", function (evento) {
    formLocal.elements.latitude.value = evento.latlng.lat.toFixed(6);
    formLocal.elements.longitude.value = evento.latlng.lng.toFixed(6);
    moverMarcadorDoFormulario();
  });
  mostrarPontosNoMapa();
}

function moverMarcadorDoFormulario() {
  if (!mapa) return;
  if (marcadorDoFormulario) { marcadorDoFormulario.remove(); marcadorDoFormulario = null; }
  const lat = numeroOuNada(formLocal.elements.latitude.value);
  const lon = numeroOuNada(formLocal.elements.longitude.value);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    marcadorDoFormulario = L.circleMarker([lat, lon], {
      radius: 11, color: "#ffffff", weight: 3, fillColor: "#c2457a", fillOpacity: 1,
    }).addTo(mapa);
    mapa.setView([lat, lon], Math.max(mapa.getZoom(), 15));
  }
}
formLocal.elements.latitude.addEventListener("change", moverMarcadorDoFormulario);
formLocal.elements.longitude.addEventListener("change", moverMarcadorDoFormulario);

// Locais já cadastrados aparecem como bolinhas: roxo = publicado, cinza = esperando
function mostrarPontosNoMapa() {
  if (!camadaDePontos) return;
  camadaDePontos.clearLayers();
  for (const local of locais) {
    if (typeof local.latitude !== "number" || typeof local.longitude !== "number") continue;
    L.circleMarker([local.latitude, local.longitude], {
      radius: 7, color: "#ffffff", weight: 2,
      fillColor: local.status === "publicado" ? "#5b2a6e" : "#9a8f9e", fillOpacity: 1,
    }).bindTooltip(local.nome).addTo(camadaDePontos);
  }
}


// ------------------------------------------------------------
// 8b. PROCURAR NO MAPA E ACHAR ENDEREÇO (Nominatim, a busca do OpenStreetMap)
// O Nominatim é gratuito, mas pede uso leve: no máximo 1 busca por segundo,
// só quando alguém clica. O resultado é um PONTO DE PARTIDA: o mapa é feito
// por voluntários e pode estar errado. Por isso nunca preenchemos o telefone
// e o link da fonte oficial continua obrigatório para publicar.
// ------------------------------------------------------------
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
let ultimaBusca = 0;
let camadaDeResultados = null;

async function buscarNoNominatim(parametros) {
  const espera = ultimaBusca + 1100 - Date.now();       // respeita 1 busca por segundo
  if (espera > 0) await new Promise(function (pronto) { setTimeout(pronto, espera); });
  ultimaBusca = Date.now();
  const endereco = NOMINATIM + "?" + new URLSearchParams({
    format: "jsonv2", addressdetails: "1", countrycodes: "br", "accept-language": "pt-BR", ...parametros,
  });
  const resposta = await fetch(endereco);
  if (!resposta.ok) throw new Error("Nominatim respondeu " + resposta.status);
  return resposta.json();
}

// Região que aparece no mapa, no formato que o Nominatim pede: oeste,norte,leste,sul.
// Com o mapa muito aproximado, a busca olharia só umas ruas: aí usamos um
// quadrado de 16 km em volta do centro do mapa.
function regiaoDoMapa() {
  if (!mapa) return null;
  const limites = mapa.getZoom() >= 14 ? mapa.getCenter().toBounds(16000) : mapa.getBounds();
  return [limites.getWest(), limites.getNorth(), limites.getEast(), limites.getSouth()]
    .map(function (n) { return n.toFixed(5); }).join(",");
}

// Do resultado do Nominatim, monta "Rua X, 123" e o bairro
function enderecoDoResultado(resultado) {
  const a = resultado.address || {};
  const rua = [a.road || a.pedestrian || "", a.house_number || ""].filter(Boolean).join(", ");
  return {
    endereco: rua,
    bairro: a.suburb || a.neighbourhood || a.city_district || a.quarter || "",
    cidade: a.city || a.town || a.village || "",
  };
}

function usarResultado(resultado) {
  const partes = enderecoDoResultado(resultado);
  if (resultado.name) formLocal.elements.nome.value = resultado.name;
  if (partes.endereco) formLocal.elements.endereco.value = partes.endereco;
  if (partes.bairro) formLocal.elements.bairro.value = partes.bairro;
  formLocal.elements.latitude.value = Number(resultado.lat).toFixed(6);
  formLocal.elements.longitude.value = Number(resultado.lon).toFixed(6);
  moverMarcadorDoFormulario();
  limparResultados();
  mostrarEstado("estado-busca",
    "Preenchido com os dados do mapa. Agora confira nome, endereço e telefone na fonte oficial " +
    "e cole o link dela antes de salvar.");
}

function limparResultados() {
  $("resultados-lugares").replaceChildren();
  if (camadaDeResultados) camadaDeResultados.clearLayers();
}

function mostrarEstado(id, texto) {
  $(id).textContent = texto;
  $(id).hidden = !texto;
}

async function procurarLugares() {
  const termo = $("termo-lugares").value.trim();
  if (termo.length < 3) { mostrarEstado("estado-busca", "Digite pelo menos 3 letras."); return; }
  const regiao = regiaoDoMapa();
  if (!regiao) { mostrarEstado("estado-busca", "O mapa não carregou, então não sei onde procurar."); return; }

  limparResultados();
  mostrarEstado("estado-busca", "Procurando…");
  $("procurar-lugares").disabled = true;
  try {
    const resultados = await buscarNoNominatim({ q: termo, viewbox: regiao, bounded: "1", limit: "10" });
    if (resultados.length === 0) {
      mostrarEstado("estado-busca", "Nada encontrado nesta região. Tente outra palavra ou afaste o mapa (zoom −).");
      return;
    }
    mostrarEstado("estado-busca", resultados.length + " encontrado(s). Toque em \"Usar\" para preencher o formulário.");
    if (!camadaDeResultados) camadaDeResultados = L.layerGroup().addTo(mapa);
    const pontos = [];
    for (const resultado of resultados) {
      const partes = enderecoDoResultado(resultado);
      const nome = resultado.name || resultado.display_name.split(",")[0];

      const item = document.createElement("li");
      item.className = "resultado";
      const texto = document.createElement("span");
      const titulo = document.createElement("strong");
      titulo.textContent = nome;
      const detalhe = document.createElement("small");
      detalhe.textContent = [partes.endereco, partes.bairro, partes.cidade].filter(Boolean).join(" · ") || resultado.display_name;
      texto.append(titulo, detalhe);
      item.append(texto, criarBotao("Usar", "botao-claro", function () { usarResultado(resultado); }));
      $("resultados-lugares").append(item);

      const ponto = [Number(resultado.lat), Number(resultado.lon)];
      pontos.push(ponto);
      L.circleMarker(ponto, { radius: 8, color: "#ffffff", weight: 2, fillColor: "#e0a23a", fillOpacity: 1 })
        .bindTooltip(nome)
        .on("click", function () { usarResultado(resultado); })
        .addTo(camadaDeResultados);
    }
    mapa.fitBounds(pontos, { padding: [30, 30], maxZoom: 16 });
  } catch (falha) {
    console.error(falha);
    mostrarEstado("estado-busca", "Não consegui procurar agora (sem internet ou o serviço do mapa não respondeu).");
  } finally {
    $("procurar-lugares").disabled = false;
  }
}

async function acharEndereco() {
  const endereco = formLocal.elements.endereco.value.trim();
  if (!endereco) { mostrarEstado("estado-endereco", "Digite o endereço primeiro."); return; }
  const bairro = formLocal.elements.bairro.value.trim();
  mostrarEstado("estado-endereco", "Procurando o endereço…");
  $("achar-endereco").disabled = true;
  try {
    // A região do mapa entra como preferência (bounded=0), não como limite
    const parametros = { q: [endereco, bairro].filter(Boolean).join(", "), limit: "1" };
    const regiao = regiaoDoMapa();
    if (regiao) parametros.viewbox = regiao;
    const [achado] = await buscarNoNominatim(parametros);
    if (!achado) {
      mostrarEstado("estado-endereco", "Não achei esse endereço. Confira a escrita ou clique no mapa no lugar certo.");
      return;
    }
    formLocal.elements.latitude.value = Number(achado.lat).toFixed(6);
    formLocal.elements.longitude.value = Number(achado.lon).toFixed(6);
    moverMarcadorDoFormulario();
    mostrarEstado("estado-endereco",
      "Achei: " + achado.display_name + ". Confira o ponto rosa no mapa. Se estiver errado, clique no lugar certo.");
  } catch (falha) {
    console.error(falha);
    mostrarEstado("estado-endereco", "Não consegui procurar agora (sem internet ou o serviço do mapa não respondeu).");
  } finally {
    $("achar-endereco").disabled = false;
  }
}

$("procurar-lugares").addEventListener("click", procurarLugares);
$("achar-endereco").addEventListener("click", acharEndereco);
// Enter no campo de busca procura, em vez de salvar o formulário inteiro
$("termo-lugares").addEventListener("keydown", function (evento) {
  if (evento.key === "Enter") { evento.preventDefault(); procurarLugares(); }
});


// ------------------------------------------------------------
// 9. FORMULÁRIO DE NOTÍCIA
// ------------------------------------------------------------
const formNoticia = $("form-noticia");
const CAMPOS_DA_NOTICIA = ["titulo", "tema", "fonte", "link", "data", "resumo"];

function editarNoticia(noticia) {
  noticiaEmEdicao = noticia.id;
  for (const campo of CAMPOS_DA_NOTICIA) formNoticia.elements[campo].value = noticia[campo] ?? "";
  $("titulo-form-noticia").textContent = "Editar notícia";
  $("erros-noticia").hidden = true;
  formNoticia.scrollIntoView({ block: "start" });
}

function limparFormNoticia() {
  noticiaEmEdicao = null;
  formNoticia.reset();
  $("titulo-form-noticia").textContent = "Nova notícia";
  $("erros-noticia").hidden = true;
}

$("nova-noticia").addEventListener("click", function () { limparFormNoticia(); formNoticia.elements.titulo.focus(); });
$("cancelar-noticia").addEventListener("click", limparFormNoticia);

// Tira do link o rastreamento que buscadores e IAs colocam (ex.: ?utm_source=chatgpt.com)
function limparLink(endereco) {
  if (!endereco) return "";
  try {
    const url = new URL(endereco);
    for (const chave of [...url.searchParams.keys()]) {
      if (chave.startsWith("utm_")) url.searchParams.delete(chave);
    }
    return url.toString();
  } catch (erro) {
    return endereco;
  }
}

formNoticia.addEventListener("submit", async function (evento) {
  evento.preventDefault();
  const dados = {};
  for (const campo of CAMPOS_DA_NOTICIA) dados[campo] = formNoticia.elements[campo].value.trim();
  dados.link = limparLink(dados.link);

  const problemas = [];
  if (!dados.titulo) problemas.push("título");
  if (!dados.fonte) problemas.push("fonte");
  if (dados.link && !linkSeguro(dados.link)) problemas.push("o link precisa começar com https://");
  if (problemas.length) {
    mostrarErro("erros-noticia", "Não salvei. Confira: " + problemas.join(", ") + ".");
    return;
  }
  const gravar = { ...dados, status: "pendente", cadastradoPorUid: meuUid, atualizadoEm: serverTimestamp() };
  try {
    if (noticiaEmEdicao === null) {
      const nova = await addDoc(collection(banco, "noticias"), gravar);
      avisarEquipePorEmail("cadastrou", "noticias", nova.id, dados.titulo);
    } else {
      await updateDoc(doc(banco, "noticias", noticiaEmEdicao), { ...gravar, verificadoPorUid: deleteField() });
      avisarEquipePorEmail("editou", "noticias", noticiaEmEdicao, dados.titulo);
    }
    limparFormNoticia();
    avisar("Salva. Agora outra pessoa da equipe precisa conferir e publicar.");
  } catch (falha) {
    mostrarErro("erros-noticia", explicarErro(falha));
  }
});


// ------------------------------------------------------------
// 10. ACESSOS: quantas vezes o app foi aberto (coleção "acessos")
// Cada documento é um dia ("2026-10-22") com o campo "total".
// ------------------------------------------------------------
function diaNoBrasil(data) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(data);
}

// Os últimos N dias, do mais antigo para hoje: ["2026-10-09", ..., "2026-10-22"]
function ultimosDias(quantos) {
  const dias = [];
  for (let i = quantos - 1; i >= 0; i--) dias.push(diaNoBrasil(new Date(Date.now() - i * 86400000)));
  return dias;
}

async function mostrarAcessos() {
  $("estado-acessos").textContent = "Carregando…";
  const dias30 = ultimosDias(30);
  try {
    // Só os documentos dos últimos 30 dias (o nome do documento é a data)
    const resultado = await getDocs(query(collection(banco, "acessos"), where(documentId(), ">=", dias30[0])));
    const porDia = {};
    resultado.forEach(function (ficha) { porDia[ficha.id] = Number(ficha.data().total) || 0; });
    const somar = function (dias) { return dias.reduce(function (soma, dia) { return soma + (porDia[dia] || 0); }, 0); };

    $("acessos-hoje").textContent = somar(dias30.slice(-1));
    $("acessos-7").textContent = somar(dias30.slice(-7));
    $("acessos-30").textContent = somar(dias30);

    // Gráfico de barras: a barra mais alta ocupa a largura toda
    const dias14 = dias30.slice(-14);
    const maior = Math.max(1, ...dias14.map(function (dia) { return porDia[dia] || 0; }));
    const grafico = $("grafico-acessos");
    grafico.replaceChildren();
    for (const dia of dias14) {
      const total = porDia[dia] || 0;
      const linha = document.createElement("li");
      const rotulo = document.createElement("span");
      rotulo.textContent = dia.slice(8, 10) + "/" + dia.slice(5, 7);
      const barra = document.createElement("span");
      barra.className = "barra";
      barra.style.width = (total / maior * 100) + "%";
      const numero = document.createElement("span");
      numero.textContent = total;
      linha.append(rotulo, barra, numero);
      grafico.append(linha);
    }
    $("estado-acessos").textContent = "Atualizado às " +
      new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + ".";
  } catch (falha) {
    $("estado-acessos").textContent = explicarErro(falha);
  }
}

$("atualizar-acessos").addEventListener("click", mostrarAcessos);
