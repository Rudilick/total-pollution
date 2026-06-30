require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { runMigrations } = require('./db');
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const adminAuthRoute = require('./routes/adminAuthRoute');
const regionAuthRoutes = require('./routes/regionAuth');
const projectsRoutes = require('./routes/projects');
const projectsAdminRoutes = require('./routes/projectsAdmin');
const eiaListRoutes = require('./routes/eiaList');

const app = express();

const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : '*';
app.use(cors({ origin: corsOrigin }));

app.use(express.json({ limit: '15mb' }));

app.use('/api', healthRoutes);
app.use('/api', authRoutes);
app.use('/api', adminAuthRoute);
app.use('/api', regionAuthRoutes);
app.use('/api', projectsRoutes);
app.use('/api', projectsAdminRoutes);
app.use('/api', eiaListRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

const PORT = process.env.PORT || 3000;

runMigrations()
  .then(() => {
    app.listen(PORT, () => console.log(`dxf-archive-server listening on port ${PORT}`));
  })
  .catch(err => {
    console.error('마이그레이션 실패:', err);
    process.exit(1);
  });
