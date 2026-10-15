'use strict';
const crypto = require('crypto');

const NOME_COOKIE = 'painel_sessao';
const DURACAO_S = 30 * 24 * 3600; // 30 dias

// A chave de assinatura mistura SESSION_SECRET e PAINEL_SENHA:
// trocar a senha invalida todas as sessões já emitidas.
function chaveSessao(segredo, senha) {
  return crypto.createHmac('sha256', segredo).update(String(senha)).digest();
}

function assinar(chave, texto) {
  return crypto.createHmac('sha256', chave).update(texto).digest('base64url');
}

function criarToken(chave, agora = Date.now()) {
  const exp = Math.floor(agora / 1000) + DURACAO_S;
  const corpo = 'v1.' + exp;
  return corpo + '.' + assinar(chave, corpo);
}

function validarToken(chave, token, agora = Date.now()) {
  if (typeof token !== 'string' || !chave) return false;
  const partes = token.split('.');
  if (partes.length !== 3 || partes[0] !== 'v1') return false;
  const a = Buffer.from(partes[2]);
  const b = Buffer.from(assinar(chave, partes[0] + '.' + partes[1]));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const exp = Number(partes[1]);
  return Number.isInteger(exp) && exp > Math.floor(agora / 1000);
}

// Comparação em tempo constante (hash dos dois lados iguala o tamanho).
function compararSenha(informada, esperada) {
  const ha = crypto.createHash('sha256').update(String(informada)).digest();
  const hb = crypto.createHash('sha256').update(String(esperada)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function lerCookie(header, nome = NOME_COOKIE) {
  if (!header) return null;
  for (const par of String(header).split(';')) {
    const i = par.indexOf('=');
    if (i < 0) continue;
    if (par.slice(0, i).trim() === nome) return par.slice(i + 1).trim();
  }
  return null;
}

const ATRIBUTOS = 'Path=/; HttpOnly; Secure; SameSite=Strict';

function cookieSessao(token) {
  return `${NOME_COOKIE}=${token}; ${ATRIBUTOS}; Max-Age=${DURACAO_S}`;
}

function cookieLimpo() {
  return `${NOME_COOKIE}=; ${ATRIBUTOS}; Max-Age=0`;
}

// Lê as variáveis de sessão; devolve null se o servidor estiver mal configurado.
function chaveDoAmbiente(env = process.env) {
  const { SESSION_SECRET: segredo, PAINEL_SENHA: senha } = env;
  if (!senha || !segredo || segredo.length < 32) return null;
  return chaveSessao(segredo, senha);
}

function sessaoValida(req, env = process.env) {
  const chave = chaveDoAmbiente(env);
  return !!chave && validarToken(chave, lerCookie(req.headers && req.headers.cookie));
}

module.exports = {
  NOME_COOKIE, DURACAO_S, chaveSessao, criarToken, validarToken, compararSenha,
  lerCookie, cookieSessao, cookieLimpo, chaveDoAmbiente, sessaoValida,
};
