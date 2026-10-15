'use strict';
// Testa login/logout/dados com um Supabase simulado em memória (nenhuma rede, nenhuma chave real).
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const SENHA = 'senha-de-teste';
process.env.PAINEL_SENHA = SENHA;
process.env.SESSION_SECRET = 'a'.repeat(64);
process.env.SUPABASE_URL = 'http://supabase.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'CHAVE-SECRETA-NAO-VAZAR';
process.env.USUARIO_ID = '3';

const LINHAS = [
  { id: 1, usuario_id: 3, tipo: 'entrada', valor: 2000, categoria: 'Salário', descricao: 'Salário', data_transacao: '2026-10-15' },
  { id: 2, usuario_id: 3, tipo: 'saida', valor: 32, categoria: 'Mercado', descricao: 'Compras', data_transacao: '2026-10-15' },
  { id: 3, usuario_id: 3, tipo: 'entrada', valor: 32, categoria: 'Outros', descricao: 'Pix', data_transacao: '2026-10-15' },
  { id: 4, usuario_id: 99, tipo: 'entrada', valor: 100000, categoria: 'Outro usuário', descricao: 'NÃO DEVE APARECER', data_transacao: '2026-10-10' },
];
const consultas = [];

function fakeBuilder(tabela) {
  const f = []; let de = 0, ate = 999;
  const b = {
    select() { return b; },
    eq(c, v) { f.push((r) => r[c] === v); consultas.push([tabela, c, v]); return b; },
    gte(c, v) { f.push((r) => r[c] >= v); return b; },
    lte(c, v) { f.push((r) => r[c] <= v); return b; },
    order() { return b; },
    range(a, z) { de = a; ate = z; return b; },
    then(ok, err) { return Promise.resolve({ data: LINHAS.filter((r) => f.every((fn) => fn(r))).slice(de, ate + 1), error: null }).then(ok, err); },
  };
  return b;
}
const orig = Module._load;
Module._load = function (req, ...r) {
  if (req === '@supabase/supabase-js') return { createClient: () => ({ from: fakeBuilder }) };
  return orig.call(this, req, ...r);
};

const login = require('../api/login.js');
const logout = require('../api/logout.js');
const dados = require('../api/dados.js');

function res() {
  const o = { headers: {}, code: 200, body: null };
  o.setHeader = (k, v) => { o.headers[k.toLowerCase()] = v; return o; };
  o.status = (c) => { o.code = c; return o; };
  o.json = (b) => { o.body = b; return o; };
  return o;
}
async function fazLogin(senha) {
  const r = res();
  await login({ method: 'POST', body: { senha }, headers: {} }, r);
  return r;
}
const get = (query, cookie) => { const r = res(); return dados({ method: 'GET', query, headers: cookie ? { cookie } : {} }, r).then(() => r); };

test('login com senha errada: 401 depois de ~800 ms, sem cookie', async () => {
  const t0 = Date.now();
  const r = await fazLogin('errada');
  assert.equal(r.code, 401);
  assert.ok(Date.now() - t0 >= 780);
  assert.equal(r.headers['set-cookie'], undefined);
});

test('login correto emite cookie HttpOnly/Secure/SameSite=Strict de 30 dias', async () => {
  const r = await fazLogin(SENHA);
  assert.equal(r.code, 200);
  const c = r.headers['set-cookie'];
  for (const parte of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=2592000']) assert.ok(c.includes(parte), parte);
});

test('/api/dados sem cookie ou com cookie adulterado: 401', async () => {
  assert.equal((await get({ inicio: '2026-10-01', fim: '2026-10-31' })).code, 401);
  assert.equal((await get({ inicio: '2026-10-01', fim: '2026-10-31' }, 'painel_sessao=v1.9999999999.xxxx')).code, 401);
  const ok = (await fazLogin(SENHA)).headers['set-cookie'].split(';')[0];
  const adulterado = ok.replace(/\.[^.]+\.([^.]+)$/, '.9999999999.$1');
  assert.equal((await get({ inicio: '2026-10-01', fim: '2026-10-31' }, adulterado)).code, 401);
});

test('/api/dados valida datas', async () => {
  const cookie = (await fazLogin(SENHA)).headers['set-cookie'].split(';')[0];
  for (const q of [{}, { inicio: '2026-10-01' }, { inicio: "2026-10-01'", fim: '2026-10-31' }, { inicio: '2026-10-31', fim: '2026-10-01' }, { inicio: '2026-13-01', fim: '2026-13-02' }]) {
    assert.equal((await get(q, cookie)).code, 400, JSON.stringify(q));
  }
});

test('/api/dados devolve só o usuário configurado, sem vazar chaves', async () => {
  const cookie = (await fazLogin(SENHA)).headers['set-cookie'].split(';')[0];
  consultas.length = 0;
  const r = await get({ inicio: '2026-10-01', fim: '2026-10-31' }, cookie);
  assert.equal(r.code, 200);
  assert.ok(consultas.length >= 3 && consultas.every(([, c, v]) => c === 'usuario_id' && v === 3));
  assert.equal(r.body.transacoes.length, 3);
  assert.equal(r.body.saldo_total, 2000);       // 2000 - 32 + 32; o usuário 99 fica de fora
  assert.equal(r.headers['cache-control'], 'no-store');
  const txt = JSON.stringify(r.body);
  assert.ok(!txt.includes('NÃO DEVE APARECER') && !txt.includes('CHAVE-SECRETA') && !txt.includes('usuario_id'));
});

test('um usuario_id vindo do cliente é ignorado', async () => {
  const cookie = (await fazLogin(SENHA)).headers['set-cookie'].split(';')[0];
  const r = await get({ inicio: '2026-10-01', fim: '2026-10-31', usuario_id: '99' }, cookie);
  assert.ok(!JSON.stringify(r.body).includes('NÃO DEVE APARECER'));
});

test('logout limpa o cookie e métodos errados dão 405', async () => {
  const r = res(); logout({ method: 'POST', headers: {} }, r);
  assert.ok(r.headers['set-cookie'].includes('Max-Age=0'));
  const g = res(); logout({ method: 'GET', headers: {} }, g);
  assert.equal(g.code, 405);
});
