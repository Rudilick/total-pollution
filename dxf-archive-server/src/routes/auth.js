const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/authJwt');

const router = express.Router();

// 회원가입 시 받는 필수 동의 — 문구 전문을 여기 한 곳에서만 관리해서, 화면에 보여준 문구와
// DB에 저장하는 문구가 항상 똑같게 만든다. 버전을 올리면(법무 검토 등) CONSENT_VERSION만 바꾼다.
const CONSENT_VERSION = '1.0';
const SIGNUP_CONSENTS = [
  { type: 'terms', text: 'ENVELO 이용약관에 동의합니다.' },
  { type: 'privacy', text: 'ENVELO 개인정보처리방침에 동의합니다.' },
  {
    type: 'office_info',
    text: '본인은 ENVELO 이용을 위해 설계사무소 또는 관련 업무 수행 정보를 등록하며, 해당 정보가 회원 인증, 서비스 제공, 아카이브 신뢰성 확보, 분쟁 대응 목적으로 이용되는 것에 동의합니다.',
  },
  {
    type: 'cad_authority',
    text: '본인은 ENVELO에 CAD 도면 및 관련 자료를 업로드·작성·제공할 적법한 권한이 있음을 확인합니다.',
  },
  {
    type: 'cad_license',
    text: '본인은 ENVELO가 서비스 제공, 변경률 분석, CAD 저장, 회원 전용 아카이브 제공, 검색·열람 제공, 통계·연구·서비스 개선, 보안 및 분쟁 대응 목적으로 CAD 자료와 관련 데이터를 저장·복제·변환·게시·전송·검색 제공·열람 제공할 수 있음에 동의합니다.',
  },
  {
    type: 'responsibility',
    text: '본인은 ENVELO에서 생성되는 분석 결과와 도면이 보조자료이며, 원자료의 정확성, 도면 작성 오류, 법령 검토, 인허가 제출, 제3자 권리침해 문제에 대한 최종 책임은 작성자·사용자·설계자·대행자·발주자에게 있음을 확인합니다.',
  },
];

// GET /api/auth/signup-consents — 회원가입 화면에 보여줄 동의 문구 목록(프론트가 항상 최신 문구를 받게)
router.get('/auth/signup-consents', (req, res) => {
  res.json({ version: CONSENT_VERSION, items: SIGNUP_CONSENTS });
});

// POST /api/auth/signup
// body: { email, password, name, office_id?, office_name?, region?, consents: { [type]: true } }
router.post('/auth/signup', async (req, res, next) => {
  const { email, password, name, office_id, office_name, region, consents } = req.body || {};

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password, name은 필수입니다.' });
  }
  if (!office_id && !office_name) {
    return res.status(400).json({ error: '소속 설계사무소를 선택하거나 직접 입력해야 합니다.' });
  }
  const missing = SIGNUP_CONSENTS.filter(c => !consents?.[c.type]);
  if (missing.length > 0) {
    return res.status(400).json({ error: '모든 필수 동의에 체크해야 합니다.', missing: missing.map(c => c.type) });
  }

  const ip = req.ip || req.headers['x-forwarded-for'] || '';
  const ua = req.get('User-Agent') || '';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: '이미 가입된 이메일입니다.' });
    }

    let officeId = office_id || null;
    if (!officeId) {
      const officeResult = await client.query(
        `INSERT INTO offices (name, region, source) VALUES ($1, $2, '직접입력') RETURNING id`,
        [office_name, region || null]
      );
      officeId = officeResult.rows[0].id;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, name, office_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, office_id, role, created_at`,
      [email, passwordHash, name, officeId]
    );
    const user = userResult.rows[0];

    for (const c of SIGNUP_CONSENTS) {
      await client.query(
        `INSERT INTO signup_consents
           (user_id, office_id, consent_type, consent_version, consent_text, agreed, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, true, $6, $7)`,
        [user.id, officeId, c.type, CONSENT_VERSION, c.text, ip, ua]
      );
    }

    await client.query('COMMIT');

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, office_id: user.office_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.status(201).json({ token, user });
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

// POST /api/auth/login
router.post('/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email, password는 필수입니다.' });
    }

    const result = await pool.query(
      'SELECT id, email, password_hash, name, office_id, role FROM users WHERE email = $1',
      [email]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, office_id: user.office_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, office_id: user.office_id, role: user.role },
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/auth/me — 현재 로그인한 사용자 정보 확인용
router.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
