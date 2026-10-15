/* Estado, filtros e renderização do painel. Os cálculos ficam em metricas.js. */
(function () {
  'use strict';
  const M = window.Metricas, F = M.fmt, G = window.Graficos, Demo = window.Demo;
  const $ = (id) => document.getElementById(id);
  const DEMO = new URLSearchParams(location.search).get('demo') === '1';
  const POR_PAGINA = 25;
  const MODOS = ['mes', '3m', '6m', '12m', 'ano', 'tudo', 'custom'];

  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } },
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduzMovimento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  let hoje = M.hojeSP();
  const est = {
    modo: 'mes', mesRef: hoje.slice(0, 7), custom: { inicio: '', fim: '' },
    cache: new Map(), seq: 0, dados: null, painel: null, atualizadoEm: null,
    busca: '', tipo: '', cat: '', ordem: { col: 'data', dir: 'desc' }, pagina: 1,
    primeiraRender: true, appVisivel: false, calSel: -1,
  };

  /* ---------- filtro de período ---------- */
  function restaurarFiltro() {
    try {
      const f = JSON.parse(LS.get('painel.filtro') || 'null');
      if (!f || !MODOS.includes(f.modo)) return;
      est.modo = f.modo;
      if (/^\d{4}-\d{2}$/.test(f.mesRef || '') && M.validarISO(f.mesRef + '-01')) est.mesRef = f.mesRef;
      if (f.custom && M.validarPeriodo(f.custom.inicio, f.custom.fim)) est.custom = f.custom;
    } catch (e) { /* ignora filtro salvo inválido */ }
  }
  const salvarFiltro = () => LS.set('painel.filtro', JSON.stringify({ modo: est.modo, mesRef: est.mesRef, custom: est.custom }));

  function periodoAtual() {
    const p = M.resolverPeriodo(est.modo, hoje, { mesRef: est.mesRef, inicio: est.custom.inicio, fim: est.custom.fim });
    return M.validarPeriodo(p.inicio, p.fim) ? p : null;
  }

  function valorSelect() {
    if (est.modo !== 'mes') return est.modo;
    if (est.mesRef === hoje.slice(0, 7)) return 'este_mes';
    if (est.mesRef === M.addMonths(M.primeiroDiaMes(hoje), -1).slice(0, 7)) return 'mes_passado';
    return 'mes_x';
  }

  function sincronizarFiltro() {
    const sel = $('periodo'), v = valorSelect();
    const x = sel.querySelector('option[value="mes_x"]');
    x.hidden = x.disabled = v !== 'mes_x';
    if (v === 'mes_x') x.textContent = 'Mês: ' + F.mes(est.mesRef);
    sel.value = v;
    $('mes-ant').disabled = est.modo !== 'mes';
    $('mes-prox').disabled = est.modo !== 'mes' || est.mesRef >= hoje.slice(0, 7);
    $('custom').hidden = est.modo !== 'custom';
    $('ini').value = est.custom.inicio; $('fim').value = est.custom.fim;
  }

  function mudarPeriodo(valor) {
    if (valor === 'este_mes') { est.modo = 'mes'; est.mesRef = hoje.slice(0, 7); }
    else if (valor === 'mes_passado') { est.modo = 'mes'; est.mesRef = M.addMonths(M.primeiroDiaMes(hoje), -1).slice(0, 7); }
    else if (MODOS.includes(valor)) {
      est.modo = valor;
      if (valor === 'custom' && !est.custom.inicio) est.custom = { inicio: M.primeiroDiaMes(hoje), fim: hoje };
    }
    est.pagina = 1; est.cat = ''; salvarFiltro(); sincronizarFiltro(); carregar();
  }

  /* ---------- dados ---------- */
  let demoTodas = null;
  function demoApi(p) {
    if (!demoTodas) demoTodas = Demo.gerarDemo(hoje);
    return Demo.respostaDemo(p.inicio, p.fim, hoje, demoTodas);
  }

  async function buscar(p) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 25000);
    try {
      const r = await fetch(`/api/dados?inicio=${p.inicio}&fim=${p.fim}`, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: ctl.signal });
      if (r.status === 401) { const e = new Error('Sessão expirada'); e.status = 401; throw e; }
      if (!r.ok) { const e = new Error('Erro ' + r.status); e.status = r.status; throw e; }
      return await r.json();
    } finally { clearTimeout(to); }
  }

  async function carregar(forcar) {
    hoje = M.hojeSP();
    const p = periodoAtual();
    if (!p) { $('periodo-info').textContent = 'Escolha as datas inicial e final.'; return; }
    if (forcar) est.cache.clear();
    const seq = ++est.seq, chave = p.inicio + '|' + p.fim;
    let ent = est.cache.get(chave);
    if (!ent) {
      mostrarCarregando();
      try {
        const d = DEMO ? demoApi(p) : await buscar(p);
        ent = { d, ts: Date.now() };
        est.cache.set(chave, ent);
      } catch (e) {
        if (seq !== est.seq) return;
        if (e.status === 401) return mostrarLogin();
        return mostrarErro(e);
      }
    }
    if (seq !== est.seq) return;
    est.dados = ent.d; est.atualizadoEm = ent.ts;
    mostrarApp();
    renderizar();
  }

  /* ---------- telas ---------- */
  function mostrarApp() {
    $('login').hidden = true; $('app').hidden = false; est.appVisivel = true;
    sincronizarFiltro();
  }
  function mostrarLogin() {
    $('app').hidden = true; $('login').hidden = false; est.appVisivel = false;
    est.cache.clear(); $('principal').classList.remove('carregando');
    setTimeout(() => $('senha').focus(), 0);
  }
  function mostrarCarregando() {
    if (!est.appVisivel) return;
    $('erro').hidden = true;
    if (!$('conteudo').hidden || !$('vazio').hidden) $('principal').classList.add('carregando');
    else $('skeleton').hidden = false;
  }
  function mostrarErro(e) {
    mostrarApp();
    $('skeleton').hidden = true; $('principal').classList.remove('carregando');
    $('conteudo').hidden = true; $('vazio').hidden = true; $('erro').hidden = false;
    $('erro-texto').textContent = e && e.name === 'AbortError'
      ? 'A consulta demorou demais. Tente novamente.'
      : 'Verifique sua conexão e tente novamente.';
  }

  /* ---------- renderização ---------- */
  const rafs = new Map();
  function setNum(id, alvo, fmtFn, animar) {
    const el = $(id);
    if (rafs.has(id)) cancelAnimationFrame(rafs.get(id));
    if (!animar || reduzMovimento() || alvo === 0) { el.textContent = fmtFn(alvo); return; }
    const t0 = performance.now(), dur = 700;
    const passo = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmtFn(alvo * e);
      if (k < 1) rafs.set(id, requestAnimationFrame(passo)); else { el.textContent = fmtFn(alvo); rafs.delete(id); }
    };
    rafs.set(id, requestAnimationFrame(passo));
  }
  const cor = (el, cls) => { el.classList.remove('pos', 'neg', 'alerta'); if (cls) el.classList.add(cls); };
  const casasPct = (f) => (Math.abs(f) < 0.1 ? 1 : 0);

  function varHtml(frac, bomSe, rotulo) {
    if (frac === null) return '<span class="muted">sem base de comparação</span>';
    if (Math.abs(frac) < 0.0005) return `<span class="muted">→ igual <span>vs ${esc(rotulo)}</span></span>`;
    const sobe = frac > 0, bom = bomSe === 'subir' ? sobe : !sobe;
    return `<span class="${bom ? 'pos' : 'neg'}">${sobe ? '▲' : '▼'} ${F.pctAbs(frac, casasPct(frac))}</span> <span class="muted">vs ${esc(rotulo)}</span>`;
  }

  const FAIXAS = {
    critico: ['neg', '✕ Crítico', 'Gastando mais do que recebe'],
    atencao: ['alerta', '! Atenção', 'Saudável a partir de 10%'],
    saudavel: ['pos', '✓ Saudável', 'Entre 10% e 20%'],
    excelente: ['pos', '★ Excelente', 'Acima de 20%'],
  };

  function renderKPIs(c, d) {
    const a = est.primeiraRender;
    const rot = d.transacoes_anterior.length || c.ta.n ? `${F.data(d.anterior.inicio)}–${F.data(d.anterior.fim)}` : '';
    $('kpi-saldo').parentElement.classList.toggle('neg', c.saldo < 0);
    setNum('kpi-saldo', c.saldo, F.brl, a);
    setNum('kpi-entradas', c.t.entradas, F.brl, a);
    setNum('kpi-saidas', c.t.saidas, F.brl, a);
    $('kpi-entradas-var').innerHTML = varHtml(c.varEntradas, 'subir', rot);
    $('kpi-saidas-var').innerHTML = varHtml(c.varSaidas, 'descer', rot);

    setNum('kpi-resultado', c.t.resultado, F.brlAssinado, a);
    cor($('kpi-resultado'), c.t.resultado > 0 ? 'pos' : c.t.resultado < 0 ? 'neg' : '');
    $('kpi-resultado-sub').innerHTML = c.t.resultado >= 0 ? '▲ Sobrou no período' : '▼ Faltou no período';
    cor($('kpi-resultado-sub'), c.t.resultado >= 0 ? 'pos' : 'neg');

    const pk = $('kpi-poupanca'), ps = $('kpi-poupanca-sub');
    if (c.taxa === null) { pk.textContent = '—'; cor(pk, ''); ps.innerHTML = '<span class="muted">Sem entradas no período</span>'; }
    else {
      const [cls, rotulo, ref] = FAIXAS[c.faixa];
      setNum('kpi-poupanca', c.taxa, (v) => F.pct(v, 1), a);
      cor(pk, cls);
      ps.innerHTML = `<span class="badge ${cls}">${rotulo}</span> <span class="muted">${ref}</span>`;
    }

    const pj = $('kpi-projecao'), pjs = $('kpi-projecao-sub');
    if (c.projecao) {
      setNum('kpi-projecao', c.projecao.valor, F.brl, a);
      if (c.projecao.media) {
        const dlt = c.projecao.valor / c.projecao.media - 1;
        pjs.innerHTML = Math.abs(dlt) < 0.005 ? '<span class="muted">→ em linha com a média</span>'
          : `<span class="${dlt > 0 ? 'neg' : 'pos'}">${dlt > 0 ? '▲' : '▼'} ${F.pctAbs(dlt, casasPct(dlt))}</span> <span class="muted">vs média de ${F.brl(c.projecao.media)}</span>`;
      } else pjs.innerHTML = '<span class="muted">sem meses fechados para comparar</span>';
    } else { pj.textContent = '—'; pjs.innerHTML = '<span class="muted">Disponível ao ver “Este mês”</span>'; }
  }

  function renderSecundarios(c) {
    const dash = '—';
    $('m-burn').textContent = c.burn === null ? dash : F.brl(c.burn);
    $('m-folego').textContent = c.folego === null ? dash : F.meses(c.folego);
    $('m-folego-sub').innerHTML = c.media3 ? `<span class="valor">${F.brl(c.media3)}</span>/mês em saídas` : 'sem meses fechados';
    $('m-ticket').textContent = c.ticket === null ? dash : F.brl(c.ticket);
    $('m-qtd').textContent = String(c.t.n);
    $('m-maior').textContent = c.maior ? F.brl(c.maior.valor) : dash;
    $('m-maior-sub').innerHTML = c.maior ? `${esc(c.maior.categoria)} · ${F.data(c.maior.data)}` : '';
    $('m-dias').textContent = String(c.diasSem);
    $('m-dias-sub').textContent = c.dias ? `de ${c.dias} dia${c.dias > 1 ? 's' : ''}` : '';
    $('m-top3').textContent = c.cats.length ? F.pct(c.top3) : dash;
    const v = (x, id) => {
      $(id).textContent = x ? x.categoria : dash;
      $(id + '-sub').textContent = x ? `${F.brlAssinado(x.delta)}${x.pct !== null ? ` (${F.pct(x.pct)})` : ' (nova)'}` : 'vs período anterior';
    };
    v(c.maisCresceu, 'm-cresceu'); v(c.maisCaiu, 'm-caiu');
    cor($('m-cresceu'), c.maisCresceu ? 'neg' : ''); cor($('m-caiu'), c.maisCaiu ? 'pos' : '');
  }

  const ICONES = { pos: '✓', neg: '▲', alerta: '!', neutro: 'i' };
  function renderInsights(c) {
    $('insights').innerHTML = c.insights.map((i) =>
      `<li class="${i.tom}"><span class="ic" aria-hidden="true">${ICONES[i.tom]}</span><span class="privavel">${esc(i.texto)}</span></li>`).join('');
  }

  function renderCalendario(c) {
    const dias = c.calendario, box = $('cal'), meses = $('cal-meses');
    est.calSel = -1;
    $('cal-info').textContent = 'Passe o mouse ou toque em um dia.';
    if (!dias.length) { box.innerHTML = ''; meses.innerHTML = ''; box.setAttribute('aria-label', 'Sem dias no período.'); return; }
    const lead = dias[0].dow, cols = Math.ceil((lead + dias.length) / 7);
    let html = '<i class="vazio"></i>'.repeat(lead);
    dias.forEach((d, i) => { html += `<i class="n${d.nivel}" data-i="${i}"></i>`; });
    box.innerHTML = html;
    const rotulos = Array(cols).fill('');
    dias.forEach((d, i) => { if (d.data.endsWith('-01')) rotulos[Math.floor((lead + i) / 7)] = M.MESES[+d.data.slice(5, 7) - 1]; });
    if (!rotulos.slice(0, 3).some(Boolean)) rotulos[0] = M.MESES[+dias[0].data.slice(5, 7) - 1];
    for (const el of [box, meses]) el.style.setProperty('--cols', cols);
    meses.innerHTML = rotulos.map((l) => `<span>${l}</span>`).join('');
    const top = [...dias].sort((a, b) => b.total - a.total)[0];
    const comGasto = dias.filter((d) => d.n > 0).length;
    box.setAttribute('aria-label', `Calendário de gastos: ${comGasto} de ${dias.length} dias com saídas` + (top && top.total > 0 ? `; maior gasto em ${F.dataAno(top.data)}, ${F.brl(top.total)}. Use as setas para percorrer os dias.` : '.'));
  }

  function selecionarDia(i) {
    const dias = est.painel && est.painel.calendario;
    if (!dias || i < 0 || i >= dias.length) return;
    const box = $('cal');
    const ant = box.querySelector('i.sel'); if (ant) ant.classList.remove('sel');
    const el = box.querySelector(`i[data-i="${i}"]`); if (el) el.classList.add('sel');
    est.calSel = i;
    const d = dias[i];
    $('cal-info').textContent = `${M.SEMANA_CURTA[d.dow]}, ${F.dataAno(d.data)} · ` +
      (d.n ? `${F.brl(d.total)} em ${d.n} transaç${d.n > 1 ? 'ões' : 'ão'}` : 'sem gastos');
  }

  /* ---------- tabela ---------- */
  function linhasFiltradas() {
    const q = norm(est.busca.trim());
    let r = est.dados.transacoes.filter((t) =>
      (!est.tipo || t.tipo === est.tipo) && (!est.cat || t.categoria === est.cat) &&
      (!q || norm(t.descricao + ' ' + t.categoria).includes(q)));
    const { col, dir } = est.ordem, k = dir === 'asc' ? 1 : -1;
    const cmp = {
      data: (a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id - b.id),
      valor: (a, b) => a.valor - b.valor,
      tipo: (a, b) => a.tipo.localeCompare(b.tipo),
      categoria: (a, b) => a.categoria.localeCompare(b.categoria, 'pt-BR'),
      descricao: (a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'),
    }[col];
    return r.sort((a, b) => k * cmp(a, b));
  }

  function renderTabela() {
    const todas = linhasFiltradas(), total = todas.length;
    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    est.pagina = Math.min(est.pagina, paginas);
    const fatia = todas.slice((est.pagina - 1) * POR_PAGINA, est.pagina * POR_PAGINA);
    const mesmoAno = est.dados.transacoes.every((t) => t.data.slice(0, 4) === hoje.slice(0, 4));
    const dt = mesmoAno ? F.data : F.dataAno;
    $('tbody').innerHTML = fatia.map((t) => {
      const ent = t.tipo === 'entrada';
      return `<tr><td class="c-data">${dt(t.data)}</td>` +
        `<td class="c-tipo"><span class="tag ${t.tipo}">${ent ? '▲ Entrada' : '▼ Saída'}</span></td>` +
        `<td class="c-cat">${esc(t.categoria)}</td>` +
        `<td class="c-desc">${t.descricao ? esc(t.descricao) : '<span class="muted">—</span>'}</td>` +
        `<td class="c-valor valor num ${ent ? 'pos' : 'neg'}">${ent ? '+' : '−'}${F.brl(t.valor)}</td></tr>`;
    }).join('');
    $('tab-vazia').hidden = total > 0;
    $('pag-info').textContent = total ? `Página ${est.pagina} de ${paginas} · ${total} transaç${total > 1 ? 'ões' : 'ão'}` : '';
    $('pag-ant').disabled = est.pagina <= 1; $('pag-prox').disabled = est.pagina >= paginas;
    $('btn-csv').disabled = total === 0;
    document.querySelectorAll('.tabela th[data-col]').forEach((th) => {
      const ativo = th.dataset.col === est.ordem.col;
      th.setAttribute('aria-sort', ativo ? (est.ordem.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    });
    $('ordenar').value = `${est.ordem.col}:${est.ordem.dir}`;
  }

  function atualizarCategoriasSelect() {
    const sel = $('f-cat'), cats = [...new Set(est.dados.transacoes.map((t) => t.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (est.cat && !cats.includes(est.cat)) est.cat = '';
    sel.innerHTML = '<option value="">Todas as categorias</option>' + cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    sel.value = est.cat;
  }

  function exportarCSV() {
    const linhas = linhasFiltradas();
    const txt = (s) => { s = String(s ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const dataBR = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
    const num = (v) => v.toFixed(2).replace('.', ',');
    const corpo = linhas.map((t) => [dataBR(t.data), t.tipo === 'entrada' ? 'Entrada' : 'Saída', txt(t.categoria), txt(t.descricao), (t.tipo === 'entrada' ? '' : '-') + num(t.valor)].join(';'));
    const csv = '﻿' + ['Data;Tipo;Categoria;Descrição;Valor', ...corpo].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `transacoes_${est.dados.periodo.inicio}_${est.dados.periodo.fim}.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- orquestra ---------- */
  function renderizar() {
    const d = est.dados, c = M.calcularPainel(d);
    est.painel = c;
    $('skeleton').hidden = true; $('erro').hidden = true; $('principal').classList.remove('carregando');

    const comp = d.transacoes_anterior.length ? ` · comparando com ${F.data(d.anterior.inicio)} – ${F.data(d.anterior.fim)}` : '';
    $('periodo-info').textContent = c.dias ? `${F.dataAno(c.inicioEf)} – ${F.dataAno(c.fimEf)}${comp}` : `${F.dataAno(d.periodo.inicio)} – ${F.dataAno(d.periodo.fim)}`;

    const vazio = d.transacoes.length === 0;
    $('conteudo').hidden = false;
    $('conteudo').classList.toggle('so-saldo', vazio);
    $('vazio').hidden = !vazio;
    renderKPIs(c, d);
    if (vazio) {
      $('vazio-periodo').textContent = `${F.dataAno(d.periodo.inicio)} e ${F.dataAno(d.periodo.fim)}`;
    } else {
      renderSecundarios(c); renderInsights(c);
      if (G.disponivel()) G.atualizar(c);
      renderCalendario(c);
      atualizarCategoriasSelect(); renderTabela();
    }
    est.primeiraRender = false;
    atualizarRelogio();
  }

  function atualizarRelogio() {
    if (!est.atualizadoEm) { $('atualizado').textContent = ''; return; }
    const min = Math.floor((Date.now() - est.atualizadoEm) / 60000);
    $('atualizado').textContent = min < 1 ? 'Atualizado agora há pouco' : `Atualizado há ${min} min`;
  }

  /* ---------- tema e privacidade ---------- */
  const temaEfetivo = () => document.documentElement.getAttribute('data-theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  function alternarTema() {
    const novo = temaEfetivo() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', novo); LS.set('painel.tema', novo);
    if (est.painel && G.disponivel()) G.atualizar(est.painel);
  }
  function aplicarPrivacidade(ligado) {
    document.body.classList.toggle('privado', ligado);
    const b = $('btn-privacidade');
    b.setAttribute('aria-pressed', String(ligado));
    b.setAttribute('aria-label', ligado ? 'Mostrar valores' : 'Ocultar valores');
    b.title = b.getAttribute('aria-label'); b.textContent = ligado ? '🙈' : '👁';
    LS.set('painel.privado', ligado ? '1' : '0');
  }

  /* ---------- eventos ---------- */
  function ligarEventos() {
    $('periodo').addEventListener('change', (e) => mudarPeriodo(e.target.value));
    const navegar = (n) => { est.mesRef = M.addMonths(est.mesRef + '-01', n).slice(0, 7); est.pagina = 1; est.cat = ''; salvarFiltro(); sincronizarFiltro(); carregar(); };
    $('mes-ant').addEventListener('click', () => navegar(-1));
    $('mes-prox').addEventListener('click', () => navegar(1));
    const custom = () => {
      const ini = $('ini').value, fim = $('fim').value;
      if (!M.validarPeriodo(ini, fim)) { $('periodo-info').textContent = 'Escolha as datas inicial e final (inicial ≤ final).'; return; }
      est.custom = { inicio: ini, fim }; est.pagina = 1; salvarFiltro(); carregar();
    };
    $('ini').addEventListener('change', custom); $('fim').addEventListener('change', custom);

    $('btn-tema').addEventListener('click', alternarTema);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (est.painel && G.disponivel()) G.atualizar(est.painel); });
    $('btn-privacidade').addEventListener('click', () => aplicarPrivacidade(!document.body.classList.contains('privado')));
    $('btn-atualizar').addEventListener('click', () => carregar(true));
    $('btn-retry').addEventListener('click', () => carregar(true));
    $('btn-csv').addEventListener('click', exportarCSV);
    $('btn-sair').addEventListener('click', async () => {
      try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); } catch (e) { /* segue para o login */ }
      est.dados = null; est.painel = null; mostrarLogin();
    });

    let tBusca;
    $('busca').addEventListener('input', (e) => { clearTimeout(tBusca); tBusca = setTimeout(() => { est.busca = e.target.value; est.pagina = 1; renderTabela(); }, 150); });
    $('f-tipo').addEventListener('change', (e) => { est.tipo = e.target.value; est.pagina = 1; renderTabela(); });
    $('f-cat').addEventListener('change', (e) => { est.cat = e.target.value; est.pagina = 1; renderTabela(); });
    $('ordenar').addEventListener('change', (e) => { const [col, dir] = e.target.value.split(':'); est.ordem = { col, dir }; est.pagina = 1; renderTabela(); });
    document.querySelectorAll('.th-btn').forEach((b) => b.addEventListener('click', () => {
      const col = b.dataset.sort;
      est.ordem = { col, dir: est.ordem.col === col && est.ordem.dir === 'desc' ? 'asc' : (est.ordem.col === col ? 'desc' : (col === 'data' || col === 'valor' ? 'desc' : 'asc')) };
      est.pagina = 1; renderTabela();
    }));
    $('pag-ant').addEventListener('click', () => { est.pagina--; renderTabela(); $('sec-tabela').scrollIntoView({ block: 'start' }); });
    $('pag-prox').addEventListener('click', () => { est.pagina++; renderTabela(); $('sec-tabela').scrollIntoView({ block: 'start' }); });

    // Calendário: mouse, toque (arrastar) e teclado
    const cal = $('cal');
    const diaEm = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.dataset && el.dataset.i !== undefined && cal.contains(el) ? +el.dataset.i : -1; };
    cal.addEventListener('pointerdown', (e) => selecionarDia(diaEm(e.clientX, e.clientY)));
    cal.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') return; const i = diaEm(e.clientX, e.clientY); if (i >= 0 && i !== est.calSel) selecionarDia(i); });
    cal.addEventListener('mouseover', (e) => { const i = e.target.dataset && e.target.dataset.i; if (i !== undefined) selecionarDia(+i); });
    cal.addEventListener('keydown', (e) => {
      const passo = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[e.key];
      if (!passo) return;
      e.preventDefault();
      const n = est.painel.calendario.length;
      selecionarDia(Math.max(0, Math.min(n - 1, (est.calSel < 0 ? (passo > 0 ? -1 : n) : est.calSel) + passo)));
    });

    // Login
    $('form-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('btn-entrar'), erro = $('erro-login');
      erro.hidden = true; btn.disabled = true; btn.textContent = 'Entrando…';
      try {
        const r = await fetch('/api/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senha: $('senha').value }) });
        if (r.ok) { $('senha').value = ''; $('login').hidden = true; carregar(true); }
        else { erro.textContent = r.status === 401 ? 'Senha incorreta.' : 'Não foi possível entrar agora. Tente novamente.'; erro.hidden = false; $('senha').select(); }
      } catch (err) { erro.textContent = 'Sem conexão com o servidor.'; erro.hidden = false; }
      btn.disabled = false; btn.textContent = 'Entrar';
    });

    setInterval(atualizarRelogio, 30000);
  }

  function iniciar() {
    restaurarFiltro();
    ligarEventos();
    aplicarPrivacidade(LS.get('painel.privado') === '1');
    if (DEMO) { $('faixa-demo').hidden = false; $('btn-sair').hidden = true; }
    if (!G.init((nome) => {
      if (!nome) return;
      est.cat = nome; est.tipo = 'saida'; est.pagina = 1;
      $('f-cat').value = nome; $('f-tipo').value = 'saida'; renderTabela();
      $('sec-tabela').scrollIntoView({ behavior: reduzMovimento() ? 'auto' : 'smooth', block: 'start' });
    })) {
      document.querySelectorAll('#graficos canvas').forEach((cv) => { const s = cv.closest('section'); if (s) s.hidden = true; });
      const aviso = document.createElement('p');
      aviso.className = 'card muted'; aviso.setAttribute('role', 'status');
      aviso.textContent = 'Não foi possível carregar a biblioteca de gráficos (Chart.js). Os demais indicadores continuam disponíveis.';
      $('graficos').prepend(aviso);
    }
    sincronizarFiltro();
    carregar();
  }

  iniciar();
})();
