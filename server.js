// ===== IMPORTATIONS =====
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { Pool } = require('pg');

const multer = require('multer');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v2: cloudinary } = require('cloudinary');

// ===== INITIALISATION =====
const app = express();

const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'https://othmanechouhbi.github.io'
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
}));
app.options(/.*/, cors());
app.use(express.json());
app.use(express.static(__dirname));

console.log('🚀 Démarrage du serveur...');

// ===== CONFIGURATION CLOUDINARY =====
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ===== CONFIGURATION BREVO =====
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const OTP_REQUEST_COOLDOWN_SECONDS = Number(process.env.OTP_REQUEST_COOLDOWN_SECONDS || 60);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const emailFromAddress = process.env.BREVO_SENDER_EMAIL || process.env.MAIL_FROM_EMAIL;
const emailFromName = process.env.BREVO_SENDER_NAME || process.env.MAIL_FROM_NAME || 'FinBlasti';

// ===== CONFIGURATION UPLOAD PHOTO =====
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Seules les images sont autorisées'));
    }
    cb(null, true);
  }
});

// ===== CONNEXION À SUPABASE =====
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ===== TEST CONNEXION =====
pool.query('SELECT NOW()', (err) => {
  if (err) {
    console.error('❌ ERREUR - Impossible de se connecter à Supabase:', err.message);
  } else {
    console.log('✅ Connecté à Supabase !');
  }
});

// ===== FONCTIONS AUTHENTIFICATION =====
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashCode(code) {
  return crypto
    .createHmac('sha256', process.env.OTP_SECRET)
    .update(code)
    .digest('hex');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function maskEmail(email) {
  const [name, domain] = String(email || '').split('@');
  if (!name || !domain) return 'unknown';
  return `${name.slice(0, 2)}***@${domain}`;
}

function ensureBrevoConfigured() {
  if (!process.env.BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY manquant');
  }
  if (!emailFromAddress || !isValidEmail(emailFromAddress)) {
    throw new Error('BREVO_SENDER_EMAIL invalide');
  }
}

async function sendOtpEmail(email, code) {
  ensureBrevoConfigured();

  const payload = {
    sender: {
      name: emailFromName,
      email: emailFromAddress
    },
    to: [{ email }],
    subject: 'Ton code de connexion',
    htmlContent: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <h2 style="margin: 0 0 12px;">Connexion</h2>
        <p>Voici ton code de verification :</p>
        <p style="font-size: 32px; font-weight: 800; letter-spacing: 6px; margin: 18px 0;">${code}</p>
        <p>Ce code expire dans 10 minutes. Ignore cet email si tu n'as pas demande de connexion.</p>
      </div>
    `,
    textContent: `Ton code de connexion est ${code}. Il expire dans 10 minutes.`
  };

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();
  let responseBody = {};
  if (responseText) {
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = { raw: responseText.slice(0, 500) };
    }
  }

  if (!response.ok) {
    const providerMessage = responseBody.message || responseBody.raw || `Brevo HTTP ${response.status}`;
    const err = new Error(providerMessage);
    err.status = response.status;
    err.provider = 'brevo';
    throw err;
  }

  return responseBody;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      error: 'Connexion requise'
    });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({
      error: 'Session invalide'
    });
  }
}

// ===== ROUTE TEST =====
app.get('/test', (req, res) => {
  res.json({
    message: '✅ Le serveur fonctionne !'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// ===== ROUTE : DEMANDER UN CODE DE CONNEXION =====
app.post('/api/auth/request-code', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        error: 'Email invalide'
      });
    }

    const recentRequest = await pool.query(
      `
      SELECT id, created_at
      FROM auth_codes
      WHERE email = $1
      AND used = false
      AND created_at > NOW() - ($2::int * INTERVAL '1 second')
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [email, OTP_REQUEST_COOLDOWN_SECONDS]
    );

    if (recentRequest.rows.length > 0) {
      return res.status(429).json({
        error: `Attends ${OTP_REQUEST_COOLDOWN_SECONDS} secondes avant de demander un nouveau code.`
      });
    }

    const code = generateCode();
    const codeHash = hashCode(code);

    await pool.query(
      `
      INSERT INTO auth_codes
      (
        email,
        code_hash,
        expires_at,
        used,
        attempts
      )
      VALUES
      ($1, $2, NOW() + INTERVAL '10 minutes', false, 0)
      RETURNING *
      `,
      [email, codeHash]
    );

    const brevoResult = await sendOtpEmail(email, code);

    console.log(`OTP envoye via Brevo a ${maskEmail(email)} messageId=${brevoResult.messageId || 'n/a'}`);

    res.json({
      message: 'Code envoye par email'
    });

  } catch (err) {
    console.error('Erreur request-code:', {
      message: err.message,
      provider: err.provider,
      status: err.status
    });

    const status = err.message?.startsWith('BREVO_') ? 503 : 500;

    res.status(status).json({
      error: 'Erreur lors de l envoi du code'
    });
  }
});

// ===== ROUTE : VÉRIFIER LE CODE =====
app.post('/api/auth/verify-code', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();
    const name = String(req.body.name || '').trim();

    if (!email || !isValidEmail(email) || !code) {
      return res.status(400).json({
        error: 'Email et code requis'
      });
    }

    const codeResult = await pool.query(
      `
      SELECT *
      FROM auth_codes
      WHERE email = $1
      AND used = false
      AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [email]
    );

    if (codeResult.rows.length === 0) {
      return res.status(400).json({
        error: 'Code expiré ou inexistant'
      });
    }

    const savedCode = codeResult.rows[0];

    if (Number(savedCode.attempts || 0) >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({
        error: 'Trop de tentatives. Demande un nouveau code.'
      });
    }

    if (savedCode.code_hash !== hashCode(code)) {
      await pool.query(
        `
        UPDATE auth_codes
        SET attempts = attempts + 1
        WHERE id = $1
        `,
        [savedCode.id]
      );

      return res.status(400).json({
        error: 'Code incorrect'
      });
    }

    await pool.query(
      `
      UPDATE auth_codes
      SET used = true
      WHERE id = $1
      `,
      [savedCode.id]
    );

    const userResult = await pool.query(
      `
      INSERT INTO users
      (
        email,
        name,
        verified
      )
      VALUES
      ($1, $2, true)
      ON CONFLICT (email)
      DO UPDATE SET
        name = EXCLUDED.name,
        verified = true
      RETURNING *
      `,
      [
        email,
        name || email.split('@')[0]
      ]
    );

    const user = userResult.rows[0];

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '30d'
      }
    );

    res.json({
      message: 'Connexion réussie',
      token,
      user
    });

  } catch (err) {
    console.error('❌ Erreur verify-code:', err);

    res.status(500).json({
      error: 'Erreur de vérification'
    });
  }
});

// ===== ROUTE : TOUS LES SPOTS =====
app.get('/api/spots', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM spots ORDER BY created_at DESC'
    );

    res.json(result.rows);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

// ===== ROUTE : AJOUTER UN SPOT AVEC PHOTO =====
app.post('/api/spots', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    const {
      name,
      city,
      type,
      district,
      description
    } = req.body;

    const wifi = Number(req.body.wifi || 0);
    const quiet = Number(req.body.quiet || 0);
    const comfort = Number(req.body.comfort || quiet || 0);
    const eco = Number(req.body.eco || 0);

    const score = ((wifi + quiet + comfort + eco) / 4).toFixed(1);

    const userResult = await pool.query(
      `
      SELECT name, email
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [req.user.userId]
    );

    const connectedUser = userResult.rows[0] || {
      name: null,
      email: req.user.email
    };

    let imageUrl = null;
    let imagePublicId = null;

    if (req.file) {
      const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

      const uploadedImage = await cloudinary.uploader.upload(base64Image, {
        folder: 'finblasti/spots',
        resource_type: 'image',
        transformation: [
          {
            width: 1200,
            height: 900,
            crop: 'limit',
            quality: 'auto',
            fetch_format: 'auto'
          }
        ]
      });

      imageUrl = uploadedImage.secure_url;
      imagePublicId = uploadedImage.public_id;
    }

    const result = await pool.query(
      `
      INSERT INTO spots
      (
        name,
        city,
        type,
        district,
        wifi,
        quiet,
        comfort,
        eco,
        score,
        description,
        image,
        image_public_id,
        user_id,
        user_name,
        user_email
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
      `,
      [
        name,
        city,
        type,
        district,
        wifi,
        quiet,
        comfort,
        eco,
        score,
        description,
        imageUrl,
        imagePublicId,
        req.user.userId,
        connectedUser.name,
        connectedUser.email
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error('❌ Erreur ajout spot:', err);

    res.status(500).json({
      error: 'Erreur lors de l’ajout du spot'
    });
  }
});

// ===== ROUTE : TOUS LES AVIS =====
app.get('/api/reviews', async (req, res) => {
  try {
    const spotId = req.query.spot_id;

    if (spotId) {
      const result = await pool.query(
        'SELECT * FROM reviews WHERE spot_id = $1 ORDER BY created_at DESC NULLS LAST',
        [spotId]
      );
      return res.json(result.rows);
    }

    const result = await pool.query(
      'SELECT * FROM reviews ORDER BY created_at DESC NULLS LAST'
    );

    res.json(result.rows);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

// ===== FAVORIS =====
app.get('/api/favorites', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT spot_id, created_at FROM favorites WHERE user_id = $1 ORDER BY created_at DESC',
      [String(req.user.userId)]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Erreur favorites GET:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/favorites', requireAuth, async (req, res) => {
  try {
    const spotId = req.body.spot_id;
    if (!spotId) {
      return res.status(400).json({ error: 'spot_id requis' });
    }

    await pool.query(
      `INSERT INTO favorites (user_id, spot_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, spot_id) DO NOTHING`,
      [String(req.user.userId), spotId]
    );

    res.status(201).json({ saved: true, spot_id: spotId });
  } catch (err) {
    console.error('❌ Erreur favorites POST:', err);
    if (err.code === '42P01') {
      return res.status(503).json({
        error: 'Table favorites manquante. Cree la table favorites dans Supabase.'
      });
    }
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/favorites/:spotId', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM favorites WHERE user_id = $1 AND spot_id = $2',
      [String(req.user.userId), req.params.spotId]
    );
    res.json({ saved: false, spot_id: req.params.spotId });
  } catch (err) {
    console.error('❌ Erreur favorites DELETE:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ===== COMMENTAIRES =====
app.get('/api/comments', async (req, res) => {
  try {
    const spotId = req.query.spot_id;
    if (!spotId) {
      return res.status(400).json({ error: 'spot_id requis' });
    }

    const result = await pool.query(
      `SELECT id, spot_id, user_name, text, rating, created_at
       FROM reviews
       WHERE spot_id = $1
       ORDER BY created_at DESC NULLS LAST, id DESC`,
      [spotId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('❌ Erreur comments GET:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/comments', requireAuth, async (req, res) => {
  try {
    const spotId = req.body.spot_id;
    const text = String(req.body.text || '').trim();

    if (!spotId) {
      return res.status(400).json({ error: 'spot_id requis' });
    }
    if (!text) {
      return res.status(400).json({ error: 'Commentaire vide' });
    }
    if (text.length > 500) {
      return res.status(400).json({ error: 'Commentaire trop long (500 max)' });
    }

    const userResult = await pool.query(
      'SELECT name, email FROM users WHERE id = $1 LIMIT 1',
      [req.user.userId]
    );
    const user = userResult.rows[0] || {
      name: req.user.email?.split('@')[0] || 'Utilisateur',
      email: req.user.email
    };

    const result = await pool.query(
      `INSERT INTO reviews (spot_id, user_name, text, rating)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [spotId, user.name, text, 5]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('❌ Erreur comments POST:', err);
    if (err.code === '42P01') {
      return res.status(503).json({
        error: 'Table reviews manquante dans Supabase.'
      });
    }
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ===== ROUTE : AJOUTER AVIS =====
app.post('/api/reviews', requireAuth, async (req, res) => {
  const spot_id = req.body.spot_id;
  const text = String(req.body.text || '').trim();
  const rating = Number(req.body.rating) || 5;

  if (!spot_id || !text) {
    return res.status(400).json({ error: 'spot_id et texte requis' });
  }

  try {
    const userResult = await pool.query(
      'SELECT name, email FROM users WHERE id = $1 LIMIT 1',
      [req.user.userId]
    );
    const user = userResult.rows[0] || {
      name: req.user.email?.split('@')[0] || 'Utilisateur',
      email: req.user.email
    };

    const result = await pool.query(
      `
      INSERT INTO reviews
      (
        spot_id,
        user_name,
        text,
        rating
      )
      VALUES
      ($1,$2,$3,$4)
      RETURNING *
      `,
      [spot_id, user.name, text, Math.min(5, Math.max(1, rating))]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Erreur ajout avis'
    });
  }
});

// ===== GESTION ERREURS UPLOAD =====
app.use((err, req, res, next) => {
  console.error('❌ Erreur globale:', err);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: 'Photo trop grande. Choisis une image de moins de 10 Mo.'
    });
  }

  res.status(500).json({
    error: err.message || 'Erreur serveur'
  });
});

// ===== DÉMARRAGE SERVEUR =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);

  console.log('📡 API disponible :');

  console.log(`- Test : http://localhost:${PORT}/test`);

  console.log(`- Spots : http://localhost:${PORT}/api/spots`);

  console.log(`- Avis : http://localhost:${PORT}/api/reviews`);

  console.log(`- Auth code : http://localhost:${PORT}/api/auth/request-code`);
});

