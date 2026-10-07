/* Pronto Atendimento - OGM Londrina
   Front-end estático (Vercel) sobre API do Apps Script (Google Sheets). */

const API = window.API_URL;
const MESES = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const VERDE = '#0B5D3B', VERDES = ['#0B5D3B', '#1E9E62', '#4FBF8B', '#8ED9B4', '#C79A2B', '#E0C879', '#6B8F80', '#A9C4B8', '#2F6E52', '#D9E7E0'];

const estado = { tax: {}, orgaos: [], par: {}, dados: [], filtrados: [], editando: null, graficos: {}, baseCarregada: false };
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

/* ------------------------------------------------------------------ util -- */
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Ordena alfabeticamente (pt-BR, ignora acento), com catch-all no fim.
const AO_FIM = ['TELEFONE NÃO ATENDIDO/OUTROS Nº INFORMADOS', 'OUTROS'];
const ordenar = (lista) => lista.slice().sort((a, b) => {
  const ra = AO_FIM.indexOf(String(a).trim().toUpperCase()) + 1;
  const rb = AO_FIM.indexOf(String(b).trim().toUpperCase()) + 1;
  if (ra !== rb) return ra - rb;
  return String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' });
});

function toast(msg, erro) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast mostra' + (erro ? ' erro' : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => (t.className = 'toast'), 3200);
}

function status(el, msg, tipo) {
  const e = $(el);
  e.textContent = msg;
  e.className = 'status' + (tipo ? ' ' + tipo : '');
}

const isoParaBr = (iso) => (iso ? iso.split('-').reverse().join('-') : '');
const brParaIso = (br) => (br ? br.split('-').reverse().join('-') : '');
const brParaData = (br) => { const [d, m, a] = String(br).split('-'); return new Date(+a, +m - 1, +d); };

function preencher(sel, itens, primeira, semOrdenar) {
  const el = typeof sel === 'string' ? $(sel) : sel;
  const lista = semOrdenar ? itens : ordenar(itens);
  el.innerHTML = `<option value="">${primeira}</option>` +
    lista.map((i) => `<option value="${esc(i)}">${esc(i)}</option>`).join('');
}

/* ------------------------------------------------------------------- API -- */
async function apiGet(acao) {
  const r = await fetch(`${API}?acao=${acao}&t=${Date.now()}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.erro);
  return j.data;
}

async function apiPost(acao, dados) {
  const chave = $('#chaveSessao').value.trim();
  if (!chave) throw new Error('Informe a chave de acesso no topo da tela.');
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ acao, chave, dados })
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.erro);
  return j.data;
}

/* ------------------------------------------------------------ inicializar -- */
async function iniciar() {
  $('#tituloApp').textContent = window.APP_TITULO;
  $('#subtituloApp').textContent = window.APP_SUBTITULO;
  $('#chaveSessao').value = sessionStorage.getItem('pa_chave') || '';
  $('#chaveSessao').addEventListener('input', (e) => sessionStorage.setItem('pa_chave', e.target.value));

  const hoje = new Date().toISOString().slice(0, 10);
  $('#fData').value = hoje;
  mostrarDataBr();

  try {
    const b = await apiGet('bootstrap');
    estado.tax = b.taxonomia;
    estado.orgaos = b.orgaos;
    estado.par = b.parametros;

    preencher('#servidorSessao', b.parametros.SERVIDOR, 'Selecione…');
    preencher('#fForma', b.parametros.FORMA_RECEBIMENTO, 'Selecione…');
    preencher('#fDesfecho', b.parametros.DESFECHO, 'Selecione…');
    preencher('#fOrgao', b.orgaos, 'Selecione…');
    preencher('#cOrgao', b.orgaos, 'Todos');
    preencher('#pOrgao', b.orgaos, 'Todos');
    preencher('#cServidor', b.parametros.SERVIDOR, 'Todos');
    preencher('#cForma', b.parametros.FORMA_RECEBIMENTO, 'Todas');
    $('#listaOrgaos').innerHTML = b.orgaos.map((o) => `<option value="${esc(o)}">`).join('');

    const s = localStorage.getItem('pa_servidor');
    if (s) $('#servidorSessao').value = s;

    // Abertura leve: só os últimos registros. A base inteira é buscada
    // sob demanda, ao entrar em Consultar ou Painel.
    const ult = await apiGet('ultimos&n=15');
    desenharUltimos(ult);
    $('#rodapeInfo').textContent = 'Pronto. Abra Consultar ou Painel para carregar a base completa.';
  } catch (err) {
    toast('Falha ao conectar na base: ' + err.message, true);
  }
}

// Busca a base completa uma única vez e guarda em cache.
async function garantirBase() {
  if (estado.baseCarregada) return;
  $('#rodapeInfo').textContent = 'Carregando base completa…';
  estado.dados = await apiGet('listar');
  estado.filtrados = estado.dados.slice();
  estado.baseCarregada = true;
  prepararPainel();
  $('#rodapeInfo').textContent = `${estado.dados.length} registros na base · atualizado em ${new Date().toLocaleString('pt-BR')}`;
}

async function carregarDados() {
  // Após gravar/editar/excluir: atualiza os últimos e marca a base para recarregar.
  const ult = await apiGet('ultimos&n=15');
  desenharUltimos(ult);
  estado.baseCarregada = false;
  if ($('#consultar').classList.contains('ativa') || $('#painel').classList.contains('ativa')) {
    await garantirBase();
    aplicarFiltros();
  }
}

/* ------------------------------------------------------------- cascata --- */
function mostrarDataBr() {
  $('#fDataTexto').textContent = $('#fData').value ? 'Será gravada como ' + isoParaBr($('#fData').value) : '';
}

function cascata() {
  const org = $('#fOrgao').value;
  const lista = estado.tax[org] || [];
  const a1 = $('#fAssunto');
  if (!org) {
    a1.disabled = true;
    a1.innerHTML = '<option value="">Escolha o órgão primeiro</option>';
    return;
  }
  a1.disabled = false;
  preencher(a1, lista, 'Selecione…');
}

/* ------------------------------------------------------------- registrar -- */
async function salvar() {
  const servidor = $('#servidorSessao').value;
  if (!servidor) return status('#statusReg', 'Selecione o servidor no topo da tela.', 'erro');

  const d = {
    DATA: isoParaBr($('#fData').value),
    SERVIDOR: servidor,
    FORMA_RECEBIMENTO: $('#fForma').value,
    ORGAO: $('#fOrgao').value,
    ASSUNTO: $('#fAssunto').value,
    DESFECHO: $('#fDesfecho').value,
    OBSERVACAO: $('#fObs').value.trim()
  };
  const faltando = ['DATA', 'FORMA_RECEBIMENTO', 'ORGAO', 'ASSUNTO', 'DESFECHO'].filter((c) => !d[c]);
  if (faltando.length) return status('#statusReg', 'Preencha os campos obrigatórios.', 'erro');

  $('#btnSalvar').disabled = true;
  status('#statusReg', 'Gravando…');
  try {
    localStorage.setItem('pa_servidor', servidor);
    if (estado.editando) {
      d.ID = estado.editando;
      await apiPost('atualizar', d);
      toast('Atendimento atualizado.');
      estado.editando = null;
      $('#btnSalvar').textContent = 'Salvar atendimento';
    } else {
      const r = await apiPost('criar', d);
      toast('Atendimento ' + r.ID + ' registrado.');
    }
    limpar(true);
    await carregarDados();
    status('#statusReg', '');
  } catch (err) {
    status('#statusReg', err.message, 'erro');
    toast(err.message, true);
  } finally {
    $('#btnSalvar').disabled = false;
  }
}

function limpar(mantemData) {
  if (!mantemData) $('#fData').value = new Date().toISOString().slice(0, 10);
  $('#fForma').value = '';
  $('#fOrgao').value = '';
  $('#fDesfecho').value = '';
  $('#fObs').value = '';
  cascata();
  mostrarDataBr();
  estado.editando = null;
  $('#btnSalvar').textContent = 'Salvar atendimento';
  status('#statusReg', '');
}

function desenharUltimos(lista) {
  const ult = (lista || estado.dados).slice(-8).reverse();
  $('#ultimos').innerHTML = ult.length
    ? ult.map((r) => `<div class="item"><span><b>${esc(r.DATA)}</b> · ${esc(r.ORGAO)} — ${esc(r.ASSUNTO)}</span>
        <span class="tag">${esc(r.SERVIDOR)}</span></div>`).join('')
    : '<div class="vazio">Nenhum atendimento registrado ainda.</div>';
}

/* ------------------------------------------------------------- consultar -- */
function aplicarFiltros() {
  const de = $('#cDe').value ? brParaData(isoParaBr($('#cDe').value)) : null;
  const ate = $('#cAte').value ? brParaData(isoParaBr($('#cAte').value)) : null;
  const org = $('#cOrgao').value, srv = $('#cServidor').value, frm = $('#cForma').value;
  const txt = $('#cTexto').value.trim().toLowerCase();

  estado.filtrados = estado.dados.filter((r) => {
    const dt = brParaData(r.DATA);
    if (de && dt < de) return false;
    if (ate && dt > ate) return false;
    if (org && r.ORGAO !== org) return false;
    if (srv && r.SERVIDOR !== srv) return false;
    if (frm && r.FORMA_RECEBIMENTO !== frm) return false;
    if (txt && !Object.values(r).join(' ').toLowerCase().includes(txt)) return false;
    return true;
  });

  status('#statusCons', `${estado.filtrados.length} atendimentos`);

  const tb = $('#tabela tbody');
  tb.innerHTML = estado.filtrados.length
    ? estado.filtrados.slice().reverse().map((r) => `<tr>
        <td>${esc(r.ID)}</td><td>${esc(r.DATA)}</td><td>${esc(r.SERVIDOR)}</td>
        <td>${esc(r.FORMA_RECEBIMENTO)}</td><td>${esc(r.ORGAO)}</td><td>${esc(r.ASSUNTO)}</td>
        <td>${esc(r.DESFECHO)}</td><td>${esc(r.OBSERVACAO)}</td>
        <td style="white-space:nowrap">
          <button class="btn neutro mini" data-edit="${esc(r.ID)}">Editar</button>
          <button class="btn perigo mini" data-del="${esc(r.ID)}">Excluir</button>
        </td></tr>`).join('')
    : '<tr><td colspan="11" class="vazio">Nenhum registro com esses filtros.</td></tr>';
}

function editar(id) {
  const r = estado.dados.find((x) => x.ID === id);
  if (!r) return;
  irPara('registrar');
  $('#fData').value = brParaIso(r.DATA);
  $('#servidorSessao').value = r.SERVIDOR;
  $('#fForma').value = r.FORMA_RECEBIMENTO;
  $('#fOrgao').value = r.ORGAO;
  cascata();
  $('#fAssunto').value = r.ASSUNTO;
  $('#fDesfecho').value = r.DESFECHO;
  $('#fObs').value = r.OBSERVACAO || '';
  mostrarDataBr();
  estado.editando = id;
  $('#btnSalvar').textContent = 'Atualizar ' + id;
  status('#statusReg', 'Editando o registro ' + id + '. Salvar sobrescreve os dados originais.');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function excluir(id) {
  if (!confirm('Excluir definitivamente o registro ' + id + '? A exclusão fica registrada no LOG.')) return;
  try {
    await apiPost('excluir', { ID: id, USUARIO: $('#servidorSessao').value });
    toast('Registro ' + id + ' excluído.');
    await carregarDados();
  } catch (err) {
    toast(err.message, true);
  }
}

function baixarCsv() {
  const cols = ['ID', 'DATA', 'MES', 'ANO', 'SERVIDOR', 'FORMA_RECEBIMENTO', 'ORGAO', 'ASSUNTO', 'DESFECHO', 'OBSERVACAO'];
  const linhas = [cols.join(';')].concat(
    estado.filtrados.map((r) => cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(';'))
  );
  const blob = new Blob(['\uFEFF' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pronto_atendimento_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

/* ---------------------------------------------------------------- painel -- */
function prepararPainel() {
  const anos = [...new Set(estado.dados.map((r) => r.ANO))].filter(Boolean).sort();
  preencher('#pAno', anos, 'Todos');
  preencher('#pMes', MESES.slice(1).map((m, i) => `${i + 1} - ${m}`), 'Todos', true);
  desenharPainel();
}

function dadosPainel() {
  const ano = $('#pAno').value, mes = $('#pMes').value.split(' - ')[0], org = $('#pOrgao').value;
  return estado.dados.filter((r) =>
    (!ano || String(r.ANO) === ano) &&
    (!mes || String(r.MES) === mes) &&
    (!org || r.ORGAO === org));
}

function agrupar(rows, campo) {
  const m = {};
  rows.forEach((r) => {
    const k = r[campo];
    if (!k) return;
    m[k] = (m[k] || 0) + 1;
  });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

function grafico(id, tipo, labels, valores, rotulo, horizontal) {
  if (estado.graficos[id]) estado.graficos[id].destroy();
  const ctx = document.getElementById(id);
  const pizza = tipo === 'doughnut';
  estado.graficos[id] = new Chart(ctx, {
    type: tipo,
    data: {
      labels,
      datasets: [{
        label: rotulo,
        data: valores,
        backgroundColor: pizza ? VERDES : (tipo === 'line' ? 'rgba(30,158,98,.18)' : VERDE),
        borderColor: tipo === 'line' ? VERDE : '#fff',
        borderWidth: pizza ? 2 : (tipo === 'line' ? 2 : 0),
        borderRadius: tipo === 'bar' ? 5 : 0,
        fill: tipo === 'line',
        tension: .3
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      indexAxis: horizontal ? 'y' : 'x',
      plugins: {
        legend: { display: pizza, position: 'right', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: { backgroundColor: '#16211C' }
      },
      scales: pizza ? {} : {
        x: { grid: { display: horizontal }, ticks: { font: { size: 11 }, autoSkip: false } },
        y: { grid: { color: '#EEF3F0' }, ticks: { font: { size: 11 }, precision: 0 }, beginAtZero: true }
      }
    }
  });
}

function desenharPainel() {
  const rows = dadosPainel();
  const total = rows.length;
  const dias = new Set(rows.map((r) => r.DATA)).size || 1;

  $('#kAtend').textContent = total.toLocaleString('pt-BR');
  $('#kOrg').textContent = new Set(rows.map((r) => r.ORGAO)).size;
  $('#kAss').textContent = new Set(rows.map((r) => r.ASSUNTO).filter(Boolean)).size;
  $('#kDia').textContent = (total / dias).toFixed(1).replace('.', ',');

  // série mensal (ano-mês)
  const serie = {};
  rows.forEach((r) => {
    const k = `${r.ANO}-${String(r.MES).padStart(2, '0')}`;
    serie[k] = (serie[k] || 0) + 1;
  });
  const chaves = Object.keys(serie).sort();
  grafico('gSerie', 'line', chaves.map((k) => `${MESES[+k.split('-')[1]]}/${k.split('-')[0].slice(2)}`),
    chaves.map((k) => serie[k]), 'Atendimentos');

  const forma = agrupar(rows, 'FORMA_RECEBIMENTO');
  grafico('gForma', 'doughnut', forma.map((x) => x[0]), forma.map((x) => x[1]), 'Atendimentos');

  const org = agrupar(rows, 'ORGAO').slice(0, 12);
  grafico('gOrgao', 'bar', org.map((x) => x[0].split(' - ')[0].slice(0, 28)), org.map((x) => x[1]), 'Atendimentos', true);

  const topAss = agrupar(rows, 'ASSUNTO').slice(0, 12);
  grafico('gAssunto', 'bar', topAss.map((x) => x[0].slice(0, 34)), topAss.map((x) => x[1]), 'Atendimentos', true);

  const desf = agrupar(rows, 'DESFECHO');
  grafico('gDesfecho', 'doughnut', desf.map((x) => x[0]), desf.map((x) => x[1]), 'Atendimentos');

  const srv = agrupar(rows, 'SERVIDOR');
  grafico('gServidor', 'bar', srv.map((x) => x[0].split(' ')[0]), srv.map((x) => x[1]), 'Atendimentos');
}

/* -------------------------------------------------------- administração -- */
async function carregarAdmin() {
  status('#statusAdmin', 'Carregando…');
  try {
    const d = await apiPost('admin_tabelas', {});
    $('#tabTax tbody').innerHTML = d.taxonomia.map((t) => `<tr class="${String(t.ATIVO).toUpperCase() === 'SIM' ? '' : 'inativo'}">
      <td>${esc(t.ORGAO)}</td><td>${esc(t.ASSUNTO)}</td><td>${esc(t.ATIVO)}</td>
      <td><button class="btn neutro mini" data-tax="${esc(t.ORGAO)}||${esc(t.ASSUNTO)}">
        ${String(t.ATIVO).toUpperCase() === 'SIM' ? 'Desativar' : 'Reativar'}</button></td></tr>`).join('');

    $('#tabPar tbody').innerHTML = d.parametros.map((p) => `<tr class="${String(p.ATIVO).toUpperCase() === 'SIM' ? '' : 'inativo'}">
      <td>${esc(p.TIPO)}</td><td>${esc(p.VALOR)}</td><td>${esc(p.ATIVO)}</td>
      <td><button class="btn neutro mini" data-par="${esc(p.TIPO)}||${esc(p.VALOR)}">
        ${String(p.ATIVO).toUpperCase() === 'SIM' ? 'Desativar' : 'Reativar'}</button></td></tr>`).join('');
    status('#statusAdmin', 'Tabelas carregadas.', 'ok');
  } catch (err) {
    status('#statusAdmin', err.message, 'erro');
  }
}

// Recarrega apenas as listas (bootstrap), sem baixar a base de atendimentos.
async function recarregarListas() {
  const b = await apiGet('bootstrap');
  estado.tax = b.taxonomia; estado.orgaos = b.orgaos; estado.par = b.parametros;
  preencher('#servidorSessao', b.parametros.SERVIDOR, 'Selecione…');
  preencher('#fForma', b.parametros.FORMA_RECEBIMENTO, 'Selecione…');
  preencher('#fDesfecho', b.parametros.DESFECHO, 'Selecione…');
  preencher('#fOrgao', b.orgaos, 'Selecione…');
  preencher('#cOrgao', b.orgaos, 'Todos');
  preencher('#pOrgao', b.orgaos, 'Todos');
  preencher('#cServidor', b.parametros.SERVIDOR, 'Todos');
  preencher('#cForma', b.parametros.FORMA_RECEBIMENTO, 'Todas');
  $('#listaOrgaos').innerHTML = b.orgaos.map((o) => `<option value="${esc(o)}">`).join('');
}

/* ----------------------------------------------------------- navegação --- */
async function irPara(alvo) {
  $$('.aba').forEach((b) => b.classList.toggle('ativa', b.dataset.alvo === alvo));
  $$('.tela').forEach((s) => s.classList.toggle('ativa', s.id === alvo));
  if (alvo === 'consultar') { await garantirBase(); aplicarFiltros(); }
  if (alvo === 'painel')    { await garantirBase(); desenharPainel(); }
  if (alvo === 'admin' && !$('#tabTax tbody').children.length) carregarAdmin();
}

/* ------------------------------------------------------------- eventos --- */
$$('.aba').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.alvo)));
$('#fOrgao').addEventListener('change', cascata);
$('#fData').addEventListener('change', mostrarDataBr);
$('#btnSalvar').addEventListener('click', salvar);
$('#btnLimpar').addEventListener('click', () => limpar(false));
$('#btnFiltrar').addEventListener('click', aplicarFiltros);
$('#cTexto').addEventListener('keyup', (e) => e.key === 'Enter' && aplicarFiltros());
$('#btnCsv').addEventListener('click', baixarCsv);
['#pAno', '#pMes', '#pOrgao'].forEach((s) => $(s).addEventListener('change', desenharPainel));
$('#btnAdminCarregar').addEventListener('click', carregarAdmin);

$('#tabela').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.edit) editar(b.dataset.edit);
  if (b.dataset.del) excluir(b.dataset.del);
});

$('#btnTaxAdd').addEventListener('click', async () => {
  const ORGAO = $('#aOrgao').value.trim(), ASSUNTO = $('#aAssunto').value.trim();
  if (!ORGAO || !ASSUNTO) return status('#statusAdmin', 'Informe órgão e assunto.', 'erro');
  try {
    await apiPost('tax_incluir', { ORGAO, ASSUNTO, USUARIO: $('#servidorSessao').value });
    $('#aAssunto').value = '';
    toast('Assunto incluído.');
    await carregarAdmin();
    await recarregarListas();
  } catch (err) { status('#statusAdmin', err.message, 'erro'); }
});

$('#btnParAdd').addEventListener('click', async () => {
  const TIPO = $('#aTipo').value, VALOR = $('#aValor').value.trim();
  if (!VALOR) return status('#statusAdmin', 'Informe o valor.', 'erro');
  try {
    await apiPost('par_incluir', { TIPO, VALOR, USUARIO: $('#servidorSessao').value });
    $('#aValor').value = '';
    toast('Valor incluído.');
    await carregarAdmin();
    await recarregarListas();
  } catch (err) { status('#statusAdmin', err.message, 'erro'); }
});

$('#tabTax').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-tax]');
  if (!b) return;
  const [ORGAO, ASSUNTO] = b.dataset.tax.split('||');
  try {
    await apiPost('tax_alternar', { ORGAO, ASSUNTO, USUARIO: $('#servidorSessao').value });
    await carregarAdmin();
    await recarregarListas();
  } catch (err) { toast(err.message, true); }
});

$('#tabPar').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-par]');
  if (!b) return;
  const [TIPO, VALOR] = b.dataset.par.split('||');
  try {
    await apiPost('par_alternar', { TIPO, VALOR, USUARIO: $('#servidorSessao').value });
    await carregarAdmin();
    await recarregarListas();
  } catch (err) { toast(err.message, true); }
});

iniciar();
