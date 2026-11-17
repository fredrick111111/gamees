const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 5000;

app.use(cors());

// Ruhusu mizigo mikubwa ya JSON na URL encoded (hadi GB 2)
app.use(express.json({ limit: '2gb' }));
app.use(express.urlencoded({ limit: '2gb', extended: true }));

// Hakikisha folda ya uploads ipo
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Sanidi Multer kwa ajili ya kuhifadhi picha na faili za magemu
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2 GB Limit kwa ajili ya mafaili makubwa
});

// Muunganisho wa Database ya MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'gamevault_db'
});

db.connect((err) => {
    if (err) {
        console.error('Hitilafu ya kuunganisha na MySQL:', err);
        return;
    }
    console.log('Server inafanya kazi kikamilifu kwenye Port 5000!');
});

// 1. API ya Kupata Magemu yote
app.get('/api/games', (req, res) => {
    db.query('SELECT * FROM games', (err, results) => {
        if (err) {
            console.error('Hitilafu:', err);
            return res.status(500).json({ error: 'Imeshindikana kupata magemu' });
        }
        res.json(results);
    });
});

// 2. API ya Admin: Kuongeza Mchezo Mpya (Pamoja na Picha na Faili la PC)
app.post('/api/games', upload.fields([
    { name: 'gameImage', maxCount: 1 },
    { name: 'gameFile', maxCount: 1 }
]), (req, res) => {
    const { title, price, description } = req.body;
    
    const imageUrl = req.files && req.files['gameImage'] ? `/uploads/${req.files['gameImage'][0].filename}` : null;
    const filePath = req.files && req.files['gameFile'] ? `/uploads/${req.files['gameFile'][0].filename}` : null;

    if (!title || !price || !filePath) {
        return res.status(400).json({ success: false, message: 'Tafadhali jaza jina, bei, na chagua faili la mchezo!' });
    }

    const query = 'INSERT INTO games (title, price, description, file_path, image_url) VALUES (?, ?, ?, ?, ?)';
    db.query(query, [title, price, description || 'Hakuna maelezo.', filePath, imageUrl], (err, result) => {
        if (err) {
            console.error('Hitilafu ya Database:', err);
            return res.status(500).json({ success: false, message: 'Imeshindikana kuhifadhi mchezo kwenye database.' });
        }
        res.json({ success: true, message: 'Mchezo na faili lake vimehifadhiwa kikamilifu!' });
    });
});

// 3. API ya Admin: Kutengeneza Kodi Maalum kwa Ajili ya Mchezo Fulani Tu
app.post('/api/generate-license', (req, res) => {
    const { game_id } = req.body;

    if (!game_id) {
        return res.status(400).json({ success: false, message: 'Chagua mchezo wa kutengenezea kodi!' });
    }

    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    const licenseCode = `GV-${randomPart}-2026`;

    const query = 'INSERT INTO game_licenses (game_id, license_code, is_used) VALUES (?, ?, false)';
    db.query(query, [game_id, licenseCode], (err, result) => {
        if (err) {
            console.error('Hitilafu ya License:', err);
            return res.status(500).json({ success: false, message: 'Imeshindikana kuzalisha kodi.' });
        }
        res.json({ success: true, code: licenseCode });
    });
});

// 4. API ya Kudhibitisha Kodi Maalum wakati wa Kununua Mchezo
app.post('/api/verify-license', (req, res) => {
    const { game_id, license_code } = req.body;

    if (!game_id || !license_code) {
        return res.status(400).json({ success: false, message: 'Taarifa hazijajaa vizuri.' });
    }

    const query = 'SELECT * FROM game_licenses WHERE license_code = ? AND game_id = ?';
    db.query(query, [license_code, game_id], (err, results) => {
        if (err || results.length === 0) {
            return res.json({ success: false, message: 'Kodi hii si sahihi au haihusiki na mchezo huu!' });
        }

        const license = results[0];
        if (license.is_used) {
            return res.json({ success: false, message: 'Kodi hii ISHATUMIKA tayari kwenye mchezo huu!' });
        }

        // Weka alama kuwa kodi imetumika isitumike tena
        db.query('UPDATE game_licenses SET is_used = true WHERE id = ?', [license.id], (updateErr) => {
            if (updateErr) {
                return res.status(500).json({ success: false, message: 'Hitilafu ya seva.' });
            }
            res.json({ success: true, message: 'Kodi imethibitishwa!' });
        });
    });
});

// 5. API ya Usajili wa Watumiaji
app.post('/api/register', (req, res) => {
    const { username, email, phone, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ success: false, message: 'Tafadhali jaza taarifa zote muhimu!' });
    }

    const checkQuery = 'SELECT * FROM users WHERE email = ?';
    db.query(checkQuery, [email], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Hitilafu ya seva.' });
        }

        if (results.length > 0) {
            return res.status(400).json({ success: false, message: 'Barua pepe hii imeshachukuliwa tayari.' });
        }

        const insertQuery = 'INSERT INTO users (username, email, phone, password) VALUES (?, ?, ?, ?)';
        db.query(insertQuery, [username, email, phone || 'Haikuwekwa', password], (err, result) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Imeshindikana kusajili mtumiaji.' });
            }
            res.json({ success: true, message: 'Akaunti imefunguliwa kwa mafanikio!' });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Server inasikiliza kwenye http://localhost:${PORT}`);
});