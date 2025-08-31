// routes/index.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const dbManager = require('../database');
const { authenticateToken, rateLimit, sanitizeInput, formatResponse } = require('../middleware/auth');

const router = express.Router();

// Apply middleware to all routes
router.use(formatResponse);
router.use(sanitizeInput);

// File upload configuration
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
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files (JPEG, JPG, PNG, GIF) are allowed'));
        }
    }
});

// ===== AUTHENTICATION ROUTES =====

// User Registration
router.post('/auth/register', rateLimit(15 * 60 * 1000, 10), async (req, res) => {
    try {
        const { name, email, password, employeeId, contact, hostelType, specificHostel, floor } = req.body;
        
        if (!name || !email || !password || !employeeId) {
            return res.apiError('Name, email, password, and employee ID are required', 400);
        }

        // Check if DC already exists
        const existingDC = dbManager.database.dcs.find(dc => 
            dc.email === email || dc.employeeId === employeeId
        );
        
        if (existingDC) {
            return res.apiError('DC with this email or employee ID already exists', 409);
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create new DC
        const newDC = dbManager.createDC({
            name,
            email,
            employeeId,
            contact: contact || '',
            password: hashedPassword,
            hostelType: hostelType || '',
            specificHostel: specificHostel || '',
            floor: floor || '',
            assignedDC: '',
            profilePic: null,
            role: 'dc',
            isActive: true
        });

        // Generate token
        const token = jwt.sign(
            { id: newDC.id, email: newDC.email, employeeId: newDC.employeeId },
            process.env.JWT_SECRET || 'dc_management_secret_key',
            { expiresIn: '24h' }
        );

        res.apiSuccess({
            token,
            dc: {
                id: newDC.id,
                name: newDC.name,
                email: newDC.email,
                employeeId: newDC.employeeId,
                contact: newDC.contact,
                hostelType: newDC.hostelType
            }
        }, 'Registration successful', 201);

    } catch (error) {
        console.error('Registration error:', error);
        res.apiError('Registration failed', 500);
    }
});

// User Login
router.post('/auth/login', rateLimit(15 * 60 * 1000, 20), async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.apiError('Email and password are required', 400);
        }

        // Find DC by email
        const dc = dbManager.database.dcs.find(dc => dc.email === email);
        if (!dc) {
            return res.apiError('Invalid credentials', 401);
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, dc.password);
        if (!validPassword) {
            return res.apiError('Invalid credentials', 401);
        }

        // Check if account is active
        if (!dc.isActive) {
            return res.apiError('Account is deactivated. Please contact administrator', 403);
        }

        // Generate token
        const token = jwt.sign(
            { id: dc.id, email: dc.email, employeeId: dc.employeeId },
            process.env.JWT_SECRET || 'dc_management_secret_key',
            { expiresIn: '24h' }
        );

        res.apiSuccess({
            token,
            dc: {
                id: dc.id,
                name: dc.name,
                email: dc.email,
                employeeId: dc.employeeId,
                contact: dc.contact,
                hostelType: dc.hostelType,
                specificHostel: dc.specificHostel,
                floor: dc.floor,
                profilePic: dc.profilePic
            }
        }, 'Login successful');

    } catch (error) {
        console.error('Login error:', error);
        res.apiError('Login failed', 500);
    }
});

// Logout (client-side token removal, but we can track it)
router.post('/auth/logout', authenticateToken, (req, res) => {
    res.apiSuccess(null, 'Logout successful');
});

// ===== PROFILE MANAGEMENT ROUTES =====

// Get DC Profile
router.get('/dc/profile', authenticateToken, (req, res) => {
    try {
        const dc = req.dcData;
        res.apiSuccess({
            id: dc.id,
            name: dc.name,
            employeeId: dc.employeeId,
            email: dc.email,
            contact: dc.contact,
            hostelType: dc.hostelType,
            specificHostel: dc.specificHostel,
            floor: dc.floor,
            assignedDC: dc.assignedDC,
            profilePic: dc.profilePic ? `/uploads/${dc.profilePic}` : null,
            createdAt: dc.createdAt,
            updatedAt: dc.updatedAt
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.apiError('Failed to fetch profile', 500);
    }
});

// Update DC Profile
router.put('/dc/profile', authenticateToken, (req, res) => {
    try {
        const { name, contact, hostelType, specificHostel, floor, assignedDC } = req.body;
        
        const updatedDC = dbManager.updateDC(req.user.id, {
            name: name || req.dcData.name,
            contact: contact || req.dcData.contact,
            hostelType: hostelType || req.dcData.hostelType,
            specificHostel: specificHostel || req.dcData.specificHostel,
            floor: floor || req.dcData.floor,
            assignedDC: assignedDC || req.dcData.assignedDC
        });

        if (!updatedDC) {
            return res.apiError('Failed to update profile', 404);
        }

        res.apiSuccess({
            id: updatedDC.id,
            name: updatedDC.name,
            contact: updatedDC.contact,
            hostelType: updatedDC.hostelType,
            specificHostel: updatedDC.specificHostel,
            floor: updatedDC.floor,
            assignedDC: updatedDC.assignedDC
        }, 'Profile updated successfully');

    } catch (error) {
        console.error('Update profile error:', error);
        res.apiError('Failed to update profile', 500);
    }
});

// Upload Profile Picture
router.post('/dc/profile-picture', authenticateToken, upload.single('profilePic'), (req, res) => {
    try {
        if (!req.file) {
            return res.apiError('No file uploaded', 400);
        }

        // Remove old profile picture if exists
        const dc = req.dcData;
        if (dc.profilePic) {
            const oldPath = path.join(__dirname, '..', 'uploads', dc.profilePic);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        // Update DC with new profile picture
        const updatedDC = dbManager.updateDC(req.user.id, {
            profilePic: req.file.filename
        });

        res.apiSuccess({
            profilePic: `/uploads/${req.file.filename}`,
            filename: req.file.filename
        }, 'Profile picture uploaded successfully');

    } catch (error) {
        console.error('Upload profile picture error:', error);
        res.apiError('Failed to upload profile picture', 500);
    }
});

// Remove Profile Picture
router.delete('/dc/profile-picture', authenticateToken, (req, res) => {
    try {
        const dc = req.dcData;
        
        if (dc.profilePic) {
            const filePath = path.join(__dirname, '..', 'uploads', dc.profilePic);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        dbManager.updateDC(req.user.id, { profilePic: null });

        res.apiSuccess(null, 'Profile picture removed successfully');

    } catch (error) {
        console.error('Remove profile picture error:', error);
        res.apiError('Failed to remove profile picture', 500);
    }
});

// ===== DASHBOARD STATISTICS ROUTES =====

// Get Dashboard Statistics
router.get('/dashboard/stats', authenticateToken, (req, res) => {
    try {
        const dc = req.dcData;
        const stats = dbManager.getStatistics(dc.specificHostel, dc.floor);
        
        res.apiSuccess({
            ...stats,
            totalRooms: 120,
            messStatus: 'Active',
            laundryStatus: '24/7',
            securityLevel: 'High',
            hostelInfo: {
                name: dc.specificHostel,
                floor: dc.floor,
                type: dc.hostelType
            }
        }, 'Statistics retrieved successfully');

    } catch (error) {
        console.error('Get stats error:', error);
        res.apiError('Failed to fetch statistics', 500);
    }
});

// ===== STUDENT MANAGEMENT ROUTES =====

// Get Students by DC Assignment
router.get('/students', authenticateToken, (req, res) => {
    try {
        const dc = req.dcData;
        const students = dbManager.getStudentsByHostel(dc.specificHostel, dc.floor);
        
        res.apiSuccess(students, 'Students retrieved successfully');

    } catch (error) {
        console.error('Get students error:', error);
        res.apiError('Failed to fetch students', 500);
    }
});

// Get Student by ID
router.get('/students/:id', authenticateToken, (req, res) => {
    try {
        const studentId = parseInt(req.params.id);
        const student = dbManager.database.students.find(s => s.id === studentId);
        
        if (!student) {
            return res.apiError('Student not found', 404);
        }

        res.apiSuccess(student, 'Student retrieved successfully');

    } catch (error) {
        console.error('Get student error:', error);
        res.apiError('Failed to fetch student', 500);
    }
});

// Add New Student
router.post('/students', authenticateToken, (req, res) => {
    try {
        const { name, rollNumber, hostel, floor, room, email, phone } = req.body;
        
        if (!name || !rollNumber || !hostel || !floor || !room) {
            return res.apiError('Name, roll number, hostel, floor, and room are required', 400);
        }

        // Check if student already exists
        const existingStudent = dbManager.database.students.find(s => 
            s.rollNumber === rollNumber
        );
        
        if (existingStudent) {
            return res.apiError('Student with this roll number already exists', 409);
        }

        const newStudent = dbManager.createStudent({
            name,
            rollNumber,
            hostel,
            floor,
            room,
            email: email || '',
            phone: phone || '',
            present: false
        });

        res.apiSuccess(newStudent, 'Student added successfully', 201);

    } catch (error) {
        console.error('Add student error:', error);
        res.apiError('Failed to add student', 500);
    }
});

// ===== ATTENDANCE ROUTES =====

// Record Manual Attendance
router.post('/attendance/manual', authenticateToken, (req, res) => {
    try {
        const { studentId, present } = req.body;
        
        if (!studentId || present === undefined) {
            return res.apiError('Student ID and present status are required', 400);
        }

        const student = dbManager.database.students.find(s => s.id === parseInt(studentId));
        if (!student) {
            return res.apiError('Student not found', 404);
        }

        // Record attendance
        dbManager.recordAttendance({
            studentId: parseInt(studentId),
            present,
            method: 'manual'
        });

        // Update student status
        dbManager.updateStudentAttendance(parseInt(studentId), present);

        res.apiSuccess({
            studentId: parseInt(studentId),
            studentName: student.name,
            present,
            method: 'manual'
        }, 'Attendance recorded successfully');

    } catch (error) {
        console.error('Manual attendance error:', error);
        res.apiError('Failed to record attendance', 500);
    }
});

// Record Face Recognition Attendance
router.post('/attendance/face-recognition', authenticateToken, (req, res) => {
    try {
        const { studentId } = req.body;
        
        if (!studentId) {
            return res.apiError('Student ID is required', 400);
        }

        const student = dbManager.database.students.find(s => s.id === parseInt(studentId));
        if (!student) {
            return res.apiError('Student not found', 404);
        }

        // Record attendance as present
        dbManager.recordAttendance({
            studentId: parseInt(studentId),
            present: true,
            method: 'face_recognition'
        });

        dbManager.updateStudentAttendance(parseInt(studentId), true);

        res.apiSuccess({
            studentId: parseInt(studentId),
            studentName: student.name,
            rollNumber: student.rollNumber,
            present: true,
            method: 'face_recognition'
        }, 'Face recognition attendance recorded successfully');

    } catch (error) {
        console.error('Face recognition attendance error:', error);
        res.apiError('Failed to record face recognition attendance', 500);
    }
});

// Record QR Code Attendance
router.post('/attendance/qr-code', authenticateToken, (req, res) => {
    try {
        const { qrData } = req.body;
        
        if (!qrData) {
            return res.apiError('QR data is required', 400);
        }

        // Parse QR data format: "STUDENT_ID:TIMESTAMP"
        const [studentId, timestamp] = qrData.split(':');
        
        if (!studentId || !timestamp) {
            return res.apiError('Invalid QR code format', 400);
        }

        const student = dbManager.database.students.find(s => s.id === parseInt(studentId));
        if (!student) {
            return res.apiError('Student not found', 404);
        }

        // Verify timestamp is not too old (within 5 minutes)
        const qrTime = parseInt(timestamp);
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        
        if (now - qrTime > fiveMinutes) {
            return res.apiError('QR code has expired', 400);
        }

        // Record attendance
        dbManager.recordAttendance({
            studentId: parseInt(studentId),
            present: true,
            method: 'qr_code'
        });

        dbManager.updateStudentAttendance(parseInt(studentId), true);

        res.apiSuccess({
            studentId: parseInt(studentId),
            studentName: student.name,
            rollNumber: student.rollNumber,
            present: true,
            method: 'qr_code'
        }, 'QR code attendance recorded successfully');

    } catch (error) {
        console.error('QR code attendance error:', error);
        res.apiError('Failed to record QR attendance', 500);
    }
});

// Generate QR Code for Attendance
router.get('/attendance/generate-qr', authenticateToken, (req, res) => {
    try {
        const timestamp = Date.now();
        const qrData = `ATTENDANCE:${timestamp}:${req.user.id}`;
        const expiresAt = new Date(timestamp + 5 * 60 * 1000); // 5 minutes
        
        res.apiSuccess({
            qrData,
            expiresAt,
            validFor: '5 minutes'
        }, 'QR code generated successfully');

    } catch (error) {
        console.error('Generate QR error:', error);
        res.apiError('Failed to generate QR code', 500);
    }
});

// Get Attendance by Date
router.get('/attendance/:date', authenticateToken, (req, res) => {
    try {
        const { date } = req.params;
        const attendance = dbManager.getAttendanceByDate(date);
        
        res.apiSuccess(attendance, 'Attendance records retrieved successfully');

    } catch (error) {
        console.error('Get attendance error:', error);
        res.apiError('Failed to fetch attendance records', 500);
    }
});

// ===== COMPLAINTS ROUTES =====

// Get All Complaints
router.get('/complaints', authenticateToken, (req, res) => {
    try {
        const { status, priority } = req.query;
        let complaints = dbManager.database.complaints;
        
        if (status) {
            complaints = complaints.filter(c => c.status === status);
        }
        
        if (priority) {
            complaints = complaints.filter(c => c.priority === priority);
        }
        
        res.apiSuccess(complaints, 'Complaints retrieved successfully');

    } catch (error) {
        console.error('Get complaints error:', error);
        res.apiError('Failed to fetch complaints', 500);
    }
});

// Submit New Complaint
router.post('/complaints', (req, res) => {
    try {
        const { title, description, submittedBy, room, priority, category, hostel } = req.body;
        
        if (!title || !description || !submittedBy) {
            return res.apiError('Title, description, and submitter name are required', 400);
        }

        const newComplaint = dbManager.createComplaint({
            title,
            description,
            submittedBy,
            room: room || '',
            hostel: hostel || '',
            priority: priority || 'Medium',
            category: category || 'General'
        });

        res.apiSuccess(newComplaint, 'Complaint submitted successfully', 201);

    } catch (error) {
        console.error('Submit complaint error:', error);
        res.apiError('Failed to submit complaint', 500);
    }
});

// Update Complaint Status
router.put('/complaints/:id/status', authenticateToken, (req, res) => {
    try {
        const complaintId = parseInt(req.params.id);
        const { status } = req.body;
        
        const validStatuses = ['Open', 'In Progress', 'Resolved', 'Closed'];
        if (!validStatuses.includes(status)) {
            return res.apiError('Invalid status. Must be: ' + validStatuses.join(', '), 400);
        }

        const updatedComplaint = dbManager.updateComplaintStatus(complaintId, status);
        
        if (!updatedComplaint) {
            return res.apiError('Complaint not found', 404);
        }

        res.apiSuccess(updatedComplaint, 'Complaint status updated successfully');

    } catch (error) {
        console.error('Update complaint status error:', error);
        res.apiError('Failed to update complaint status', 500);
    }
});

// ===== IRON BORROWING ROUTES =====

// Get Iron Borrowing Status
router.get('/iron-borrowing', authenticateToken, (req, res) => {
    try {
        const irons = dbManager.database.ironBorrowing;
        const summary = {
            total: irons.length,
            available: irons.filter(i => i.available).length,
            borrowed: irons.filter(i => !i.available).length,
            irons: irons
        };
        
        res.apiSuccess(summary, 'Iron borrowing status retrieved successfully');

    } catch (error) {
        console.error('Get iron borrowing error:', error);
        res.apiError('Failed to fetch iron borrowing status', 500);
    }
});

// Borrow Iron
router.post('/iron-borrowing/borrow', authenticateToken, (req, res) => {
    try {
        const { ironId, borrowerName, room, duration } = req.body;
        
        if (!ironId || !borrowerName) {
            return res.apiError('Iron ID and borrower name are required', 400);
        }

        const iron = dbManager.borrowIron(parseInt(ironId), {
            borrowerName,
            room: room || '',
            duration: parseInt(duration) || 4
        });

        if (!iron) {
            return res.apiError('Iron not found', 404);
        }

        if (!iron.available) {
            return res.apiError('Iron is already borrowed', 400);
        }

        res.apiSuccess(iron, 'Iron borrowed successfully');

    } catch (error) {
        console.error('Borrow iron error:', error);
        res.apiError('Failed to borrow iron', 500);
    }
});

// Return Iron
router.post('/iron-borrowing/return', authenticateToken, (req, res) => {
    try {
        const { ironId } = req.body;
        
        if (!ironId) {
            return res.apiError('Iron ID is required', 400);
        }

        const iron = dbManager.returnIron(parseInt(ironId));

        if (!iron) {
            return res.apiError('Iron not found', 404);
        }

        res.apiSuccess(iron, 'Iron returned successfully');

    } catch (error) {
        console.error('Return iron error:', error);
        res.apiError('Failed to return iron', 500);
    }
});

// ===== HOSTEL INFORMATION ROUTES =====

// Get Hostel Data
router.get('/hostels', (req, res) => {
    try {
        const hostels = dbManager.database.hostels;
        res.apiSuccess(hostels, 'Hostel information retrieved successfully');

    } catch (error) {
        console.error('Get hostels error:', error);
        res.apiError('Failed to fetch hostel information', 500);
    }
});

// Get Specific Hostel Information
router.get('/hostels/:type/:name', (req, res) => {
    try {
        const { type, name } = req.params;
        const hostel = dbManager.database.hostels[type]?.[name];
        
        if (!hostel) {
            return res.apiError('Hostel not found', 404);
        }
        
        res.apiSuccess(hostel, 'Hostel information retrieved successfully');

    } catch (error) {
        console.error('Get hostel error:', error);
        res.apiError('Failed to fetch hostel information', 500);
    }
});

module.exports = router;
