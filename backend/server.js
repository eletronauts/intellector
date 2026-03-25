// ═══════════════════════════════════════
// INTELLECTOR BACKEND SERVER
// Securely proxies requests to Gemini API
// ═══════════════════════════════════════

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ═══════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════

// CORS - Allow your frontend domains
app.use(cors({
    origin: [
        'https://intellector-8cf2d.web.app',
        'https://intellector-8cf2d.firebaseapp.com',
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'http://localhost:3001',
        'null' // for local file:// testing
    ],
    methods: ['POST', 'GET'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '10mb' }));

// ═══════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════
app.get('/', function (req, res) {
    res.json({
        status: 'ok',
        service: 'Intellector API',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', function (req, res) {
    res.json({ status: 'healthy' });
});

// ═══════════════════════════════════════
// MAIN CHAT ENDPOINT
// This replaces the direct Gemini API call
// ═══════════════════════════════════════
app.post('/api/chat', async function (req, res) {
    try {
        console.log('📨 Chat request received');

        var contents = req.body.contents;
        var systemInstruction = req.body.systemInstruction;
        var generationConfig = req.body.generationConfig;
        var safetySettings = req.body.safetySettings;

        // Validate request
        if (!contents || !Array.isArray(contents) || contents.length === 0) {
            return res.status(400).json({
                error: {
                    message: 'Invalid request: contents array is required'
                }
            });
        }

        // Build the request body for Gemini
        var geminiBody = {
            contents: contents
        };

        if (systemInstruction) {
            geminiBody.systemInstruction = systemInstruction;
        }

        if (generationConfig) {
            geminiBody.generationConfig = generationConfig;
        }

        if (safetySettings) {
            geminiBody.safetySettings = safetySettings;
        }

        // Call Gemini API (key is safely on server!)
        var geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY;

        var response = await fetch(geminiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(geminiBody)
        });

        var data = await response.json();

        if (!response.ok) {
            console.error('❌ Gemini API error:', data);
            return res.status(response.status).json(data);
        }

        console.log('✅ Gemini response received');
        res.json(data);

    } catch (error) {
        console.error('❌ Server error:', error.message);
        res.status(500).json({
            error: {
                message: 'Server error: ' + error.message
            }
        });
    }
});

// ═══════════════════════════════════════
// RATE LIMITING (Simple, in-memory)
// Prevents abuse of your API key
// ═══════════════════════════════════════
var requestCounts = {};

function rateLimiter(req, res, next) {
    var ip = req.ip || req.connection.remoteAddress || 'unknown';
    var now = Date.now();
    var windowMs = 60000; // 1 minute window
    var maxRequests = 30; // 30 requests per minute

    if (!requestCounts[ip]) {
        requestCounts[ip] = [];
    }

    // Remove old entries
    requestCounts[ip] = requestCounts[ip].filter(function (timestamp) {
        return now - timestamp < windowMs;
    });

    if (requestCounts[ip].length >= maxRequests) {
        return res.status(429).json({
            error: {
                message: 'Too many requests. Please wait a moment.'
            }
        });
    }

    requestCounts[ip].push(now);
    next();
}

// Apply rate limiter to chat endpoint
app.use('/api/chat', rateLimiter);

// Clean up old rate limit entries every 5 minutes
setInterval(function () {
    var now = Date.now();
    Object.keys(requestCounts).forEach(function (ip) {
        requestCounts[ip] = requestCounts[ip].filter(function (t) {
            return now - t < 60000;
        });
        if (requestCounts[ip].length === 0) {
            delete requestCounts[ip];
        }
    });
}, 300000);

// ═══════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════
app.listen(PORT, function () {
    console.log('🚀 Intellector Backend running on port ' + PORT);
    console.log('🔑 Gemini API Key: ' + (GEMINI_API_KEY ? '✅ Loaded' : '❌ MISSING'));
});
