'use strict';
const { createClient } = require('@supabase/supabase-js');
const { sessaoValida } = require('../lib/sessao');
const M = require('../assets/metricas.js');

const TAM_PAGINA = 1000;
const MAX_PAGINAS = 100; // teto de segurança: 100 mil linhas

let cliente = null;
function supabase() {
  if (!cliente) {
    cliente = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cliente;
}

// Percorre as páginas do PostgREST (limite padrão de 1000 linhas por resposta).
async function buscarTudo(montar) {
  const linhas = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const { data, error } = await montar(p * TAM_PAGINA, (p + 1) * TAM_PAGINA - 1);
    if (error) throw error;
    linhas.push(...data);
    if (data.length < TAM_PAGINA) break;
  }
  return linhas;
}

function transacoesDoPeriodo(usuarioId, inicio, fim) {
  return buscarTudo((de, ate) =>
    supabase()
      .from('vw_transacoes')
      .select('id,tipo,valor,categoria,descricao,data_transacao')
      .eq('usuario_id', usuarioId)
      .gte('data_transacao', inicio)
      .lte('data_transacao', fim)
      .order('data_transacao', { ascending: false })
      .order('id', { ascending: false })
      .range(de, ate)
  ).then((rows) => rows.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    valor: Number(r.valor),
    categoria: r.categoria || 'Sem categoria',
    descricao: r.descricao || '',
    data: r.data_transacao,
  })));
}

// Colunas mínimas de todo o histórico: base do saldo, dos 13 meses e do ritmo.
function linhasLeves(usuarioId) {
  return buscarTudo((de, ate) =>
    supabase()
      .from('vw_transacoes')
      .select('tipo,valor,data_transacao')
      .eq('usuario_id', usuarioId)
      .order('id', { ascending: true })
      .range(de, ate)
  ).then((rows) => rows.map((r) => ({ tipo: r.tipo, valor: Number(r.valor), data: r.data_transacao })));
}

// Gustavo Viscondi (tabela usuarios). Fixo no servidor: nunca vem do cliente nem do ambiente.
const USUARIO_ID = 59;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ erro: 'Método não permitido' });
  }
  if (!sessaoValida(req)) return res.status(401).json({ erro: 'Não autenticado' });

  const usuarioId = USUARIO_ID;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ erro: 'Servidor não configurado' });
  }

  const { inicio, fim } = req.query || {};
  if (!M.validarPeriodo(inicio, fim)) {
    return res.status(400).json({ erro: 'Parâmetros inicio/fim inválidos (use YYYY-MM-DD)' });
  }

  try {
    const hoje = M.hojeSP();
    const ant = M.periodoAnterior(inicio, fim, hoje);
    const [atuais, anteriores, leves] = await Promise.all([
      transacoesDoPeriodo(usuarioId, inicio, fim),
      transacoesDoPeriodo(usuarioId, ant.inicio, ant.fim),
      linhasLeves(usuarioId),
    ]);
    return res.status(200).json(M.montarResposta(atuais, anteriores, leves, inicio, fim, hoje));
  } catch (e) {
    console.error('Falha ao consultar o Supabase:', e && e.message);
    return res.status(502).json({ erro: 'Falha ao consultar os dados' });
  }
};
