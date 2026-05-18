// ===== IMPORTATIONS =====
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { Pool } = require('pg');

const multer = require('multer');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v2: cloudinary } = require('cloudinary');
let SibApiV3Sdk = null;

try {
  SibApiV3Sdk = require('sib-api-v3-sdk');
} catch (err) {
  console.error('Brevo SDK indisponible. Le serveur continue sans email transactionnel:', err.message);
}

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
const BREVO_TIMEOUT_MS = 8000;
const OTP_REQUEST_COOLDOWN_SECONDS = Number(process.env.OTP_REQUEST_COOLDOWN_SECONDS || 60);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const emailFromAddress = process.env.BREVO_SENDER_EMAIL || process.env.MAIL_FROM_EMAIL || 'noreply@finblasti.com';
const emailFromName = process.env.BREVO_SENDER_NAME || process.env.MAIL_FROM_NAME || 'FinBlasti';
let brevoTransactionalApi = null;

try {
  configureBrevoClient();
} catch (err) {
  console.error('Erreur initialisation Brevo ignoree:', err.message);
}

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

function createServiceError(message, statusCode, publicMessage, code, provider) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.publicMessage = publicMessage;
  err.code = code;
  err.provider = provider;
  return err;
}

function getBrevoConfigError() {
  if (!SibApiV3Sdk) {
    return 'SDK Brevo indisponible';
  }
  if (!process.env.BREVO_API_KEY) {
    return 'BREVO_API_KEY manquant';
  }
  if (!emailFromAddress || !isValidEmail(emailFromAddress)) {
    return 'BREVO_SENDER_EMAIL invalide';
  }
  return null;
}

function configureBrevoClient() {
  const configError = getBrevoConfigError();
  if (configError) {
    console.warn('Configuration Brevo invalide au demarrage:', configError);
    return null;
  }

  try {
    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    const apiKey = defaultClient.authentications['api-key'];
    apiKey.apiKey = process.env.BREVO_API_KEY;
    brevoTransactionalApi = new SibApiV3Sdk.TransactionalEmailsApi();
    console.log('Configuration Brevo transactionnelle chargee.');
    return brevoTransactionalApi;
  } catch (err) {
    console.error('Erreur configuration Brevo transactionnelle:', err.message);
    brevoTransactionalApi = null;
    return null;
  }
}

function getOtpConfigError({ needsJwt = false } = {}) {
  if (!process.env.OTP_SECRET) {
    return 'OTP_SECRET manquant';
  }
  if (needsJwt && !process.env.JWT_SECRET) {
    return 'JWT_SECRET manquant';
  }
  return null;
}

function ensureBrevoConfigured() {
  const configError = getBrevoConfigError();
  if (configError) {
    throw createServiceError(
      configError,
      503,
      'Service email non configure. Reessaie plus tard.',
      'BREVO_CONFIG',
      'brevo'
    );
  }
}

async function sendOtpEmail(email, code) {
  ensureBrevoConfigured();
  const apiInstance = brevoTransactionalApi || configureBrevoClient();
  if (!apiInstance) {
    throw createServiceError(
      'Brevo TransactionalEmailsApi indisponible',
      503,
      'Service email temporairement indisponible. Reessaie plus tard.',
      'BREVO_CLIENT',
      'brevo'
    );
  }

  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  sendSmtpEmail.subject = 'Votre code de connexion';
  sendSmtpEmail.htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <h2 style="margin: 0 0 12px;">Connexion</h2>
      <p>Votre code de connexion :</p>
      <p style="font-size: 32px; font-weight: 800; letter-spacing: 6px; margin: 18px 0;">${code}</p>
      <p>Ce code expire dans 10 minutes. Ignore cet email si tu n'as pas demande de connexion.</p>
    </div>
  `;
  sendSmtpEmail.textContent = `Votre code de connexion est ${code}. Il expire dans 10 minutes.`;
  sendSmtpEmail.sender = {
    name: emailFromName,
    email: emailFromAddress
  };
  sendSmtpEmail.to = [{ email }];

  let timeout;

  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        reject(createServiceError(
          'Brevo transactional request timeout',
          504,
          'Service email temporairement indisponible. Reessaie plus tard.',
          'BREVO_TIMEOUT',
          'brevo'
        ));
      }, BREVO_TIMEOUT_MS);
    });

    return await Promise.race([
      apiInstance.sendTransacEmail(sendSmtpEmail),
      timeoutPromise
    ]);
  } catch (err) {
    if (err.provider === 'brevo') {
      throw err;
    }

    const providerMessage = err?.response?.body?.message || err?.message || 'Brevo transactional request failed';
    console.error('Brevo transactional error:', providerMessage);
    throw createServiceError(
      providerMessage,
      502,
      'Impossible d envoyer le code pour le moment. Verifie la configuration Brevo puis reessaie.',
      'BREVO_SEND_FAILED',
      'brevo'
    );
  } finally {
    clearTimeout(timeout);
  }
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    decoded.id = decoded.id || decoded.userId;
    decoded.userId = decoded.userId || decoded.id;

    if (!decoded.id) {
      return res.status(401).json({
        error: 'Session invalide'
      });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      error: 'Session invalide'
    });
  }
}

function cleanUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name || String(row.email || '').split('@')[0] || 'Utilisateur',
    verified: Boolean(row.verified),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

async function getUserById(userId) {
  const result = await pool.query(
    `
    SELECT id, email, name, verified, created_at, updated_at
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [userId]
  );
  return cleanUser(result.rows[0]);
}

function reviewSelectSql(whereClause = '') {
  return `
    SELECT
      r.id,
      r.spot_id,
      r.text,
      r.rating,
      r.user_id,
      COALESCE(NULLIF(u.name, ''), NULLIF(r.user_name, ''), 'Utilisateur') AS user_name,
      r.created_at
    FROM reviews r
    LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(r.user_id AS TEXT)
    ${whereClause}
    ORDER BY r.created_at DESC NULLS LAST, r.id DESC
  `;
}

async function getCurrentReviewUser(authUser) {
  console.log('JWT user', authUser);
  const user = await getUserById(authUser.id);
  return user || {
    id: authUser.id,
    email: authUser.email,
    name: authUser.email?.split('@')[0] || 'Utilisateur'
  };
}

// ===== ROUTE TEST =====
app.get('/test', (req, res) => {
  res.json({
    message: '✅ Le serveur fonctionne !'
  });
});

app.get('/api/test', (req, res) => {
  res.json({
    message: 'Le serveur API fonctionne !'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
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

    const otpConfigError = getOtpConfigError();
    if (otpConfigError) {
      console.error('Configuration OTP invalide:', otpConfigError);
      return res.status(503).json({
        error: 'Service de connexion temporairement indisponible'
      });
    }

    const brevoConfigError = getBrevoConfigError();
    if (brevoConfigError) {
      console.error('Configuration Brevo invalide:', brevoConfigError);
      return res.status(503).json({
        error: 'Service email non configure. Reessaie plus tard.'
      });
    }

    const userResult = await pool.query(
      `
      SELECT id, email, name
      FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1
      `,
      [email]
    );
    const existingUser = userResult.rows[0] || null;
    const authFlow = existingUser ? 'login' : 'signup';

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
      message: 'Code envoye par email',
      flow: authFlow,
      user_exists: Boolean(existingUser),
      user: existingUser ? cleanUser(existingUser) : null
    });

  } catch (err) {
    console.error('Erreur request-code:', {
      message: err.message,
      provider: err.provider,
      status: err.statusCode || err.status
    });

    const status = err.statusCode || err.status || 500;

    res.status(status).json({
      error: err.publicMessage || 'Erreur lors de l envoi du code'
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

    const otpConfigError = getOtpConfigError({ needsJwt: true });
    if (otpConfigError) {
      console.error('Configuration OTP invalide:', otpConfigError);
      return res.status(503).json({
        error: 'Service de connexion temporairement indisponible'
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

    const existingUserResult = await pool.query(
      `
      SELECT id, email, name, created_at, updated_at
      FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1
      `,
      [email]
    );
    const userExists = existingUserResult.rows.length > 0;
    const defaultName = name || email.split('@')[0];

    const userResult = await pool.query(
      userExists
        ? `
          UPDATE users
          SET
            verified = true,
            updated_at = NOW()
          WHERE lower(email) = lower($1)
          RETURNING id, email, name, verified, created_at, updated_at
        `
        : `
          INSERT INTO users
          (
            email,
            name,
            verified,
            created_at,
            updated_at
          )
          VALUES
          ($1, $2, true, NOW(), NOW())
          RETURNING id, email, name, verified, created_at, updated_at
        `,
      userExists ? [email] : [email, defaultName]
    );

    const user = cleanUser(userResult.rows[0]);

    const token = jwt.sign(
      {
        id: user.id,
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
      user,
      flow: userExists ? 'login' : 'signup',
      user_exists: userExists
    });

  } catch (err) {
    console.error('❌ Erreur verify-code:', err);

    res.status(500).json({
      error: 'Erreur de vérification'
    });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    res.json({ user });
  } catch (err) {
    console.error('Erreur auth/me:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

async function updateMyName(req, res) {
  try {
    const name = String(req.body.name || '').trim();

    if (!name) {
      return res.status(400).json({ error: 'Nom requis' });
    }
    if (name.length > 80) {
      return res.status(400).json({ error: 'Nom trop long (80 caracteres max)' });
    }

    const result = await pool.query(
      `
      UPDATE users
      SET name = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, email, name, verified, created_at, updated_at
      `,
      [name, req.user.id]
    );

    const user = cleanUser(result.rows[0]);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    console.log('updated DB user', user);

    res.json({ user });
  } catch (err) {
    console.error('Erreur users/me/name:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

app.put('/api/users/me/name', requireAuth, updateMyName);
app.put('/api/user/me/name', requireAuth, updateMyName);

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
      [req.user.id]
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
        req.user.id,
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
      const result = await pool.query(reviewSelectSql('WHERE r.spot_id = $1'), [spotId]);
      console.log('reviews with joined users', result.rows);
      return res.json(result.rows);
    }

    const result = await pool.query(reviewSelectSql());
    console.log('reviews with joined users', result.rows);

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
      [String(req.user.id)]
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
      [String(req.user.id), spotId]
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
      [String(req.user.id), req.params.spotId]
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

    const result = await pool.query(reviewSelectSql('WHERE r.spot_id = $1'), [spotId]);

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

    const user = await getCurrentReviewUser(req.user);

    const insertResult = await pool.query(
      `INSERT INTO reviews (spot_id, user_id, user_name, text, rating)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [spotId, req.user.id, user.name, text, 5]
    );
    console.log('review insert user_id', req.user.id);
    const result = await pool.query(reviewSelectSql('WHERE r.id = $1'), [insertResult.rows[0].id]);

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
  if (text.length > 500) {
    return res.status(400).json({ error: 'Commentaire trop long (500 max)' });
  }

  try {
    const user = await getCurrentReviewUser(req.user);

    const insertResult = await pool.query(
      `
      INSERT INTO reviews
      (
        spot_id,
        user_id,
        user_name,
        text,
        rating
      )
      VALUES
      ($1,$2,$3,$4,$5)
      RETURNING id
      `,
      [spot_id, req.user.id, user.name, text, Math.min(5, Math.max(1, rating))]
    );
    console.log('review insert user_id', req.user.id);
    const result = await pool.query(reviewSelectSql('WHERE r.id = $1'), [insertResult.rows[0].id]);

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Erreur ajout avis'
    });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'Route API introuvable'
  });
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

