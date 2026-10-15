'use strict';
const { cookieLimpo } = require('../lib/sessao');

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ erro: 'Método não permitido' });
  }
  res.setHeader('Set-Cookie', cookieLimpo());
  return res.status(200).json({ ok: true });
};
