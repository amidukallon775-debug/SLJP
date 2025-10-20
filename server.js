// Backend Server (Node.js/Express)
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'your_jwt_secret_key';

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Database initialization
const db = new sqlite3.Database(':memory:');

// Create tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    user_type TEXT,
    district TEXT,
    phone TEXT,
    skills TEXT,
    education TEXT,
    experience TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Jobs table
  db.run(`CREATE TABLE jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    company TEXT,
    location TEXT,
    district TEXT,
    type TEXT,
    experience TEXT,
    salary TEXT,
    category TEXT,
    description TEXT,
    requirements TEXT,
    is_remote BOOLEAN DEFAULT 0,
    is_green_job BOOLEAN DEFAULT 0,
    employer_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    FOREIGN KEY(employer_id) REFERENCES users(id)
  )`);

  // Applications table
  db.run(`CREATE TABLE applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER,
    user_id INTEGER,
    status TEXT DEFAULT 'pending',
    cover_letter TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(job_id) REFERENCES jobs(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Districts table
  db.run(`CREATE TABLE districts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    region TEXT,
    coordinates TEXT
  )`);

  // Insert districts
  const districts = [
    { name: "Western Area Urban (Freetown)", region: "Western", coordinates: "8.484, -13.229" },
    { name: "Western Area Rural", region: "Western", coordinates: "8.333, -13.035" },
    { name: "Port Loko", region: "North West", coordinates: "8.766, -12.787" },
    { name: "Bombali", region: "Northern", coordinates: "9.276, -12.058" },
    { name: "Kambia", region: "North West", coordinates: "9.125, -12.918" },
    { name: "Karene", region: "Northern", coordinates: "9.050, -12.450" },
    { name: "Tonkolili", region: "Northern", coordinates: "8.683, -11.667" },
    { name: "Koinadugu", region: "Northern", coordinates: "9.500, -11.417" },
    { name: "Falaba", region: "Northern", coordinates: "9.750, -11.250" },
    { name: "Bo", region: "Southern", coordinates: "7.964, -11.739" },
    { name: "Moyamba", region: "Southern", coordinates: "8.158, -12.431" },
    { name: "Bonthe", region: "Southern", coordinates: "7.526, -12.505" },
    { name: "Pujehun", region: "Southern", coordinates: "7.350, -11.717" },
    { name: "Kenema", region: "Eastern", coordinates: "7.876, -11.190" },
    { name: "Kailahun", region: "Eastern", coordinates: "8.279, -10.573" },
    { name: "Kono", region: "Eastern", coordinates: "8.646, -10.971" }
  ];

  const insertDistrict = db.prepare(`INSERT INTO districts (name, region, coordinates) VALUES (?, ?, ?)`);
  districts.forEach(district => {
    insertDistrict.run(district.name, district.region, district.coordinates);
  });
  insertDistrict.finalize();

  // Insert sample data
  const insertUser = db.prepare(`INSERT INTO users (email, password, name, user_type, district, skills) VALUES (?, ?, ?, ?, ?, ?)`);
  insertUser.run('admin@slyouthjobs.com', bcrypt.hashSync('admin123', 10), 'Admin User', 'admin', 'Western Area Urban (Freetown)', 'Management,Administration');
  insertUser.run('employer@techsl.com', bcrypt.hashSync('employer123', 10), 'Tech Sierra Leone', 'employer', 'Western Area Urban (Freetown)', '');
  insertUser.run('jobseeker@example.com', bcrypt.hashSync('user123', 10), 'John Doe', 'jobseeker', 'Bo', 'JavaScript,HTML,CSS,Communication');
  insertUser.finalize();

  const insertJob = db.prepare(`INSERT INTO jobs (title, company, location, district, type, experience, salary, category, description, requirements, employer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertJob.run(
    'Junior Software Developer',
    'Tech Sierra Leone',
    'Freetown',
    'Western Area Urban (Freetown)',
    'Full-time',
    'Entry Level',
    'SLL 800,000 - 1,200,000',
    'technology',
    'We\'re looking for a passionate junior developer to join our growing team. Knowledge of JavaScript and web development required.',
    'Bachelor\'s degree in Computer Science or related field, Knowledge of JavaScript, HTML, CSS',
    2
  );
  insertJob.run(
    'Community Health Worker',
    'Health for All SL',
    'Bo',
    'Bo',
    'Full-time',
    'Entry Level',
    'SLL 600,000 - 900,000',
    'healthcare',
    'Join our community health initiative to provide basic healthcare services in rural areas. Training will be provided.',
    'High school diploma, Good communication skills, Willingness to work in rural areas',
    2
  );
  insertJob.finalize();
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Routes

// Get all districts
app.get('/api/districts', (req, res) => {
  db.all('SELECT * FROM districts ORDER BY name', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get jobs with filtering
app.get('/api/jobs', (req, res) => {
  const { category, district, experience, search, remote, green } = req.query;
  
  let query = `SELECT j.*, u.name as company_name FROM jobs j 
               LEFT JOIN users u ON j.employer_id = u.id 
               WHERE 1=1`;
  let params = [];
  
  if (category) {
    query += ' AND j.category = ?';
    params.push(category);
  }
  
  if (district) {
    query += ' AND j.district = ?';
    params.push(district);
  }
  
  if (experience) {
    query += ' AND j.experience = ?';
    params.push(experience);
  }
  
  if (search) {
    query += ' AND (j.title LIKE ? OR j.description LIKE ? OR j.company LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }
  
  if (remote === 'true') {
    query += ' AND j.is_remote = 1';
  }
  
  if (green === 'true') {
    query += ' AND j.is_green_job = 1';
  }
  
  query += ' ORDER BY j.created_at DESC';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get job by ID
app.get('/api/jobs/:id', (req, res) => {
  const { id } = req.params;
  
  db.get(`SELECT j.*, u.name as company_name, u.email as company_email 
          FROM jobs j 
          LEFT JOIN users u ON j.employer_id = u.id 
          WHERE j.id = ?`, [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(row);
  });
});

// User registration
app.post('/api/register', async (req, res) => {
  const { email, password, name, userType, district, phone, skills } = req.body;

  if (!email || !password || !name || !userType) {
    return res.status(400).json({ error: 'Email, password, name, and user type are required' });
  }

  try {
    // Check if user already exists
    db.get('SELECT id FROM users WHERE email = ?', [email], async (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (row) {
        return res.status(400).json({ error: 'User already exists with this email' });
      }
      
      // Hash password and create user
      const hashedPassword = await bcrypt.hash(password, 10);
      
      db.run(`INSERT INTO users (email, password, name, user_type, district, phone, skills) 
              VALUES (?, ?, ?, ?, ?, ?, ?)`, 
        [email, hashedPassword, name, userType, district, phone, skills], 
        function(err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          
          // Generate JWT token
          const token = jwt.sign(
            { id: this.lastID, email, userType }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
          );
          
          res.status(201).json({
            message: 'User created successfully',
            token,
            user: { id: this.lastID, email, name, userType, district }
          });
        }
      );
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// User login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    
    try {
      const isValidPassword = await bcrypt.compare(password, user.password);
      
      if (!isValidPassword) {
        return res.status(400).json({ error: 'Invalid email or password' });
      }
      
      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, email: user.email, userType: user.user_type }, 
        JWT_SECRET, 
        { expiresIn: '24h' }
      );
      
      res.json({
        message: 'Login successful',
        token,
        user: { 
          id: user.id, 
          email: user.email, 
          name: user.name, 
          userType: user.user_type,
          district: user.district,
          skills: user.skills ? user.skills.split(',') : []
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Server error during login' });
    }
  });
});

// Create a job (employers only)
app.post('/api/jobs', authenticateToken, (req, res) => {
  const user = req.user;
  
  if (user.userType !== 'employer') {
    return res.status(403).json({ error: 'Only employers can post jobs' });
  }
  
  const { 
    title, company, location, district, type, experience, salary, 
    category, description, requirements, is_remote, is_green_job 
  } = req.body;
  
  if (!title || !company || !location || !district || !type || !category || !description) {
    return res.status(400).json({ error: 'Required fields are missing' });
  }
  
  // Calculate expiration date (30 days from now)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  
  db.run(`INSERT INTO jobs 
          (title, company, location, district, type, experience, salary, category, 
           description, requirements, is_remote, is_green_job, employer_id, expires_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
    [title, company, location, district, type, experience, salary, category, 
     description, requirements, is_remote ? 1 : 0, is_green_job ? 1 : 0, user.id, expiresAt.toISOString()], 
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.status(201).json({
        message: 'Job posted successfully',
        jobId: this.lastID
      });
    }
  );
});

// Apply for a job
app.post('/api/applications', authenticateToken, (req, res) => {
  const user = req.user;
  const { jobId, coverLetter } = req.body;
  
  if (user.userType !== 'jobseeker') {
    return res.status(403).json({ error: 'Only job seekers can apply for jobs' });
  }
  
  if (!jobId) {
    return res.status(400).json({ error: 'Job ID is required' });
  }
  
  // Check if user already applied
  db.get('SELECT id FROM applications WHERE job_id = ? AND user_id = ?', [jobId, user.id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (row) {
      return res.status(400).json({ error: 'You have already applied for this job' });
    }
    
    // Create application
    db.run('INSERT INTO applications (job_id, user_id, cover_letter) VALUES (?, ?, ?)', 
      [jobId, user.id, coverLetter || ''], 
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        res.status(201).json({
          message: 'Application submitted successfully',
          applicationId: this.lastID
        });
      }
    );
  });
});

// Get user's applications
app.get('/api/my-applications', authenticateToken, (req, res) => {
  const user = req.user;
  
  db.all(`SELECT a.*, j.title, j.company, j.location, j.district 
          FROM applications a 
          JOIN jobs j ON a.job_id = j.id 
          WHERE a.user_id = ? 
          ORDER BY a.created_at DESC`, 
    [user.id], 
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json(rows);
    }
  );
});

// Get job statistics by district
app.get('/api/stats/districts', (req, res) => {
  db.all(`SELECT d.name, COUNT(j.id) as job_count 
          FROM districts d 
          LEFT JOIN jobs j ON d.name = j.district 
          GROUP BY d.name 
          ORDER BY job_count DESC`, 
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json(rows);
    }
  );
});

// Start server
app.listen(PORT, () => {
  console.log(`SL Youth Jobs server running on port ${PORT}`);
});