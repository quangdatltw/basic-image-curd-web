const express = require('express');
const multer = require('multer');
const { Storage } = require('@google-cloud/storage');
const { CloudSQL } = require('@google-cloud/cloud-sql-connector');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const port = 8080;

// Configure Google Cloud Storage
const storage = new Storage();
const bucket = storage.bucket('your-bucket-name'); // Replace with your bucket name

// Configure Multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Configure Cloud SQL connection
const sqlConfig = {
    host: 'your-cloud-sql-public-ip', // Replace with Cloud SQL public IP
    user: 'root',
    password: 'your-password', // Replace with your password
    database: 'image_db'
};

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Page 1: Upload image with description and date
app.get('/', (req, res) => {
    res.render('upload');
});

app.post('/upload', upload.single('image'), async (req, res) => {
    try {
        const { description, upload_date } = req.body;
        const file = req.file;

        // Upload image to Cloud Storage
        const blob = bucket.file(file.originalname);
        const blobStream = blob.createWriteStream();
        blobStream.end(require('fs').readFileSync(file.path));
        await new Promise((resolve, reject) => {
            blobStream.on('finish', resolve);
            blobStream.on('error', reject);
        });

        // Make the file publicly accessible
        await blob.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;

        // Save metadata to Cloud SQL
        const connection = await mysql.createConnection(sqlConfig);
        await connection.execute(
            'INSERT INTO images (name, url, description, upload_date) VALUES (?, ?, ?, ?)',
            [file.originalname, publicUrl, description, upload_date]
        );
        await connection.end();

        res.redirect('/gallery');
    } catch (error) {
        console.error(error);
        res.send('Error uploading image');
    }
});

// Page 2: Display gallery
app.get('/gallery', async (req, res) => {
    try {
        const connection = await mysql.createConnection(sqlConfig);
        const [images] = await connection.execute('SELECT * FROM images');
        await connection.end();
        res.render('gallery', { images });
    } catch (error) {
        console.error(error);
        res.send('Error fetching images');
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});