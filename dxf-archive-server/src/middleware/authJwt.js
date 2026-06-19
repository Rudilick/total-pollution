const jwt = require('jsonwebtoken');

function _readToken(req) {
  const header = req.get('Authorization') || '';
  const m = header.match(/^Bearer (.+)$/);
  return m ? m[1] : '';
}

/** 로그인 필수 — 토큰이 없거나 유효하지 않으면 401 */
function requireAuth(req, res, next) {
  const token = _readToken(req);
  if (!token) return res.status(401).json({ error: '로그인이 필요합니다.' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: '로그인이 만료되었거나 유효하지 않습니다.' });
  }
}

/** 로그인은 선택 — 토큰이 있으면 req.user를 채우고, 없거나 잘못돼도 그냥 통과(비회원 취급) */
function optionalAuth(req, res, next) {
  const token = _readToken(req);
  if (token) {
    try { req.user = jwt.verify(token, process.env.JWT_SECRET); } catch (e) { /* 비회원으로 취급 */ }
  }
  next();
}

/** role 체크 (requireAuth 다음에 붙여서 사용) */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    next();
  };
}

module.exports = { requireAuth, optionalAuth, requireRole };
