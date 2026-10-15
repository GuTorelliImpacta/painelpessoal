/* Gerador de dados fictícios (?demo=1). Determinístico (PRNG com semente),
   mesmo formato das transações devolvidas pela API. */
(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./metricas.js') : root.Metricas);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Demo = api;
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  function prng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Sazonalidade por mês (1-12): dezembro/julho gastam mais com lazer, janeiro com educação etc.
  const SAZ = {
    Alimentação: [1, 0.95, 0.95, 1, 1, 1, 1.1, 1, 1, 1, 1.05, 1.35],
    Lazer: [1.1, 1.1, 0.9, 0.9, 0.9, 1, 1.4, 1, 0.9, 1, 1.1, 1.6],
    Educação: [1.6, 1.2, 1, 1, 1, 1, 0.8, 1.1, 1, 1, 1, 0.7],
    Saúde: [1, 1, 1, 1.1, 1.2, 1.3, 1.1, 1, 1, 1, 1, 1],
    Mercado: [1.05, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.05, 1.3],
  };
  const DESC = {
    Alimentação: ['Almoço', 'Jantar', 'Lanche', 'iFood', 'Padaria', 'Café'],
    Mercado: ['Compra do mês', 'Feira', 'Hortifruti', 'Açougue'],
    Transporte: ['Uber', '99', 'Combustível', 'Estacionamento'],
    Lazer: ['Cinema', 'Bar com amigos', 'Show', 'Viagem de fim de semana', 'Livraria'],
    Saúde: ['Farmácia', 'Consulta', 'Exame'],
  };

  function gerarDemo(hoje, semente = 2026) {
    const rnd = prng(semente);
    const rr = (a, b) => a + rnd() * (b - a);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const txs = [];
    let id = 1;
    const add = (tipo, valor, categoria, descricao, data) => {
      if (data > hoje) return;
      txs.push({ id: id++, tipo, valor: Math.round(valor * 100) / 100, categoria, descricao, data });
    };
    const saz = (cat, mes) => (SAZ[cat] ? SAZ[cat][mes - 1] : 1);
    const mesAtual = M.primeiroDiaMes(hoje);

    for (let i = 11; i >= 0; i--) {
      const ini = M.addMonths(mesAtual, -i);
      const y = +ini.slice(0, 4), m = +ini.slice(5, 7), dm = M.diasNoMes(y, m);
      const dia = (d) => M.addDays(ini, Math.min(d, dm) - 1);

      add('entrada', 5200, 'Salário', 'Salário', dia(5));
      if (rnd() < 0.35) add('entrada', rr(800, 2200), 'Freelance', 'Projeto freelance', dia(Math.floor(rr(8, 27))));
      if (m === 12) add('entrada', 2600, 'Salário', '13º salário', dia(20));

      add('saida', 1200, 'Moradia', 'Aluguel', dia(10));
      add('saida', rr(230, 290), 'Moradia', 'Condomínio e contas', dia(12));
      add('saida', 55.9, 'Assinaturas', 'Streaming de vídeo', dia(12));
      add('saida', 21.9, 'Assinaturas', 'Streaming de música', dia(15));
      add('saida', 99, 'Assinaturas', 'Academia', dia(3));
      add('saida', 149, 'Educação', 'Curso online', dia(20));
      if (rnd() < 0.5 || m === 1) add('saida', rr(80, 260) * saz('Educação', m), 'Educação', 'Livros e material', dia(Math.floor(rr(2, 27))));

      const qtd = (cat, a, b) => Math.round(rr(a, b) * saz(cat, m));
      for (let k = 0; k < qtd('Mercado', 4, 5); k++) add('saida', rr(70, 250) * saz('Mercado', m), 'Mercado', pick(DESC.Mercado), dia(Math.floor(rr(1, 29))));
      for (let k = 0; k < qtd('Alimentação', 10, 15); k++) {
        let d = Math.floor(rr(1, 29));
        if (rnd() < 0.4) { // puxa para o fim de semana
          const data = dia(d); d += (5 - M.diaSemana(data) + 7) % 7;
        }
        add('saida', rr(18, 70), 'Alimentação', pick(DESC.Alimentação), dia(d));
      }
      for (let k = 0; k < Math.round(rr(7, 11)); k++) add('saida', rr(10, 36), 'Transporte', pick(DESC.Transporte.slice(0, 2)), dia(Math.floor(rr(1, 29))));
      for (let k = 0; k < 2; k++) add('saida', rr(120, 180), 'Transporte', 'Combustível', dia(Math.floor(rr(1, 29))));
      for (let k = 0; k < qtd('Lazer', 3, 5); k++) add('saida', rr(30, 170) * saz('Lazer', m), 'Lazer', pick(DESC.Lazer), dia(Math.floor(rr(1, 29))));
      for (let k = 0; k < qtd('Saúde', 1, 3); k++) add('saida', rr(30, 130) * saz('Saúde', m), 'Saúde', pick(DESC.Saúde), dia(Math.floor(rr(1, 29))));
      if (rnd() < 0.25) add('saida', rr(150, 320), 'Saúde', 'Consulta particular', dia(Math.floor(rr(1, 29))));
    }
    return txs.sort((a, b) => (a.data === b.data ? b.id - a.id : a.data < b.data ? 1 : -1));
  }

  // Equivalente em memória de GET /api/dados.
  function respostaDemo(inicio, fim, hoje, todas) {
    const ant = M.periodoAnterior(inicio, fim, hoje);
    const noPeriodo = (a, b) => todas.filter((t) => t.data >= a && t.data <= b);
    return M.montarResposta(noPeriodo(inicio, fim), noPeriodo(ant.inicio, ant.fim), todas, inicio, fim, hoje);
  }

  return { gerarDemo, respostaDemo };
});
