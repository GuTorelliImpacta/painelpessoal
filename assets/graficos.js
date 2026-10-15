/* Configuração dos gráficos (Chart.js 4). Cada gráfico é criado uma vez e atualizado com update(). */
(function () {
  'use strict';
  const M = window.Metricas, F = M.fmt;
  const charts = {};
  let onCategoria = () => {};
  let ok = false;

  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const alpha = (hex, a) => {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  };
  const reduzMovimento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cores = () => ({
    texto: css('--texto'), muted: css('--muted'), grade: css('--grade'), accent: css('--accent'),
    pos: css('--pos'), neg: css('--neg'), alerta: css('--alerta'), surface: css('--surface'),
  });

  function escalaY(c, extra = {}) {
    return {
      grid: { color: c.grade }, border: { display: false },
      ticks: { color: c.muted, callback: (v) => F.abrev(v), maxTicksLimit: 6 }, ...extra,
    };
  }
  function escalaX(c, extra = {}) {
    return { grid: { display: false }, border: { color: c.grade }, ticks: { color: c.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 }, ...extra };
  }
  const tooltipBase = (c) => ({
    backgroundColor: c.surface, titleColor: c.texto, bodyColor: c.texto, borderColor: c.grade, borderWidth: 1,
    padding: 10, boxPadding: 4,
  });
  const legenda = (c) => ({ position: 'bottom', labels: { color: c.muted, boxWidth: 12, boxHeight: 12, usePointStyle: true } });

  // Escreve "R$ valor · %" ao fim de cada barra horizontal.
  const rotulosBarra = {
    id: 'rotulosBarra',
    afterDatasetsDraw(chart, _a, opts) {
      if (!opts || !opts.textos) return;
      const { ctx } = chart, meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.font = `500 11px ${css('--fonte')}`;
      ctx.fillStyle = opts.cor; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      meta.data.forEach((bar, i) => { if (opts.textos[i]) ctx.fillText(opts.textos[i], bar.x + 6, bar.y); });
      ctx.restore();
    },
  };

  function criar(id, config) {
    const el = document.getElementById(id);
    charts[id] = new Chart(el, config);
    return charts[id];
  }

  function init(callbackCategoria) {
    if (typeof Chart === 'undefined') return false;
    onCategoria = callbackCategoria || onCategoria;
    Chart.defaults.font.family = css('--fonte');
    Chart.defaults.font.size = 12;
    Chart.defaults.responsive = true;
    Chart.defaults.maintainAspectRatio = false;
    if (reduzMovimento()) Chart.defaults.animation = false;
    else Chart.defaults.animation.duration = 350;
    const base = { interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false } } };

    criar('g-saldo', { type: 'line', data: { labels: [], datasets: [{ label: 'Saldo', data: [], fill: true, tension: 0.35, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 }] }, options: { ...base, scales: { x: escalaX({}), y: escalaY({}) } } });
    criar('g-mensal', { data: { labels: [], datasets: [{ type: 'bar', label: 'Entradas', data: [], borderRadius: 4 }, { type: 'bar', label: 'Saídas', data: [], borderRadius: 4 }, { type: 'line', label: 'Resultado', data: [], tension: 0.3, borderWidth: 2, pointRadius: 3 }] }, options: { ...base, scales: { x: escalaX({}), y: escalaY({}) } } });
    criar('g-ritmo', { type: 'line', data: { labels: [], datasets: [{ label: 'Este mês', data: [] }, { label: 'Mês anterior', data: [] }, { label: 'Média dos 3 meses', data: [] }] }, options: { ...base, scales: { x: escalaX({}), y: escalaY({}) } } });
    criar('g-cat', { type: 'bar', data: { labels: [], datasets: [{ data: [], borderRadius: 4, barThickness: 22 }] }, plugins: [rotulosBarra], options: { ...base, indexAxis: 'y', layout: { padding: { right: 120 } }, scales: { x: escalaY({}), y: escalaX({ ticks: {} }) }, onClick: (_e, els) => { if (els.length) onCategoria(charts['g-cat'].$nomes[els[0].index]); } } });
    criar('g-var', { type: 'bar', data: { labels: [], datasets: [{ data: [], borderRadius: 4, barThickness: 20 }] }, options: { ...base, indexAxis: 'y', scales: { x: escalaY({}), y: escalaX({ ticks: {} }) } } });
    criar('g-sem', { type: 'bar', data: { labels: [], datasets: [{ label: 'Média', data: [], borderRadius: 6 }] }, options: { ...base, scales: { x: escalaX({}), y: escalaY({}) } } });

    document.getElementById('g-cat').style.cursor = 'pointer';
    ok = true;
    return true;
  }

  // Aplica cores atuais do tema (lidas das variáveis CSS) em escalas/legendas/tooltips.
  function tema(chart, c, opts = {}) {
    const o = chart.options;
    const sx = o.scales.x, sy = o.scales.y;
    const horizontal = o.indexAxis === 'y';
    const num = horizontal ? sx : sy, cat = horizontal ? sy : sx;
    num.grid.color = c.grade; num.ticks.color = c.muted; num.ticks.callback = (v) => F.abrev(v);
    cat.ticks.color = c.muted; cat.border = { color: c.grade, display: true };
    if (horizontal) { cat.ticks.autoSkip = false; cat.ticks.maxTicksLimit = undefined; }
    o.plugins.tooltip = { ...tooltipBase(c), ...(opts.tooltip || {}) };
    o.plugins.legend = opts.legenda ? legenda(c) : { display: false };
  }

  function resumo(id, texto) { document.getElementById(id).setAttribute('aria-label', texto); }

  function atualizar(p) {
    if (!ok) return;
    const c = cores();
    const brl = (ctx) => `${ctx.dataset.label ? ctx.dataset.label + ': ' : ''}${F.brl(ctx.parsed.y !== undefined && ctx.chart.options.indexAxis !== 'y' ? ctx.parsed.y : ctx.parsed.x)}`;

    // 1. Evolução do saldo
    {
      const ch = charts['g-saldo'], pts = p.saldoDiario;
      ch.data.labels = pts.map((x) => F.data(x.data));
      const ds = ch.data.datasets[0];
      ds.data = pts.map((x) => x.saldo);
      ds.borderColor = c.accent; ds.backgroundColor = alpha(c.accent, 0.16);
      ds.pointRadius = pts.length <= 32 ? 2.5 : 0; ds.pointBackgroundColor = c.accent;
      tema(ch, c, { tooltip: { callbacks: { label: (x) => `Saldo: ${F.brl(x.parsed.y)}` } } });
      const ini = pts[0], fim = pts[pts.length - 1];
      resumo('g-saldo', pts.length ? `Evolução do saldo: de ${F.brl(ini.saldo)} para ${F.brl(fim.saldo)} entre ${F.data(pts[1] ? pts[1].data : ini.data)} e ${F.data(fim.data)}.` : 'Sem dados de saldo no período.');
      ch.update();
    }
    // 2. Entradas × saídas por mês
    {
      const ch = charts['g-mensal'], m = p.mensal;
      ch.data.labels = m.map((x) => F.mes(x.mes));
      const [e, s, r] = ch.data.datasets;
      e.data = m.map((x) => x.entradas); e.backgroundColor = c.pos;
      s.data = m.map((x) => x.saidas); s.backgroundColor = c.neg;
      r.data = m.map((x) => Math.round((x.entradas - x.saidas) * 100) / 100);
      r.borderColor = c.accent; r.backgroundColor = c.accent; r.pointBackgroundColor = c.accent;
      tema(ch, c, { legenda: true, tooltip: { callbacks: { label: brl } } });
      const tot = m.reduce((a, x) => ({ e: a.e + x.entradas, s: a.s + x.saidas }), { e: 0, s: 0 });
      resumo('g-mensal', `Entradas e saídas dos últimos 12 meses: ${F.brl(tot.e)} de entradas e ${F.brl(tot.s)} de saídas no total.`);
      ch.update();
    }
    // 4. Ritmo do mês
    {
      const ch = charts['g-ritmo'], r = p.ritmo;
      ch.data.labels = Array.from({ length: r.dias }, (_, i) => String(i + 1));
      const [a, b, m] = ch.data.datasets;
      Object.assign(a, { data: r.atual, borderColor: c.accent, backgroundColor: c.accent, borderWidth: 3, pointRadius: 0, tension: 0.2 });
      Object.assign(b, { data: r.anterior || [], borderColor: c.neg, backgroundColor: c.neg, borderWidth: 2, pointRadius: 0, tension: 0.2, borderDash: [6, 4] });
      Object.assign(m, { data: r.media3 || [], borderColor: c.muted, backgroundColor: c.muted, borderWidth: 2, pointRadius: 0, tension: 0.2, borderDash: [2, 3] });
      tema(ch, c, { legenda: true, tooltip: { callbacks: { title: (it) => `Dia ${it[0].label}`, label: brl } } });
      ch.options.scales.x.ticks.maxTicksLimit = 8;
      const dia = r.atual.filter((v) => v !== null).length;
      const aq = dia ? r.atual[dia - 1] : 0, ap = r.anterior ? r.anterior[dia - 1] : null, mm = r.media3 ? r.media3[dia - 1] : null;
      resumo('g-ritmo', `No dia ${dia}, você acumulou ${F.brl(aq)} em saídas` + (ap !== null ? `, contra ${F.brl(ap)} no mês anterior` : '') + (mm !== null ? ` e ${F.brl(mm)} na média dos 3 meses anteriores.` : '.'));
      ch.update();
    }
    // 3. Gastos por categoria
    {
      const ch = charts['g-cat'], MAX = 12;
      let cats = p.cats.slice(0, MAX);
      const resto = p.cats.slice(MAX);
      const nomes = cats.map((x) => x.categoria);
      const dados = cats.map((x) => x.total);
      const textos = cats.map((x) => `${F.brl(x.total)} · ${F.pct(x.pct)}`);
      if (resto.length) {
        const t = resto.reduce((a, x) => a + x.total, 0), pc = resto.reduce((a, x) => a + x.pct, 0);
        nomes.push(`Outras (${resto.length})`); dados.push(Math.round(t * 100) / 100); textos.push(`${F.brl(t)} · ${F.pct(pc)}`);
      }
      ch.$nomes = nomes.map((n, i) => (resto.length && i === nomes.length - 1 ? null : n));
      ch.data.labels = nomes;
      ch.data.datasets[0].data = dados;
      ch.data.datasets[0].backgroundColor = nomes.map((_, i) => (resto.length && i === nomes.length - 1 ? c.muted : c.neg));
      tema(ch, c, { tooltip: { callbacks: { label: (x) => textos[x.dataIndex] } } });
      ch.options.plugins.rotulosBarra = { textos, cor: c.texto };
      ch.options.layout.padding.right = Math.ceil(Math.max(...textos.map((t) => t.length), 0) * 6.4) + 10;
      document.getElementById('cat-wrap').style.height = `${Math.max(150, 30 + nomes.length * 34)}px`;
      resumo('g-cat', p.cats.length ? `Gastos por categoria: ${p.cats.slice(0, 3).map((x) => `${x.categoria} ${F.brl(x.total)} (${F.pct(x.pct)})`).join('; ')}.` : 'Sem saídas no período.');
      ch.update();
    }
    // 5. Variação por categoria
    {
      const ch = charts['g-var'];
      const v = p.varCats.filter((x) => x.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 10).sort((a, b) => b.delta - a.delta);
      ch.data.labels = v.map((x) => x.categoria);
      ch.data.datasets[0].data = v.map((x) => x.delta);
      ch.data.datasets[0].backgroundColor = v.map((x) => (x.delta > 0 ? c.neg : c.pos));
      tema(ch, c, { tooltip: { callbacks: { label: (x) => { const i = v[x.dataIndex]; return `${F.brlAssinado(i.delta)}${i.pct !== null ? ` (${F.pct(i.pct)})` : ' (nova)'} · antes ${F.brl(i.anterior)}`; } } } });
      document.getElementById('var-wrap').style.height = `${Math.max(150, 30 + v.length * 32)}px`;
      resumo('g-var', v.length ? `Variação vs. período anterior: ${v.slice(0, 3).map((x) => `${x.categoria} ${F.brlAssinado(x.delta)}`).join('; ')}.` : 'Sem variação por categoria para comparar.');
      ch.update();
    }
    // 7. Dia da semana
    {
      const ch = charts['g-sem'], s = p.semana;
      ch.data.labels = s.map((x) => x.curto);
      ch.data.datasets[0].data = s.map((x) => x.media);
      ch.data.datasets[0].backgroundColor = c.accent;
      tema(ch, c, { tooltip: { callbacks: { title: (it) => s[it[0].dataIndex].nome, label: (x) => [`Média: ${F.brl(x.parsed.y)}`, `Total: ${F.brl(s[x.dataIndex].total)} em ${s[x.dataIndex].n} saída(s)`] } } });
      const top = [...s].sort((a, b) => b.media - a.media)[0];
      resumo('g-sem', top && top.media > 0 ? `Gasto médio por dia da semana. Maior média: ${top.nome}, ${F.brl(top.media)}.` : 'Sem saídas no período.');
      ch.update();
    }
  }

  window.Graficos = { init, atualizar, disponivel: () => ok };
})();
