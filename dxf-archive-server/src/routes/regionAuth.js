const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { requireRegionAuth } = require('../middleware/authJwt');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

const DEFAULT_REGION_PASSWORD = '0000';

// GET /api/region-auth/regions — 로그인 화면 드롭다운용 (광역 선택 시 기초 목록 필터는 프런트가 처리)
router.get('/region-auth/regions', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT province, city FROM region_credentials ORDER BY province, city'
    );
    res.json({ regions: result.rows });
  } catch (e) {
    next(e);
  }
});

// POST /api/region-auth/login
// body: { province, city, password }
router.post('/region-auth/login', async (req, res, next) => {
  try {
    const { province, city, password } = req.body || {};
    if (!province || !city || !password) {
      return res.status(400).json({ error: '광역자치단체, 기초자치단체, 비밀번호를 모두 입력하세요.' });
    }

    const result = await pool.query(
      'SELECT province, city, password_hash, must_change_password FROM region_credentials WHERE province = $1 AND city = $2',
      [province, city]
    );
    const region = result.rows[0];
    if (!region || !(await bcrypt.compare(password, region.password_hash))) {
      return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
    }

    const token = jwt.sign(
      { province: region.province, city: region.city, type: 'region' },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({
      token,
      province: region.province,
      city: region.city,
      mustChangePassword: region.must_change_password,
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/region-auth/change-password  (지역 로그인 필요)
// body: { currentPassword?, newPassword, newPassword2 }
// currentPassword가 있으면 기존 비밀번호를 먼저 검증한다(세션 중 자발적 변경 시 필수).
// 없으면 최초 로그인 강제 변경 흐름으로 간주한다.
router.post('/region-auth/change-password', requireRegionAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword, newPassword2 } = req.body || {};
    if (!newPassword || !newPassword2) {
      return res.status(400).json({ error: '새 비밀번호를 두 번 입력하세요.' });
    }
    if (newPassword !== newPassword2) {
      return res.status(400).json({ error: '입력한 두 비밀번호가 서로 다릅니다.' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });
    }

    if (currentPassword) {
      const row = await pool.query(
        'SELECT password_hash FROM region_credentials WHERE province = $1 AND city = $2',
        [req.region.province, req.region.city]
      );
      if (!row.rows[0] || !(await bcrypt.compare(currentPassword, row.rows[0].password_hash))) {
        return res.status(401).json({ error: '현재 비밀번호가 올바르지 않습니다.' });
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE region_credentials
          SET password_hash = $3, must_change_password = FALSE, updated_at = now()
        WHERE province = $1 AND city = $2`,
      [req.region.province, req.region.city, passwordHash]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// GET /api/region-auth/me — 현재 로그인한 지역 확인용(토큰 유효성 검사 겸용)
router.get('/region-auth/me', requireRegionAuth, (req, res) => {
  res.json({ region: req.region });
});

// ── 슈퍼관리자 전용: 지역 비밀번호 관리 (region-password-admin.html) ──────

// GET /api/region-auth/admin/list  (슈퍼관리자 키 필요)
router.get('/region-auth/admin/list', adminAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT province, city, must_change_password, updated_at FROM region_credentials ORDER BY province, city'
    );
    res.json({ regions: result.rows });
  } catch (e) {
    next(e);
  }
});

// POST /api/region-auth/admin/reset  (슈퍼관리자 키 필요)
// body: { province, city } — 해당 지역 비밀번호를 "0000"으로 되돌리고 강제 변경 플래그를 켠다.
router.post('/region-auth/admin/reset', adminAuth, async (req, res, next) => {
  try {
    const { province, city } = req.body || {};
    if (!province || !city) {
      return res.status(400).json({ error: 'province, city는 필수입니다.' });
    }
    const passwordHash = await bcrypt.hash(DEFAULT_REGION_PASSWORD, 10);
    const result = await pool.query(
      `UPDATE region_credentials
          SET password_hash = $3, must_change_password = TRUE, updated_at = now()
        WHERE province = $1 AND city = $2
        RETURNING province, city`,
      [province, city, passwordHash]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '존재하지 않는 지역입니다.' });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
