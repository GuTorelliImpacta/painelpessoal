'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../assets/metricas.js');
const Demo = require('../assets/demo.js');

const tx = (tipo, valor, data, categoria = 'Mercado') => ({ id: Math.random(), tipo, valor, data, categoria, descricao: '' });

test('taxa de poupança e faixas', () => {
  assert.equal(M.taxaPoupanca(5000, 4000), 0.2);
  assert.equal(M.taxaPoupanca(0, 100), null);
  assert.ok(M.taxaPoupanca(1000, 1500) < 0);
  assert.equal(M.faixaPoupanca(-0.01), 'critico');
  assert.equal(M.faixaPoupanca(0.05), 'atencao');
  assert.equal(M.faixaPoupanca(0.1), 'saudavel');
  assert.equal(M.faixaPoupanca(0.2), 'saudavel');
  assert.equal(M.faixaPoupanca(0.21), 'excelente');
  assert.equal(M.faixaPoupanca(null), null);
});

test('projeção do mês: saídas até hoje ÷ dias decorridos × dias do mês', () => {
  assert.equal(M.projecaoMes(1500, '2026-10-15'), 3100);        // 100/dia × 31
  assert.equal(M.projecaoMes(300, '2026-02-10'), 840);          // 30/dia × 28
  assert.equal(M.projecaoMes(0, '2026-10-15'), 0);
});

test('média dos 3 meses anteriores ignora meses antes do primeiro movimento', () => {
  const hist = [
    { mes: '2026-06', entradas: 0, saidas: 0 }, { mes: '2026-07', entradas: 0, saidas: 0 },
    { mes: '2026-08', entradas: 1000, saidas: 600 }, { mes: '2026-09', entradas: 1000, saidas: 1000 },
    { mes: '2026-10', entradas: 100, saidas: 50 },
  ];
  assert.equal(M.mediaSaidasMeses(hist, '2026-10-15', 3), 800);   // só ago e set
  assert.equal(M.mediaSaidasMeses([{ mes: '2026-10', entradas: 5, saidas: 1 }], '2026-10-15', 3), null);
});

test('fôlego financeiro = saldo ÷ média mensal de saídas', () => {
  assert.equal(M.folego(6000, 2000), 3);
  assert.equal(M.folego(1000, 2000), 0.5);
  assert.equal(M.folego(-500, 2000), 0);
  assert.equal(M.folego(1000, 0), null);
  assert.equal(M.folego(1000, null), null);
});

test('período anterior equivalente', () => {
  // mês corrente em andamento: compara até o mesmo dia do mês anterior
  assert.deepEqual(M.periodoAnterior('2026-10-01', '2026-10-31', '2026-10-15'), { inicio: '2026-09-01', fim: '2026-09-15' });
  // mês fechado: mês anterior inteiro (inclusive com 28 dias)
  assert.deepEqual(M.periodoAnterior('2026-03-01', '2026-03-31', '2026-10-15'), { inicio: '2026-02-01', fim: '2026-02-28' });
  assert.deepEqual(M.periodoAnterior('2026-09-01', '2026-09-30', '2026-10-15'), { inicio: '2026-08-01', fim: '2026-08-31' });
  // hoje dia 31 → fevereiro limita em 28
  assert.deepEqual(M.periodoAnterior('2026-03-01', '2026-03-31', '2026-03-31'), { inicio: '2026-02-01', fim: '2026-02-28' });
  // 3 meses em andamento
  assert.deepEqual(M.periodoAnterior('2026-08-01', '2026-10-31', '2026-10-15'), { inicio: '2026-05-01', fim: '2026-07-15' });
  // ano em andamento
  assert.deepEqual(M.periodoAnterior('2026-01-01', '2026-12-31', '2026-10-15'), { inicio: '2025-01-01', fim: '2025-10-15' });
  // intervalo livre: mesma duração imediatamente antes
  assert.deepEqual(M.periodoAnterior('2026-10-05', '2026-10-11', '2026-10-15'), { inicio: '2026-09-28', fim: '2026-10-04' });
});

test('resolverPeriodo', () => {
  assert.deepEqual(M.resolverPeriodo('mes', '2026-10-15'), { inicio: '2026-10-01', fim: '2026-10-31' });
  assert.deepEqual(M.resolverPeriodo('mes', '2026-10-15', { mesRef: '2026-09' }), { inicio: '2026-09-01', fim: '2026-09-30' });
  assert.deepEqual(M.resolverPeriodo('3m', '2026-10-15'), { inicio: '2026-08-01', fim: '2026-10-31' });
  assert.deepEqual(M.resolverPeriodo('12m', '2026-10-15'), { inicio: '2025-11-01', fim: '2026-10-31' });
  assert.deepEqual(M.resolverPeriodo('ano', '2026-10-15'), { inicio: '2026-01-01', fim: '2026-12-31' });
});

test('validação de datas ISO', () => {
  assert.ok(M.validarISO('2026-02-28'));
  assert.ok(!M.validarISO('2026-02-30'));
  assert.ok(!M.validarISO('2026-2-3'));
  assert.ok(!M.validarISO("2026-01-01'; drop"));
  assert.ok(!M.validarISO(undefined));
  assert.ok(M.validarPeriodo('2026-01-01', '2026-01-31'));
  assert.ok(!M.validarPeriodo('2026-02-01', '2026-01-31'));
});

test('totais, variação e categorias', () => {
  const t = M.totais([tx('entrada', 1000, '2026-10-05'), tx('saida', 0.1, '2026-10-06'), tx('saida', 0.2, '2026-10-06')]);
  assert.equal(t.entradas, 1000);
  assert.equal(t.saidas, 0.3);              // sem erro de ponto flutuante
  assert.equal(t.resultado, 999.7);
  assert.equal(M.variacao(120, 100), 0.2);
  assert.equal(M.variacao(50, 0), null);
  const cats = M.porCategoria([tx('saida', 30, '2026-10-01', 'A'), tx('saida', 70, '2026-10-02', 'B'), tx('entrada', 999, '2026-10-02', 'Z')]);
  assert.deepEqual(cats.map((c) => c.categoria), ['B', 'A']);
  assert.equal(cats[0].pct, 0.7);
  const v = M.variacaoCategorias(cats, M.porCategoria([tx('saida', 50, '2026-09-01', 'A')]));
  assert.equal(v[0].categoria, 'B');       // maior aumento primeiro
  assert.equal(v.find((x) => x.categoria === 'A').delta, -20);
  assert.equal(v.find((x) => x.categoria === 'A').pct, -0.4);
});

test('dias sem gastos, saldo diário e dia da semana', () => {
  const txs = [tx('saida', 10, '2026-10-01'), tx('saida', 10, '2026-10-01'), tx('saida', 5, '2026-10-03'), tx('entrada', 100, '2026-10-02')];
  assert.equal(M.diasSemGastos(txs, '2026-10-01', '2026-10-05'), 3);
  const s = M.saldoDiario(txs, 50, '2026-10-01', '2026-10-03');
  assert.deepEqual(s.map((p) => p.saldo), [50, 30, 130, 125]);
  assert.equal(s[0].data, '2026-09-30');
  assert.equal(M.diaSemana('2026-10-12'), 0);  // segunda
  assert.equal(M.diaSemana('2026-10-17'), 5);  // sábado
});

test('agregados: saldo, saldo antes do período e histórico de 13 meses', () => {
  const linhas = [tx('entrada', 3000, '2026-08-05'), tx('saida', 500, '2026-09-10'), tx('entrada', 2032, '2026-10-15'), tx('saida', 32, '2026-10-15')];
  const a = M.agregados(linhas, '2026-10-01', '2026-10-15');
  assert.equal(a.saldo_total, 4500);
  assert.equal(a.saldo_antes_periodo, 2500);
  assert.equal(a.primeira_data, '2026-08-05');
  assert.equal(a.historico_mensal.length, 13);
  assert.equal(a.historico_mensal.at(-1).mes, '2026-10');
  assert.deepEqual(a.historico_mensal.at(-1), { mes: '2026-10', entradas: 2032, saidas: 32 });
});

test('ritmo do mês: acumulado atual × anterior × média', () => {
  const dias = [{ data: '2026-09-02', valor: 100 }, { data: '2026-09-10', valor: 50 }, { data: '2026-08-05', valor: 300 }, { data: '2026-10-03', valor: 40 }];
  const r = M.ritmoMes(dias, '2026-10-05');
  assert.equal(r.dias, 31);
  assert.equal(r.atual[2], 40);
  assert.equal(r.atual[4], 40);
  assert.equal(r.atual[5], null);            // futuro
  assert.equal(r.anterior[0], 0);
  assert.equal(r.anterior[9], 150);
  assert.equal(r.anterior[30], 150);         // setembro tem 30 dias: segura o último valor
  assert.equal(r.media3[30], 225);           // (150 + 300) / 2 — jul/ago... só meses a partir de ago
});

test('calcularPainel fecha com o banco real (saldo 2000, entradas 2032, saídas 32)', () => {
  const hoje = '2026-10-15';
  const todas = [tx('entrada', 2032, hoje, 'Salário'), tx('saida', 32, hoje, 'Mercado')];
  const d = Demo.respostaDemo('2026-10-01', '2026-10-31', hoje, todas);
  const c = M.calcularPainel(d);
  assert.equal(c.saldo, 2000);
  assert.equal(c.t.entradas, 2032);
  assert.equal(c.t.saidas, 32);
  assert.equal(c.t.resultado, 2000);
  assert.equal(c.dias, 1);                    // dados começam hoje
  assert.equal(c.diasSem, 0);
  assert.equal(c.folego, null);               // sem meses fechados
  assert.ok(c.insights.length >= 1);
});

test('demo: 12 meses realistas e insights coerentes', () => {
  const hoje = '2026-10-15';
  const todas = Demo.gerarDemo(hoje);
  assert.ok(todas.length > 400);
  assert.ok(todas.every((t) => t.data <= hoje && t.valor > 0));
  assert.deepEqual(todas, Demo.gerarDemo(hoje));       // determinístico
  const c = M.calcularPainel(Demo.respostaDemo('2026-10-01', '2026-10-31', hoje, todas));
  assert.equal(c.mensal.length, 12);
  assert.ok(c.projecao && c.projecao.valor > 0 && c.projecao.media > 0);
  assert.ok(c.folego > 0);
  assert.ok(c.insights.length >= 3 && c.insights.length <= 5);
  const tudo = M.calcularPainel(Demo.respostaDemo('2000-01-01', hoje, hoje, todas));
  assert.equal(tudo.inicioEf, tudo.saldoDiario[1].data);   // recorta pela primeira transação
  assert.equal(tudo.saldoDiario.at(-1).saldo, tudo.saldo);
});

test('formatação pt-BR', () => {
  assert.equal(M.fmt.brl(1234.56).replace(/\s/g, ' '), 'R$ 1.234,56');
  assert.equal(M.fmt.data('2026-10-15'), '15 out');
  assert.equal(M.fmt.mes('2026-10'), 'out/26');
  assert.equal(M.fmt.abrev(2500).replace(/\s/g, ' '), 'R$ 2,5 mil');
  assert.equal(M.fmt.abrev(950).replace(/\s/g, ' '), 'R$ 950');
});
