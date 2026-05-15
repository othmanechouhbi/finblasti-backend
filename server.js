// ===== IMPORTATIONS =====
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { Pool } = require('pg');

const multer = require('multer');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v2: cloudinary } = require('cloudinary');
const { Resend } = require('resend');

// ===== INITIALISATION =====
const app = express();

app.use(cors());
app.use(express.json());

console.log('🚀 Démarrage du serveur...');

// ===== CONFIGURATION CLOUDINARY =====
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ===== CONFIGURATION RESEND =====
const resend = new Resend(process.env.RESEND_API_KEY);

// ===== CONFIGURATION UPLOAD PHOTO =====
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 Mo max
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
pool.query('SELECT NOW()', (err, res) => {
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

// ===== ROUTE : DEMANDER UN CODE DE CONNEXION =====
app.post('/api/auth/request-code', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!email || !email.includes('@')) {
      return res.status(400).json({
        error: 'Email invalide'
      });
    }

    const code = generateCode();
    const codeHash = hashCode(code);

    const result = await pool.query(
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

    await resend.emails.send({
      from: 'FinBlasti <onboarding@resend.dev>',
      to: email,
      subject: 'Ton code de connexion FinBlasti',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Connexion FinBlasti</h2>
          <p>Voici ton code de vérification :</p>
          <h1 style="letter-spacing: 4px;">${code}</h1>
          <p>Ce code expire dans 10 minutes.</p>
        </div>
      `
    });

    console.log(`✅ Code envoyé à ${email}`);

    res.json({
      message: 'Code envoyé par email'
    });

  } catch (err) {
    console.error('❌ Erreur request-code:', err);

    res.status(500).json({
      error: 'Erreur lors de l’envoi du code'
    });
  }
});

// ===== ROUTE : VÉRIFIER LE CODE =====
app.post('/api/auth/verify-code', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();
    const name = String(req.body.name || '').trim();

    if (!email || !code) {
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
        user_id
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
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
        req.user.userId
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
    const result = await pool.query(
      'SELECT * FROM reviews ORDER BY created_at DESC'
    );

    res.json(result.rows);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

// ===== ROUTE : AJOUTER AVIS =====
app.post('/api/reviews', async (req, res) => {
  const {
    spot_id,
    user_name,
    text,
    rating
  } = req.body;

  try {
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
      [
        spot_id,
        user_name,
        text,
        rating
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Erreur ajout avis'
    });
  }
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