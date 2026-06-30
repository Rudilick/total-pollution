const crypto = require('crypto');

// 슈퍼관리자 비밀번호(=ADMIN_TOKEN)와 일치하는지 타이밍공격에 안전하게 비교한다.
// adminAuth 미들웨어(Bearer 토큰 검증)와 POST /admin-auth/login(로그인 검증) 둘 다 이걸 쓴다.
function isValidAdminToken(token) {
  const expected = process.env.ADMIN_TOKEN || '';
  const tokenBuf = Buffer.from(String(token || ''));
  const expectedBuf = Buffer.from(expected);
  return (
    expected.length > 0 &&
    tokenBuf.length === expectedBuf.length &&
    crypto.timingSafeEqual(tokenBuf, expectedBuf)
  );
}

function adminAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  const m = header.match(/^Bearer (.+)$/);
  const token = m ? m[1] : '';

  if (!isValidAdminToken(token)) {
    return res.status(401).json({ error: '인증 토큰이 올바르지 않습니다.' });
  }
  next();
}

module.exports = adminAuth;
module.exports.isValidAdminToken = isValidAdminToken;
