// middleware/auth.js
const jwt = require('jsonwebtoken');
const dbManager = require('../database');

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ 
            success: false,
            error: 'Access token required',
            message: 'Please provide a valid authentication token'
        });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'dc_management_secret_key', (err, user) => {
        if (err) {
            return res.status(403).json({ 
                success: false,
                error: 'Invalid or expired token',
                message: 'Please log in again'
            });
        }
        
        // Get fresh user data from database
        const dcData = dbManager.getDCById(user.id);
        if (!dcData) {
            return res.status(404).json({
                success: false,
                error: 'User not found',
                message: 'The authenticated user no longer exists'
            });
        }
        
        req.user = user;
        req.dcData = dcData;
        next();
    });
};

// Role-based authorization middleware
const authorizeRole = (roles) => {
    return (req, res, next) => {
        if (!req.dcData) {
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                message: 'User data not available'
            });
        }

        const userRole = req.dcData.role || 'dc';
        if (!roles.includes(userRole)) {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions',
                message: `Role '${userRole}' is not authorized for this action`
            });
        }

        next();
    };
};

// Rate limiting middleware
const rateLimit = (windowMs = 15 * 60 * 1000, maxRequests = 100) => {
    const requests = new Map();

    return (req, res, next) => {
        const clientId = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        const windowStart = now - windowMs;

        // Clean old entries
        const clientRequests = requests.get(clientId) || [];
        const validRequests = clientRequests.filter(time => time > windowStart);

        if (validRequests.length >= maxRequests) {
            return res.status(429).json({
                success: false,
                error: 'Too many requests',
                message: `Maximum ${maxRequests} requests per ${windowMs / 1000} seconds exceeded`,
                retryAfter: Math.ceil(windowMs / 1000)
            });
        }

        validRequests.push(now);
        requests.set(clientId, validRequests);
        next();
    };
};

// Request validation middleware
const validateRequest = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                message: error.details[0].message,
                details: error.details
            });
        }
        next();
    };
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
    console.error('Error occurred:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        timestamp: new Date().toISOString(),
        userAgent: req.headers['user-agent']
    });

    // Multer errors
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            error: 'File too large',
            message: 'Uploaded file exceeds the maximum size limit'
        });
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
            success: false,
            error: 'Invalid file upload',
            message: 'Unexpected file field or too many files'
        });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            error: 'Invalid token',
            message: 'Authentication token is malformed'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            error: 'Token expired',
            message: 'Authentication token has expired'
        });
    }

    // Database errors
    if (err.code === 'ENOENT') {
        return res.status(500).json({
            success: false,
            error: 'Database error',
            message: 'Data file not found'
        });
    }

    // Generic error response
    res.status(err.status || 500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

// Request logging middleware
const requestLogger = (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logData = {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: `${duration}ms`,
            timestamp: new Date().toISOString(),
            userAgent: req.headers['user-agent'],
            ip: req.ip,
            ...(req.user && { userId: req.user.id })
        };
        
        console.log(JSON.stringify(logData));
    });
    
    next();
};

// CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:3001',
            process.env.CORS_ORIGIN
        ].filter(Boolean);
        
        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
    const sanitizeString = (str) => {
        if (typeof str !== 'string') return str;
        return str.replace(/[<>]/g, '').trim();
    };

    const sanitizeObject = (obj) => {
        for (let key in obj) {
            if (typeof obj[key] === 'string') {
                obj[key] = sanitizeString(obj[key]);
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                sanitizeObject(obj[key]);
            }
        }
    };

    if (req.body && typeof req.body === 'object') {
        sanitizeObject(req.body);
    }

    if (req.query && typeof req.query === 'object') {
        sanitizeObject(req.query);
    }

    next();
};

// API versioning middleware
const apiVersion = (version) => {
    return (req, res, next) => {
        req.apiVersion = version;
        res.set('API-Version', version);
        next();
    };
};

// Response formatting middleware
const formatResponse = (req, res, next) => {
    res.apiSuccess = (data, message = 'Success', statusCode = 200) => {
        res.status(statusCode).json({
            success: true,
            message,
            data,
            timestamp: new Date().toISOString(),
            ...(req.apiVersion && { version: req.apiVersion })
        });
    };

    res.apiError = (message, statusCode = 500, details = null) => {
        res.status(statusCode).json({
            success: false,
            error: message,
            ...(details && { details }),
            timestamp: new Date().toISOString(),
            ...(req.apiVersion && { version: req.apiVersion })
        });
    };

    next();
};

module.exports = {
    authenticateToken,
    authorizeRole,
    rateLimit,
    validateRequest,
    errorHandler,
    requestLogger,
    corsOptions,
    sanitizeInput,
    apiVersion,
    formatResponse
};
