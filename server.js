// ===== IMPORTATIONS =====
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { Pool } = require('pg');

// ===== INITIALISATION =====
const app = express();

app.use(cors());
app.use(express.json());

console.log('🚀 Démarrage du serveur...');

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

// ===== ROUTE TEST =====
app.get('/test', (req, res) => {
  res.json({
    message: '✅ Le serveur fonctionne !'
  });
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

// ===== ROUTE : AJOUTER UN SPOT =====
app.post('/api/spots', async (req, res) => {

  const {
    name,
    city,
    type,
    district,
    wifi,
    quiet,
    comfort,
    eco,
    description
  } = req.body;

  try {

    const score =
      (
        (Number(wifi) +
        Number(quiet) +
        Number(comfort) +
        Number(eco)) / 4
      ).toFixed(1);

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
        description
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
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
        description
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: 'Erreur ajout spot'
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

  console.log(`- Spots : http://localhost:${PORT}/api/spots`);

  console.log(`- Avis : http://localhost:${PORT}/api/reviews`);
});