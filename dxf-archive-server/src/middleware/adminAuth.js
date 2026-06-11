const crypto = require('crypto');

function adminAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  const m = header.match(/^Bearer (.+)$/);
  const token = m ? m[1] : '';
  const expected = process.env.ADMIN_TOKEN || '';

  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expected);

  const valid =
    expected.length > 0 &&
    tokenBuf.length === expectedBuf.length &&
    crypto.timingSafeEqual(tokenBuf, expectedBuf);

  if (!valid) {
    return res.status(401).json({ error: '인증 토큰이 올바르지 않습니다.' });
  }
  next();
}

module.exports = adminAuth;
