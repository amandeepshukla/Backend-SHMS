// database/index.js
const fs = require('fs');
const path = require('path');

class DatabaseManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data');
        this.ensureDataDirectory();
        this.initializeDatabase();
    }

    ensureDataDirectory() {
        if (!fs.existsSync(this.dataPath)) {
            fs.mkdirSync(this.dataPath, { recursive: true });
        }
    }

    initializeDatabase() {
        this.database = {
            dcs: this.loadData('dcs.json', []),
            students: this.loadData('students.json', this.getDefaultStudents()),
            complaints: this.loadData('complaints.json', this.getDefaultComplaints()),
            ironBorrowing: this.loadData('ironBorrowing.json', this.getDefaultIrons()),
            attendance: this.loadData('attendance.json', []),
            hostels: this.getHostelData()
        };
    }

    loadData(filename, defaultData) {
        const filePath = path.join(this.dataPath, filename);
        try {
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(data);
            } else {
                this.saveData(filename, defaultData);
                return defaultData;
            }
        } catch (error) {
            console.error(`Error loading ${filename}:`, error);
            return defaultData;
        }
    }

    saveData(filename, data) {
        const filePath = path.join(this.dataPath, filename);
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error(`Error saving ${filename}:`, error);
        }
    }

    // Save all data to files
    saveAll() {
        this.saveData('dcs.json', this.database.dcs);
        this.saveData('students.json', this.database.students);
        this.saveData('complaints.json', this.database.complaints);
        this.saveData('ironBorrowing.json', this.database.ironBorrowing);
        this.saveData('attendance.json', this.database.attendance);
    }

    getDefaultStudents() {
        return [
            { id: 1, name: 'Rahul Sharma', rollNumber: 'ST001', hostel: 'himgiri', floor: 'first', room: '101', present: true, email: 'rahul.sharma@university.edu', phone: '9876543210' },
            { id: 2, name: 'Priya Singh', rollNumber: 'ST002', hostel: 'bhagirthi', floor: 'ground', room: '005', present: true, email: 'priya.singh@university.edu', phone: '9876543211' },
            { id: 3, name: 'Amit Kumar', rollNumber: 'ST003', hostel: 'nilgiri', floor: 'second', room: '203', present: false, email: 'amit.kumar@university.edu', phone: '9876543212' },
            { id: 4, name: 'Sneha Patel', rollNumber: 'ST004', hostel: 'narmada', floor: 'first', room: '108', present: true, email: 'sneha.patel@university.edu', phone: '9876543213' },
            { id: 5, name: 'Vikash Yadav', rollNumber: 'ST005', hostel: 'aravali1', floor: 'top', room: '301', present: true, email: 'vikash.yadav@university.edu', phone: '9876543214' }
        ];
    }

    getDefaultComplaints() {
        return [
            {
                id: 1,
                title: 'Room 205 - AC Not Working',
                description: 'The air conditioning unit has been making loud noises and not cooling properly.',
                submittedBy: 'Sarah Johnson',
                room: '205',
                hostel: 'bhagirthi',
                priority: 'High',
                status: 'Open',
                timestamp: new Date(),
                category: 'Maintenance'
            },
            {
                id: 2,
                title: 'Mess Food Quality',
                description: 'Food quality has decreased in the past week. Please check with kitchen staff.',
                submittedBy: 'Mike Chen',
                room: '312',
                hostel: 'himgiri',
                priority: 'Medium',
                status: 'Open',
                timestamp: new Date(),
                category: 'Food'
            },
            {
                id: 3,
                title: 'WiFi Connection Issues',
                description: 'Internet connection is unstable in the evening hours.',
                submittedBy: 'Emma Davis',
                room: '108',
                hostel: 'narmada',
                priority: 'Low',
                status: 'Open',
                timestamp: new Date(),
                category: 'Network'
            }
        ];
    }

    getDefaultIrons() {
        const irons = [];
        for (let i = 1; i <= 20; i++) {
            irons.push({
                ironId: i,
                available: Math.random() > 0.3,
                borrowedBy: Math.random() > 0.3 ? null : `Student ${i}`,
                borrowedAt: Math.random() > 0.3 ? null : new Date(),
                returnBy: Math.random() > 0.3 ? null : new Date(Date.now() + 4 * 60 * 60 * 1000),
                room: Math.random() > 0.3 ? null : `${Math.floor(Math.random() * 3) + 1}0${Math.floor(Math.random() * 9) + 1}`
            });
        }
        return irons;
    }

    getHostelData() {
        return {
            boys: {
                himgiri: { name: 'Himgiri Hostel', capacity: 120, floors: ['ground', 'first', 'second', 'top'] },
                nilgiri: { name: 'Nilgiri Hostel', capacity: 100, floors: ['ground', 'first', 'second', 'top'] },
                aravali1: { name: 'Aravali 1 Hostel', capacity: 150, floors: ['ground', 'first', 'second', 'top'] },
                aravali2: { name: 'Aravali 2 Hostel', capacity: 150, floors: ['ground', 'first', 'second', 'top'] },
                shivalik: { name: 'Shivalik Hostel', capacity: 80, floors: ['ground', 'first', 'second', 'top'] },
                himalaya: { name: 'Himalaya Hostel', capacity: 200, floors: ['ground', 'first', 'second', 'top'] }
            },
            girls: {
                bhagirthi: { name: 'Bhagirthi Hostel', capacity: 120, floors: ['ground', 'first', 'second', 'top'] },
                narmada: { name: 'Narmada Hostel', capacity: 100, floors: ['ground', 'first', 'second', 'top'] },
                godavari: { name: 'Godavari Hostel', capacity: 150, floors: ['ground', 'first', 'second', 'top'] },
                kaveri: { name: 'Kaveri Hostel', capacity: 130, floors: ['ground', 'first', 'second', 'top'] }
            }
        };
    }

    // CRUD operations for DCs
    createDC(dcData) {
        const newDC = {
            id: this.database.dcs.length + 1,
            ...dcData,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        this.database.dcs.push(newDC);
        this.saveData('dcs.json', this.database.dcs);
        return newDC;
    }

    getDCById(id) {
        return this.database.dcs.find(dc => dc.id === id);
    }

    updateDC(id, updateData) {
        const dcIndex = this.database.dcs.findIndex(dc => dc.id === id);
        if (dcIndex !== -1) {
            this.database.dcs[dcIndex] = {
                ...this.database.dcs[dcIndex],
                ...updateData,
                updatedAt: new Date()
            };
            this.saveData('dcs.json', this.database.dcs);
            return this.database.dcs[dcIndex];
        }
        return null;
    }

    // CRUD operations for Students
    createStudent(studentData) {
        const newStudent = {
            id: this.database.students.length + 1,
            ...studentData,
            createdAt: new Date()
        };
        this.database.students.push(newStudent);
        this.saveData('students.json', this.database.students);
        return newStudent;
    }

    getStudentsByHostel(hostel, floor = null) {
        return this.database.students.filter(student => 
            student.hostel === hostel && (floor ? student.floor === floor : true)
        );
    }

    updateStudentAttendance(studentId, present) {
        const student = this.database.students.find(s => s.id === studentId);
        if (student) {
            student.present = present;
            this.saveData('students.json', this.database.students);
        }
        return student;
    }

    // CRUD operations for Complaints
    createComplaint(complaintData) {
        const newComplaint = {
            id: this.database.complaints.length + 1,
            ...complaintData,
            timestamp: new Date(),
            status: 'Open'
        };
        this.database.complaints.push(newComplaint);
        this.saveData('complaints.json', this.database.complaints);
        return newComplaint;
    }

    updateComplaintStatus(id, status) {
        const complaint = this.database.complaints.find(c => c.id === id);
        if (complaint) {
            complaint.status = status;
            complaint.updatedAt = new Date();
            this.saveData('complaints.json', this.database.complaints);
        }
        return complaint;
    }

    // CRUD operations for Iron Borrowing
    borrowIron(ironId, borrowerData) {
        const iron = this.database.ironBorrowing.find(i => i.ironId === ironId);
        if (iron && iron.available) {
            iron.available = false;
            iron.borrowedBy = borrowerData.borrowerName;
            iron.borrowedAt = new Date();
            iron.returnBy = new Date(Date.now() + (borrowerData.duration || 4) * 60 * 60 * 1000);
            iron.room = borrowerData.room;
            this.saveData('ironBorrowing.json', this.database.ironBorrowing);
        }
        return iron;
    }

    returnIron(ironId) {
        const iron = this.database.ironBorrowing.find(i => i.ironId === ironId);
        if (iron && !iron.available) {
            iron.available = true;
            iron.borrowedBy = null;
            iron.borrowedAt = null;
            iron.returnBy = null;
            iron.room = null;
            this.saveData('ironBorrowing.json', this.database.ironBorrowing);
        }
        return iron;
    }

    // Attendance operations
    recordAttendance(attendanceData) {
        const today = new Date().toISOString().split('T')[0];
        const existingAttendance = this.database.attendance.find(
            a => a.studentId === attendanceData.studentId && a.date === today
        );

        if (existingAttendance) {
            existingAttendance.present = attendanceData.present;
            existingAttendance.method = attendanceData.method;
            existingAttendance.updatedAt = new Date();
        } else {
            this.database.attendance.push({
                id: this.database.attendance.length + 1,
                ...attendanceData,
                date: today,
                createdAt: new Date()
            });
        }

        this.saveData('attendance.json', this.database.attendance);
        return this.database.attendance;
    }

    getAttendanceByDate(date) {
        return this.database.attendance.filter(a => a.date === date);
    }

    // Statistics
    getStatistics(hostel = null, floor = null) {
        let students = this.database.students;
        if (hostel) {
            students = students.filter(s => s.hostel === hostel);
        }
        if (floor) {
            students = students.filter(s => s.floor === floor);
        }

        const totalStudents = students.length;
        const presentToday = students.filter(s => s.present).length;
        const ironsBorrowed = this.database.ironBorrowing.filter(i => !i.available).length;
        const availableIrons = this.database.ironBorrowing.filter(i => i.available).length;
        const openComplaints = this.database.complaints.filter(c => c.status === 'Open').length;

        return {
            totalStudents,
            presentToday,
            absentToday: totalStudents - presentToday,
            ironsBorrowed,
            availableIrons,
            openComplaints,
            attendancePercentage: totalStudents > 0 ? ((presentToday / totalStudents) * 100).toFixed(2) : 0
        };
    }
}

// Create singleton instance
const dbManager = new DatabaseManager();

// Auto-save every 5 minutes
setInterval(() => {
    dbManager.saveAll();
}, 5 * 60 * 1000);

// Save on process exit
process.on('SIGINT', () => {
    dbManager.saveAll();
    process.exit(0);
});

module.exports = dbManager;
