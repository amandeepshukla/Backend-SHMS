const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dc_management_secret_key';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// In-memory database (replace with real database in production)
let database = {
    dcs: [
        {
            id: 1,
            name: 'John Doe',
            employeeId: 'DC001',
            contact: '9876543210',
            hostelType: 'boys',
            specificHostel: 'himgiri',
            floor: 'first',
            assignedDC: 'himgiri_first_1',
            profilePic: null,
            password: '$2a$10$example', // bcrypt hashed password
            email: 'john.doe@university.edu'
        }
    ],
    students: [
        { id: 1, name: 'Student 1', rollNumber: 'ST001', hostel: 'himgiri', floor: 'first', room: '101', present: true },
        { id: 2, name: 'Student 2', rollNumber: 'ST002', hostel: 'himgiri', floor: 'first', room: '102', present: true },
        { id: 3, name: 'Student 3', rollNumber: 'ST003', hostel: 'himgiri', floor: 'first', room: '103', present: false }
    ],
    complaints: [
        {
            id: 1,
            title: 'Room 205 - AC Not Working',
            description: 'The air conditioning unit has been making loud noises and not cooling properly.',
            submittedBy: 'Sarah Johnson',
            room: '205',
            priority: 'High',
            status: 'Open',
            timestamp: new Date()
        },
        {
            id: 2,
            title: 'Mess Food Quality',
            description: 'Food quality has decreased in the past week. Please check with kitchen staff.',
            submittedBy: 'Mike Chen',
            room: '312',
            priority: 'Medium',
            status: 'Open',
            timestamp: new Date()
        }
    ],
    ironBorrowing: [
        { ironId: 1, available: true, borrowedBy: null, borrowedAt: null, returnBy: null },
        { ironId: 2, available: true, borrowedBy: null, borrowedAt: null, returnBy: null },
        { ironId: 3, available: false, borrowedBy: 'John Doe', borrowedAt: new Date(), returnBy: new Date(Date.now() + 4*60*60*1000) },
        { ironId: 4, available: true, borrowedBy: null, borrowedAt: null, returnBy: null },
        { ironId: 5, available: false, borrowedBy: 'Jane Smith', borrowedAt: new Date(), returnBy: new Date(Date.now() + 2*60*60*1000) }
    ],
    attendance: [
        { studentId: 1, date: new Date().toISOString().split('T')[0], present: true, method: 'manual' },
        { studentId: 2, date: new Date().toISOString().split('T')[0], present: true, method: 'face_recognition' }
    ]
};

// Middleware to verify JWT token
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

// Authentication Routes
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const dc = database.dcs.find(dc => dc.email === email);
        if (!dc) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, dc.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: dc.id, email: dc.email, employeeId: dc.employeeId },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            dc: {
                id: dc.id,
                name: dc.name,
                employeeId: dc.employeeId,
                email: dc.email,
                contact: dc.contact,
                hostelType: dc.hostelType,
                specificHostel: dc.specificHostel,
                floor: dc.floor,
                profilePic: dc.profilePic
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, employeeId, contact } = req.body;
        
        if (!name || !email || !password || !employeeId) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Check if DC already exists
        const existingDC = database.dcs.find(dc => dc.email === email || dc.employeeId === employeeId);
        if (existingDC) {
            return res.status(400).json({ error: 'DC with this email or employee ID already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newDC = {
            id: database.dcs.length + 1,
            name,
            email,
            employeeId,
            contact: contact || '',
            password: hashedPassword,
            hostelType: '',
            specificHostel: '',
            floor: '',
            assignedDC: '',
            profilePic: null
        };

        database.dcs.push(newDC);

        res.json({
            success: true,
            message: 'DC registered successfully',
            dc: {
                id: newDC.id,
                name: newDC.name,
                email: newDC.email,
                employeeId: newDC.employeeId
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DC Profile Routes
app.get('/api/dc/profile', authenticateToken, (req, res) => {
    try {
        const dc = database.dcs.find(dc => dc.id === req.user.id);
        if (!dc) {
            return res.status(404).json({ error: 'DC not found' });
        }

        res.json({
            success: true,
            dc: {
                id: dc.id,
                name: dc.name,
                employeeId: dc.employeeId,
                email: dc.email,
                contact: dc.contact,
                hostelType: dc.hostelType,
                specificHostel: dc.specificHostel,
                floor: dc.floor,
                assignedDC: dc.assignedDC,
                profilePic: dc.profilePic
            }
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/api/dc/profile', authenticateToken, (req, res) => {
    try {
        const { name, contact, hostelType, specificHostel, floor, assignedDC } = req.body;
        
        const dcIndex = database.dcs.findIndex(dc => dc.id === req.user.id);
        if (dcIndex === -1) {
            return res.status(404).json({ error: 'DC not found' });
        }

        database.dcs[dcIndex] = {
            ...database.dcs[dcIndex],
            name: name || database.dcs[dcIndex].name,
            contact: contact || database.dcs[dcIndex].contact,
            hostelType: hostelType || database.dcs[dcIndex].hostelType,
            specificHostel: specificHostel || database.dcs[dcIndex].specificHostel,
            floor: floor || database.dcs[dcIndex].floor,
            assignedDC: assignedDC || database.dcs[dcIndex].assignedDC
        };

        res.json({
            success: true,
            message: 'Profile updated successfully',
            dc: database.dcs[dcIndex]
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Profile Picture Routes
app.post('/api/dc/profile-picture', authenticateToken, upload.single('profilePic'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const dcIndex = database.dcs.findIndex(dc => dc.id === req.user.id);
        if (dcIndex === -1) {
            return res.status(404).json({ error: 'DC not found' });
        }

        // Remove old profile picture if exists
        if (database.dcs[dcIndex].profilePic) {
            const oldPath = path.join(__dirname, 'uploads', database.dcs[dcIndex].profilePic);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        database.dcs[dcIndex].profilePic = req.file.filename;

        res.json({
            success: true,
            message: 'Profile picture uploaded successfully',
            profilePic: `/uploads/${req.file.filename}`
        });
    } catch (error) {
        console.error('Upload profile picture error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/dc/profile-picture', authenticateToken, (req, res) => {
    try {
        const dcIndex = database.dcs.findIndex(dc => dc.id === req.user.id);
        if (dcIndex === -1) {
            return res.status(404).json({ error: 'DC not found' });
        }

        if (database.dcs[dcIndex].profilePic) {
            const filePath = path.join(__dirname, 'uploads', database.dcs[dcIndex].profilePic);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        database.dcs[dcIndex].profilePic = null;

        res.json({
            success: true,
            message: 'Profile picture removed successfully'
        });
    } catch (error) {
        console.error('Remove profile picture error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Dashboard Statistics Routes
app.get('/api/dashboard/stats', authenticateToken, (req, res) => {
    try {
        const dc = database.dcs.find(dc => dc.id === req.user.id);
        if (!dc) {
            return res.status(404).json({ error: 'DC not found' });
        }

        // Filter students by DC's assigned hostel and floor
        const assignedStudents = database.students.filter(student => 
            student.hostel === dc.specificHostel && student.floor === dc.floor
        );

        const totalStudents = assignedStudents.length;
        const presentToday = assignedStudents.filter(student => student.present).length;
        const ironsBorrowed = database.ironBorrowing.filter(iron => !iron.available).length;
        const totalComplaints = database.complaints.filter(complaint => complaint.status === 'Open').length;
        const availableIrons = database.ironBorrowing.filter(iron => iron.available).length;

        res.json({
            success: true,
            stats: {
                totalStudents,
                presentToday,
                ironsBorrowed,
                totalComplaints,
                availableIrons,
                totalRooms: 120,
                messStatus: 'Active',
                laundryStatus: '24/7',
                securityLevel: 'High'
            }
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Student Management Routes
app.get('/api/students', authenticateToken, (req, res) => {
    try {
        const dc = database.dcs.find(dc => dc.id === req.user.id);
        if (!dc) {
            return res.status(404).json({ error: 'DC not found' });
        }

        const assignedStudents = database.students.filter(student => 
            student.hostel === dc.specificHostel && student.floor === dc.floor
        );

        res.json({
            success: true,
            students: assignedStudents
        });
    } catch (error) {
        console.error('Get students error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Attendance Routes
app.post('/api/attendance/manual', authenticateToken, (req, res) => {
    try {
        const { studentId, present } = req.body;
        
        if (!studentId || present === undefined) {
            return res.status(400).json({ error: 'Student ID and present status are required' });
        }

        const student = database.students.find(s => s.id === parseInt(studentId));
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const today = new Date().toISOString().split('T')[0];
        
        // Update or create attendance record
        const existingAttendance = database.attendance.find(
            a => a.studentId === parseInt(studentId) && a.date === today
        );

        if (existingAttendance) {
            existingAttendance.present = present;
            existingAttendance.method = 'manual';
        } else {
            database.attendance.push({
                studentId: parseInt(studentId),
                date: today,
                present,
                method: 'manual'
            });
        }

        // Update student's present status
        student.present = present;

        res.json({
            success: true,
            message: 'Attendance updated successfully'
        });
    } catch (error) {
        console.error('Manual attendance error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/attendance/face-recognition', authenticateToken, (req, res) => {
    try {
        const { studentId } = req.body;
        
        if (!studentId) {
            return res.status(400).json({ error: 'Student ID is required' });
        }

        const student = database.students.find(s => s.id === parseInt(studentId));
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const today = new Date().toISOString().split('T')[0];
        
        const existingAttendance = database.attendance.find(
            a => a.studentId === parseInt(studentId) && a.date === today
        );

        if (existingAttendance) {
            existingAttendance.present = true;
            existingAttendance.method = 'face_recognition';
        } else {
            database.attendance.push({
                studentId: parseInt(studentId),
                date: today,
                present: true,
                method: 'face_recognition'
            });
        }

        student.present = true;

        res.json({
            success: true,
            message: 'Face recognition attendance recorded successfully',
            student: {
                id: student.id,
                name: student.name,
                rollNumber: student.rollNumber
            }
        });
    } catch (error) {
        console.error('Face recognition attendance error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/attendance/qr-code', authenticateToken, (req, res) => {
    try {
        const { qrData } = req.body;
        
        if (!qrData) {
            return res.status(400).json({ error: 'QR data is required' });
        }

        // Parse QR data (assuming format: "STUDENT_ID:TIMESTAMP")
        const [studentId, timestamp] = qrData.split(':');
        
        if (!studentId || !timestamp) {
            return res.status(400).json({ error: 'Invalid QR code format' });
        }

        const student = database.students.find(s => s.id === parseInt(studentId));
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const today = new Date().toISOString().split('T')[0];
        
        const existingAttendance = database.attendance.find(
            a => a.studentId === parseInt(studentId) && a.date === today
        );

        if (existingAttendance) {
            existingAttendance.present = true;
            existingAttendance.method = 'qr_code';
        } else {
            database.attendance.push({
                studentId: parseInt(studentId),
                date: today,
                present: true,
                method: 'qr_code'
            });
        }

        student.present = true;

        res.json({
            success: true,
            message: 'QR code attendance recorded successfully',
            student: {
                id: student.id,
                name: student.name,
                rollNumber: student.rollNumber
            }
        });
    } catch (error) {
        console.error('QR code attendance error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Generate QR code for attendance
app.get('/api/attendance/generate-qr', authenticateToken, (req, res) => {
    try {
        const timestamp = Date.now();
        const qrData = `ATTENDANCE:${timestamp}:${req.user.id}`;
        
        res.json({
            success: true,
            qrData,
            expiresAt: new Date(timestamp + 5 * 60 * 1000) // Expires in 5 minutes
        });
    } catch (error) {
        console.error('Generate QR error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Complaints Routes
app.get('/api/complaints', authenticateToken, (req, res) => {
    try {
        res.json({
            success: true,
            complaints: database.complaints
        });
    } catch (error) {
        console.error('Get complaints error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/complaints', (req, res) => {
    try {
        const { title, description, submittedBy, room, priority } = req.body;
        
        if (!title || !description || !submittedBy) {
            return res.status(400).json({ error: 'Title, description, and submitter name are required' });
        }

        const newComplaint = {
            id: database.complaints.length + 1,
            title,
            description,
            submittedBy,
            room: room || '',
            priority: priority || 'Medium',
            status: 'Open',
            timestamp: new Date()
        };

        database.complaints.push(newComplaint);

        res.json({
            success: true,
            message: 'Complaint submitted successfully',
            complaint: newComplaint
        });
    } catch (error) {
        console.error('Submit complaint error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/api/complaints/:id/status', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const complaint = database.complaints.find(c => c.id === parseInt(id));
        if (!complaint) {
            return res.status(404).json({ error: 'Complaint not found' });
        }

        complaint.status = status;

        res.json({
            success: true,
            message: 'Complaint status updated successfully',
            complaint
        });
    } catch (error) {
        console.error('Update complaint status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Iron Borrowing Routes
app.get('/api/iron-borrowing', authenticateToken, (req, res) => {
    try {
        res.json({
            success: true,
            irons: database.ironBorrowing
        });
    } catch (error) {
        console.error('Get iron borrowing error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/iron-borrowing/borrow', authenticateToken, (req, res) => {
    try {
        const { ironId, borrowerName, room, duration } = req.body;
        
        if (!ironId || !borrowerName) {
            return res.status(400).json({ error: 'Iron ID and borrower name are required' });
        }

        const iron = database.ironBorrowing.find(i => i.ironId === parseInt(ironId));
        if (!iron) {
            return res.status(404).json({ error: 'Iron not found' });
        }

        if (!iron.available) {
            return res.status(400).json({ error: 'Iron is already borrowed' });
        }

        iron.available = false;
        iron.borrowedBy = borrowerName;
        iron.borrowedAt = new Date();
        iron.returnBy = new Date(Date.now() + (duration || 4) * 60 * 60 * 1000); // Default 4 hours
        iron.room = room;

        res.json({
            success: true,
            message: 'Iron borrowed successfully',
            iron
        });
    } catch (error) {
        console.error('Borrow iron error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/iron-borrowing/return', authenticateToken, (req, res) => {
    try {
        const { ironId } = req.body;
        
        if (!ironId) {
            return res.status(400).json({ error: 'Iron ID is required' });
        }

        const iron = database.ironBorrowing.find(i => i.ironId === parseInt(ironId));
        if (!iron) {
            return res.status(404).json({ error: 'Iron not found' });
        }

        if (iron.available) {
            return res.status(400).json({ error: 'Iron is not currently borrowed' });
        }

        iron.available = true;
        iron.borrowedBy = null;
        iron.borrowedAt = null;
        iron.returnBy = null;
        iron.room = null;

        res.json({
            success: true,
            message: 'Iron returned successfully',
            iron
        });
    } catch (error) {
        console.error('Return iron error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
        }
    }
    
    if (error.message === 'Only image files are allowed') {
        return res.status(400).json({ error: error.message });
    }
    
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
    console.log(`DC Management Backend Server running on port ${PORT}`);
    console.log(`Server started at: ${new Date().toISOString()}`);
});

module.exports = app;
