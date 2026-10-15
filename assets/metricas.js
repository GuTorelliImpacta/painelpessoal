/* Cálculos puros do painel (sem DOM, sem rede). Roda no navegador (window.Metricas)
   e no Node (require), para servidor, modo demo e testes usarem o mesmo código.
   Datas são strings ISO 'YYYY-MM-DD' (data local de São Paulo). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Metricas = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  const SEMANA_CURTA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
  const r2 = (n) => Math.round(n * 100) / 100;
  const pad = (n, t = 2) => String(n).padStart(t, '0');

  /* ---------- datas ---------- */
  function parseISO(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  function toISO(dt) { return dt.toISOString().slice(0, 10); }
  function iso(y, m, d) { return `${pad(y, 4)}-${pad(m)}-${pad(d)}`; }
  function diasNoMes(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); } // m: 1-12
  function addDays(s, n) { const d = parseISO(s); d.setUTCDate(d.getUTCDate() + n); return toISO(d); }
  function addMonths(s, n) {
    const [y, m, d] = s.split('-').map(Number);
    const t = y * 12 + (m - 1) + n;
    const ny = Math.floor(t / 12), nm = (t % 12) + 1;
    return iso(ny, nm, Math.min(d, diasNoMes(ny, nm)));
  }
  function primeiroDiaMes(s) { return s.slice(0, 8) + '01'; }
  function ultimoDiaMes(s) { return iso(+s.slice(0, 4), +s.slice(5, 7), diasNoMes(+s.slice(0, 4), +s.slice(5, 7))); }
  function diffDias(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 864e5); }
  function diasInclusivo(a, b) { return diffDias(a, b) + 1; }
  function mesesEntre(a, b) { return (+b.slice(0, 4) * 12 + +b.slice(5, 7)) - (+a.slice(0, 4) * 12 + +a.slice(5, 7)) + 1; }
  function minISO(a, b) { return a < b ? a : b; }
  function maxISO(a, b) { return a > b ? a : b; }
  // 0 = segunda ... 6 = domingo
  function diaSemana(s) { return (parseISO(s).getUTCDay() + 6) % 7; }

  function hojeSP(agora = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
  }

  function validarISO(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toISO(parseISO(s)) === s;
  }
  function validarPeriodo(inicio, fim) {
    return validarISO(inicio) && validarISO(fim) && inicio <= fim &&
      inicio >= '1970-01-01' && fim <= '2100-12-31';
  }

  /* ---------- períodos ---------- */
  // Período anterior equivalente. Períodos de meses fechados (dia 1 até fim de mês) deslocam
  // pelo mesmo número de meses; se ainda em andamento, comparam só até o mesmo dia do mês.
  // Demais períodos: mesma duração, imediatamente antes.
  function periodoAnterior(inicio, fim, hoje) {
    if (inicio.endsWith('-01') && fim === ultimoDiaMes(fim)) {
      const k = mesesEntre(inicio, fim);
      const emAndamento = hoje >= inicio && hoje < fim;
      const f = emAndamento ? addMonths(hoje, -k) : ultimoDiaMes(addMonths(fim, -k));
      return { inicio: addMonths(inicio, -k), fim: f };
    }
    const n = diasInclusivo(inicio, fim);
    return { inicio: addDays(inicio, -n), fim: addDays(inicio, -1) };
  }

  function resolverPeriodo(modo, hoje, opc = {}) {
    const mesHoje = primeiroDiaMes(hoje);
    switch (modo) {
      case 'mes': {
        const base = (opc.mesRef || hoje.slice(0, 7)) + '-01';
        return { inicio: base, fim: ultimoDiaMes(base) };
      }
      case '3m': case '6m': case '12m': {
        const n = parseInt(modo, 10);
        return { inicio: addMonths(mesHoje, -(n - 1)), fim: ultimoDiaMes(hoje) };
      }
      case 'ano': return { inicio: hoje.slice(0, 4) + '-01-01', fim: hoje.slice(0, 4) + '-12-31' };
      case 'tudo': return { inicio: '2000-01-01', fim: hoje };
      case 'custom': return { inicio: opc.inicio, fim: opc.fim };
      default: return resolverPeriodo('mes', hoje, opc);
    }
  }

  /* ---------- agregações ---------- */
  function totais(txs) {
    let e = 0, s = 0, ne = 0, ns = 0;
    for (const t of txs) {
      if (t.tipo === 'entrada') { e += t.valor; ne++; } else { s += t.valor; ns++; }
    }
    e = r2(e); s = r2(s);
    return { entradas: e, saidas: s, resultado: r2(e - s), nEntradas: ne, nSaidas: ns, n: txs.length };
  }

  function variacao(atual, anterior) { return anterior > 0 ? (atual - anterior) / anterior : null; }

  function taxaPoupanca(entradas, saidas) { return entradas > 0 ? (entradas - saidas) / entradas : null; }

  function faixaPoupanca(t) {
    if (t === null || t === undefined) return null;
    if (t < 0) return 'critico';
    if (t < 0.1) return 'atencao';
    if (t <= 0.2) return 'saudavel';
    return 'excelente';
  }

  function projecaoMes(saidasAteHoje, hoje) {
    const dia = +hoje.slice(8, 10);
    const dm = diasNoMes(+hoje.slice(0, 4), +hoje.slice(5, 7));
    return r2((saidasAteHoje / dia) * dm);
  }

  // Média de saídas dos n meses fechados anteriores ao mês de `hoje`, ignorando meses
  // anteriores ao primeiro movimento (não penaliza quem começou a registrar há pouco).
  function mediaSaidasMeses(historico, hoje, n = 3) {
    const primeiro = historico.find((h) => h.entradas > 0 || h.saidas > 0);
    if (!primeiro) return null;
    const alvo = [];
    for (let i = 1; i <= n; i++) {
      const mes = addMonths(primeiroDiaMes(hoje), -i).slice(0, 7);
      if (mes >= primeiro.mes && mes < hoje.slice(0, 7)) {
        const h = historico.find((x) => x.mes === mes);
        alvo.push(h ? h.saidas : 0);
      }
    }
    return alvo.length ? r2(alvo.reduce((a, b) => a + b, 0) / alvo.length) : null;
  }

  function folego(saldo, mediaMensal) {
    return mediaMensal > 0 ? Math.max(0, saldo / mediaMensal) : null;
  }

  function burnRate(saidas, dias) { return dias > 0 ? saidas / dias : null; }
  function ticketMedio(t) { return t.nSaidas ? t.saidas / t.nSaidas : null; }

  function porCategoria(txs, tipo = 'saida') {
    const mapa = new Map();
    let total = 0;
    for (const t of txs) {
      if (t.tipo !== tipo) continue;
      const c = mapa.get(t.categoria) || { categoria: t.categoria, total: 0, n: 0 };
      c.total += t.valor; c.n++; total += t.valor;
      mapa.set(t.categoria, c);
    }
    return [...mapa.values()]
      .map((c) => ({ ...c, total: r2(c.total), pct: total > 0 ? c.total / total : 0 }))
      .sort((a, b) => b.total - a.total);
  }

  function concentracaoTop3(cats) { return cats.slice(0, 3).reduce((a, c) => a + c.pct, 0); }

  function variacaoCategorias(atual, anterior) {
    const ant = new Map(anterior.map((c) => [c.categoria, c.total]));
    const nomes = new Set([...atual.map((c) => c.categoria), ...anterior.map((c) => c.categoria)]);
    const cur = new Map(atual.map((c) => [c.categoria, c.total]));
    return [...nomes].map((categoria) => {
      const a = cur.get(categoria) || 0, p = ant.get(categoria) || 0;
      return { categoria, atual: a, anterior: p, delta: r2(a - p), pct: p > 0 ? (a - p) / p : null };
    }).sort((x, y) => y.delta - x.delta);
  }

  function maiorGasto(txs) {
    let m = null;
    for (const t of txs) if (t.tipo === 'saida' && (!m || t.valor > m.valor)) m = t;
    return m;
  }

  function diasSemGastos(txs, inicio, fim) {
    if (fim < inicio) return 0;
    const com = new Set();
    for (const t of txs) if (t.tipo === 'saida' && t.data >= inicio && t.data <= fim) com.add(t.data);
    return diasInclusivo(inicio, fim) - com.size;
  }

  function saldoDiario(txs, saldoAntes, inicio, fim) {
    if (fim < inicio) return [];
    const delta = new Map();
    for (const t of txs) delta.set(t.data, (delta.get(t.data) || 0) + (t.tipo === 'entrada' ? t.valor : -t.valor));
    const out = [{ data: addDays(inicio, -1), saldo: r2(saldoAntes) }];
    let saldo = saldoAntes;
    for (let d = inicio; d <= fim; d = addDays(d, 1)) {
      saldo += delta.get(d) || 0;
      out.push({ data: d, saldo: r2(saldo) });
    }
    return out;
  }

  function porDiaSemana(txs, inicio, fim) {
    const tot = Array(7).fill(0), n = Array(7).fill(0), ocorr = Array(7).fill(0);
    for (const t of txs) {
      if (t.tipo !== 'saida' || t.data < inicio || t.data > fim) continue;
      const i = diaSemana(t.data); tot[i] += t.valor; n[i]++;
    }
    if (fim >= inicio) for (let d = inicio; d <= fim; d = addDays(d, 1)) ocorr[diaSemana(d)]++;
    return SEMANA.map((nome, i) => ({
      idx: i, nome, curto: SEMANA_CURTA[i], total: r2(tot[i]), n: n[i], ocorrencias: ocorr[i],
      media: ocorr[i] ? r2(tot[i] / ocorr[i]) : 0,
    }));
  }

  // Um item por dia do período, com nível de intensidade 0-4 (quartis dos dias com gasto).
  function calendario(txs, inicio, fim) {
    if (fim < inicio) return [];
    const mapa = new Map();
    for (const t of txs) {
      if (t.tipo !== 'saida') continue;
      const c = mapa.get(t.data) || { total: 0, n: 0 };
      c.total += t.valor; c.n++; mapa.set(t.data, c);
    }
    const vals = [...mapa.values()].map((c) => c.total).sort((a, b) => a - b);
    const q = (p) => vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] : 0;
    const q1 = q(0.25), q2 = q(0.5), q3 = q(0.75);
    const out = [];
    for (let d = inicio; d <= fim; d = addDays(d, 1)) {
      const c = mapa.get(d);
      const total = c ? r2(c.total) : 0;
      let nivel = 0;
      if (c) nivel = total <= q1 ? 1 : total <= q2 ? 2 : total <= q3 ? 3 : 4;
      out.push({ data: d, total, n: c ? c.n : 0, nivel, dow: diaSemana(d) });
    }
    return out;
  }

  /* ---------- séries a partir do histórico completo (linhas leves) ---------- */
  // linhas: [{tipo, valor, data}] de TODAS as transações do usuário.
  function agregados(linhas, inicio, hoje) {
    let saldo = 0, antes = 0, primeira = null;
    const mesAtual = hoje.slice(0, 7);
    const hist = new Map();
    for (let i = 12; i >= 0; i--) hist.set(addMonths(primeiroDiaMes(hoje), -i).slice(0, 7), { entradas: 0, saidas: 0 });
    const iniDiarias = addMonths(primeiroDiaMes(hoje), -3);
    const diarias = new Map();
    for (const r of linhas) {
      const sinal = r.tipo === 'entrada' ? 1 : -1;
      saldo += sinal * r.valor;
      if (r.data < inicio) antes += sinal * r.valor;
      if (!primeira || r.data < primeira) primeira = r.data;
      const h = hist.get(r.data.slice(0, 7));
      if (h) h[r.tipo === 'entrada' ? 'entradas' : 'saidas'] += r.valor;
      if (r.tipo === 'saida' && r.data >= iniDiarias && r.data <= hoje) {
        diarias.set(r.data, (diarias.get(r.data) || 0) + r.valor);
      }
    }
    return {
      primeira_data: primeira,
      saldo_total: r2(saldo),
      saldo_antes_periodo: r2(antes),
      historico_mensal: [...hist].map(([mes, h]) => ({ mes, entradas: r2(h.entradas), saidas: r2(h.saidas) })),
      saidas_diarias: [...diarias].map(([data, valor]) => ({ data, valor: r2(valor) })).sort((a, b) => (a.data < b.data ? -1 : 1)),
      mes_atual: mesAtual,
    };
  }

  function montarResposta(atuais, anteriores, linhas, inicio, fim, hoje) {
    const { mes_atual, ...ag } = agregados(linhas, inicio, hoje);
    return {
      hoje,
      periodo: { inicio, fim },
      anterior: periodoAnterior(inicio, fim, hoje),
      transacoes: atuais,
      transacoes_anterior: anteriores,
      ...ag,
    };
  }

  // Gasto acumulado dia a dia: mês atual × mês anterior × média dos 3 meses anteriores.
  function ritmoMes(saidasDiarias, hoje) {
    const mesAtual = hoje.slice(0, 7);
    const dm = diasNoMes(+hoje.slice(0, 4), +hoje.slice(5, 7));
    const diaHoje = +hoje.slice(8, 10);
    const porMes = new Map();
    for (const s of saidasDiarias) {
      const m = s.data.slice(0, 7);
      if (!porMes.has(m)) porMes.set(m, new Map());
      porMes.get(m).set(+s.data.slice(8, 10), s.valor);
    }
    const acum = (mes) => {
      const [y, m] = mes.split('-').map(Number);
      const dias = diasNoMes(y, m), mapa = porMes.get(mes) || new Map();
      const arr = []; let a = 0;
      for (let d = 1; d <= dm; d++) { if (d <= dias) a += mapa.get(d) || 0; arr.push(r2(a)); }
      return arr;
    };
    const primeiroMes = saidasDiarias.length ? saidasDiarias.reduce((m, s) => (s.data < m ? s.data : m), saidasDiarias[0].data).slice(0, 7) : null;
    const prev = (i) => addMonths(primeiroDiaMes(hoje), -i).slice(0, 7);
    const considerados = [1, 2, 3].map(prev).filter((m) => primeiroMes && m >= primeiroMes);
    const series = considerados.map(acum);
    const atual = acum(mesAtual).map((v, i) => (i + 1 <= diaHoje ? v : null));
    return {
      dias: dm,
      atual,
      anterior: considerados.includes(prev(1)) ? acum(prev(1)) : null,
      media3: series.length ? series[0].map((_, i) => r2(series.reduce((s, x) => s + x[i], 0) / series.length)) : null,
    };
  }

  /* ---------- formatação pt-BR ---------- */
  const nfBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const nfPct = (c) => new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: c });
  const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const fmt = {
    brl: (n) => nfBRL.format(n),
    brlAssinado: (n) => (n < 0 ? '−' : n > 0 ? '+' : '') + nfBRL.format(Math.abs(n)),
    pct: (f, casas = 0) => nfPct(casas).format(f),
    pctAbs: (f, casas = 0) => nfPct(casas).format(Math.abs(f)),
    data: (s) => `${+s.slice(8, 10)} ${MESES[+s.slice(5, 7) - 1]}`,
    dataAno: (s) => `${+s.slice(8, 10)} ${MESES[+s.slice(5, 7) - 1]}/${s.slice(2, 4)}`,
    mes: (s) => `${MESES[+s.slice(5, 7) - 1]}/${s.slice(2, 4)}`,
    abrev: (n) => {
      const a = Math.abs(n), s = n < 0 ? '−' : '';
      if (a >= 1e6) return `${s}R$ ${nf1.format(a / 1e6)} mi`;
      if (a >= 1e3) return `${s}R$ ${nf1.format(a / 1e3)} mil`;
      return `${s}R$ ${Math.round(a)}`;
    },
    meses: (n) => `${nf1.format(n)} ${Math.abs(n - 1) < 0.05 ? 'mês' : 'meses'}`,
  };

  /* ---------- insights (regras simples, sem IA) ---------- */
  function gerarInsights(c) {
    const out = [];
    const add = (texto, impacto, tom) => out.push({ texto, impacto, tom });
    if (c.t.n < 3) {
      return [{ texto: 'Ainda há poucos dados neste período para gerar insights confiáveis. Continue registrando suas transações pelo bot.', impacto: 0, tom: 'neutro' }];
    }
    if (c.taxa !== null) {
      const p = fmt.pct(c.taxa);
      if (c.faixa === 'critico') add(`Você gastou mais do que recebeu: sua taxa de poupança está em ${p}, abaixo de zero.`, 90, 'neg');
      else if (c.faixa === 'atencao') add(`Sua taxa de poupança está em ${p}: faixa de atenção (o saudável começa em 10%).`, 60, 'alerta');
      else if (c.faixa === 'saudavel') add(`Sua taxa de poupança está em ${p}, dentro da faixa saudável.`, 40, 'pos');
      else add(`Sua taxa de poupança está em ${p}, acima de 20%: excelente.`, 45, 'pos');
    } else if (c.t.saidas > 0) {
      add(`Não houve entradas no período e as saídas somam ${fmt.brl(c.t.saidas)}.`, 70, 'alerta');
    }
    const v = c.varCats.filter((x) => x.pct !== null && Math.abs(x.pct) >= 0.15 && Math.abs(x.delta) >= 20)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    if (v && c.ta.n > 0) {
      const mais = v.delta > 0;
      add(`Você gastou ${fmt.pctAbs(v.pct)} ${mais ? 'a mais' : 'a menos'} com ${v.categoria} do que no período anterior (${fmt.brlAssinado(v.delta)}).`,
        50 + Math.min(30, Math.abs(v.pct) * 30), mais ? 'neg' : 'pos');
    }
    if (c.projecao && c.dias >= 3) {
      if (c.projecao.media) {
        const d = c.projecao.valor / c.projecao.media - 1;
        const dir = d >= 0 ? 'acima' : 'abaixo';
        add(`No ritmo atual, suas saídas vão fechar o mês em ${fmt.brl(c.projecao.valor)}, ${fmt.pctAbs(d)} ${dir} da sua média.`,
          55 + Math.min(30, Math.abs(d) * 60), d > 0.05 ? 'neg' : d < -0.05 ? 'pos' : 'neutro');
      } else {
        add(`No ritmo atual, suas saídas vão fechar o mês em ${fmt.brl(c.projecao.valor)}.`, 45, 'neutro');
      }
    }
    if (c.folego !== null) {
      if (c.folego < 1) add(`Seu saldo cobre apenas ${fmt.meses(c.folego)} de gastos: reserva muito curta.`, 80, 'neg');
      else if (c.folego < 3) add(`Seu fôlego financeiro é de ${fmt.meses(c.folego)}: abaixo dos 3 meses recomendados.`, 55, 'alerta');
      else add(`Seu saldo sustenta ${fmt.meses(c.folego)} de gastos sem nova renda.`, 25, 'pos');
    }
    if (c.t.nSaidas >= 10) {
      const top = [...c.semana].filter((s) => s.ocorrencias >= 2).sort((a, b) => b.media - a.media)[0];
      if (top && top.media > 0) add(`${top.nome} é o dia da semana em que você mais gasta (média de ${fmt.brl(top.media)}).`, 30, 'neutro');
    }
    if (c.cats.length > 3 && c.top3 >= 0.75) add(`As 3 maiores categorias concentram ${fmt.pct(c.top3)} das suas saídas.`, 35, 'neutro');
    if (c.maior && c.t.nSaidas >= 4 && c.maior.valor >= 0.3 * c.t.saidas) {
      add(`Um único gasto (${c.maior.categoria}, ${fmt.brl(c.maior.valor)}) representa ${fmt.pct(c.maior.valor / c.t.saidas)} das saídas do período.`, 40, 'neutro');
    }
    return out.sort((a, b) => b.impacto - a.impacto).slice(0, 5);
  }

  /* ---------- painel completo a partir da resposta da API ---------- */
  function calcularPainel(d) {
    const hoje = d.hoje;
    const inicioEf = d.primeira_data && d.primeira_data > d.periodo.inicio ? d.primeira_data : d.periodo.inicio;
    const fimEf = minISO(d.periodo.fim, hoje);
    const tx = d.transacoes, txa = d.transacoes_anterior;
    const t = totais(tx), ta = totais(txa);
    const dias = fimEf >= inicioEf ? diasInclusivo(inicioEf, fimEf) : 0;
    const cats = porCategoria(tx), catsA = porCategoria(txa);
    const varCats = ta.n > 0 ? variacaoCategorias(cats, catsA) : []; // sem base de comparação, sem variação
    const mesCorrente = d.periodo.inicio === primeiroDiaMes(hoje) && d.periodo.fim === ultimoDiaMes(hoje);
    const media3 = mediaSaidasMeses(d.historico_mensal, hoje, 3);
    const taxa = taxaPoupanca(t.entradas, t.saidas);
    const c = {
      hoje, inicioEf, fimEf, dias, t, ta, cats, varCats, mesCorrente, media3, taxa,
      faixa: faixaPoupanca(taxa),
      saldo: d.saldo_total,
      varEntradas: variacao(t.entradas, ta.entradas),
      varSaidas: variacao(t.saidas, ta.saidas),
      projecao: mesCorrente ? { valor: projecaoMes(t.saidas, hoje), media: media3 } : null,
      burn: burnRate(t.saidas, dias),
      folego: folego(d.saldo_total, media3),
      ticket: ticketMedio(t),
      maior: maiorGasto(tx),
      diasSem: diasSemGastos(tx, inicioEf, fimEf),
      top3: concentracaoTop3(cats),
      maisCresceu: varCats.find((x) => x.delta > 0) || null,
      maisCaiu: [...varCats].reverse().find((x) => x.delta < 0) || null,
      semana: porDiaSemana(tx, inicioEf, fimEf),
      calendario: calendario(tx, inicioEf, fimEf),
      saldoDiario: saldoDiario(tx, d.saldo_antes_periodo, inicioEf, fimEf),
      mensal: d.historico_mensal.slice(-12),
      ritmo: ritmoMes(d.saidas_diarias, hoje),
    };
    c.insights = gerarInsights(c);
    return c;
  }

  return {
    MESES, SEMANA, SEMANA_CURTA, r2,
    parseISO, toISO, addDays, addMonths, diasNoMes, primeiroDiaMes, ultimoDiaMes, diffDias,
    diasInclusivo, mesesEntre, minISO, maxISO, diaSemana, hojeSP, validarISO, validarPeriodo,
    periodoAnterior, resolverPeriodo, totais, variacao, taxaPoupanca, faixaPoupanca, projecaoMes,
    mediaSaidasMeses, folego, burnRate, ticketMedio, porCategoria, concentracaoTop3,
    variacaoCategorias, maiorGasto, diasSemGastos, saldoDiario, porDiaSemana, calendario,
    agregados, montarResposta, ritmoMes, fmt, gerarInsights, calcularPainel,
  };
});
