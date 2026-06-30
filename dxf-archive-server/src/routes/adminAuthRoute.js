const express = require('express');
const { isValidAdminToken } = require('../middleware/adminAuth');

const router = express.Router();

// POST /api/admin-auth/login
// body: { password } — 서버의 ADMIN_TOKEN 환경변수와 일치하는지 검증만 하고,
// 통과하면 그 값을 그대로 Bearer 토큰으로 계속 쓸 수 있다고 알려준다(프런트는
// 이 비밀번호를 더 이상 소스에 박아두지 않고, 사용자가 입력한 값을 서버가
// 맞다고 확인해준 뒤에만 localStorage에 저장해서 _adminFetch에 사용한다).
router.post('/admin-auth/login', (req, res) => {
  const { password } = req.body || {};
  if (!isValidAdminToken(password)) {
    return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  }
  res.json({ ok: true });
});

module.exports = router;
