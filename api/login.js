'use strict';
const { chaveDoAmbiente, compararSenha, criarToken, cookieSessao } = require('../lib/sessao');

const ATRASO_ERRO_MS = 800;

function lerCorpo(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch { return {}; }
  }
  return {};
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ erro: 'Método não permitido' });
  }
  const chave = chaveDoAmbiente();
  if (!chave) return res.status(500).json({ erro: 'Servidor não configurado' });

  const senha = lerCorpo(req).senha;
  const valida = typeof senha === 'string' && senha.length <= 256 &&
    compararSenha(senha, process.env.PAINEL_SENHA);

  if (!valida) {
    await new Promise((r) => setTimeout(r, ATRASO_ERRO_MS));
    return res.status(401).json({ erro: 'Senha incorreta' });
  }
  res.setHeader('Set-Cookie', cookieSessao(criarToken(chave)));
  return res.status(200).json({ ok: true });
};
